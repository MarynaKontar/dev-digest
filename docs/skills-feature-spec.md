# Skills Feature — Plan & Specification (L02)

> **Status:** spec / not implemented. Lesson 2 (`lessons/lesson2`).
> **Goal:** Reusable, user-editable **skills** (pure-text review rules) that attach
> to multiple agents, are injected as an ordered block in the review prompt, and
> are visible in the run trace. Plus two demo agents and a control experiment that
> proves skills change review outcomes.

A **skill** = `name + description + type + markdown body`. It carries **no model,
no provider, no tools** — only text and the config we already have. The
description is the skill's *interface*, written **directively** (an instruction to
the agent), surfaced in the UI with a helper caption.

---

## 0. What already exists (starter scaffolding — do NOT rebuild)

| Layer | Already present | File |
|---|---|---|
| DB tables | `skills`, `skill_versions`, `agent_skills` (`order` only), `agent_versions` | `server/src/db/schema/skills.ts`, `agents.ts` |
| Contracts | `Skill`, `SkillType`, `SkillSource`, `AgentSkillLink`, `CommunitySkill` | `server/src/vendor/shared/contracts/knowledge.ts` |
| Agent↔skill linking | `linkSkill` / `setSkills` / `linkedSkills` / `skillIdsForAgent`; ordered skill IDs snapshotted into `agent_versions` | `server/src/modules/agents/repository.ts`, `service.ts`, `routes.ts` |
| Prompt slot | `assemblePrompt` joins skill bodies → `## Skills / rules` block; `PromptAssembly.skills` field exists | `reviewer-core/src/prompt.ts:88-109`, `vendor/shared/contracts/trace.ts:41` |
| Trace UI | Renders `prompt_assembly.skills` as its own colored block | `client/.../RunTraceDrawer/_components/TraceBody/TraceBody.tsx:76` |
| Agent editor shell | Tabbed editor (`Config` only today), tab in `?tab=`; ready for a `Skills` tab | `client/src/app/agents/[id]/_components/AgentEditor/*` |

**Implication:** the prompt-injection plumbing and the agent-side link API are
done. The missing pieces are: a **skills server module**, **per-link enable**,
**wiring skills into the run**, the **whole client surface**, and **seed + import**.

---

## 1. Decisions locked (from review with owner)

1. **Per-agent enable** — add `enabled` boolean to `agent_skills`. Two switches:
   - `skills.enabled` (Skills page card) = library-level "usable at all".
   - `agent_skills.enabled` (Agent → Skills tab) = per-agent on/off.
   - Run injects links where **both** are true.
2. **Import** — accept a `.md` file **or** a `.zip`; for zip, extract only the
   markdown core (`SKILL.md` / first `*.md`), **drop scripts/executables**.
   Parse → preview → confirm → save. Nothing executed.
3. **Versioning** — mirror agents: a body/config change bumps `skills.version`
   and snapshots into `skill_versions`. Skill editor gets a **Versions** tab.
4. **Process** — this document is the plan; implementation follows on approval.

---

## 2. Data model changes

### 2.1 Migration — `agent_skills.enabled`
`server/src/db/schema/agents.ts`:
```ts
export const agentSkills = pgTable('agent_skills', {
  agentId: uuid('agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' }),
  skillId: uuid('skill_id').notNull().references(() => skills.id, { onDelete: 'cascade' }),
  order: integer('order').notNull().default(0),
  enabled: boolean('enabled').notNull().default(true), // NEW
}, (t) => ({ pk: primaryKey({ columns: [t.agentId, t.skillId] }) }));
```
Then `pnpm db:generate` → new `0011_*.sql` (do **not** hand-edit migrations) →
`pnpm db:migrate`. The `skills` table already matches the contract.

**Also add `note` to `skill_versions`** (`server/src/db/schema/skills.ts`) — the
Versions tab shows a human change-message per snapshot ("Tightened scope rule…"),
which the current schema can't store:
```ts
note: text('note').notNull().default(''), // NEW — change message shown in Versions tab
```

### 2.2 Contract additions (`server/src/vendor/shared/contracts/knowledge.ts`)
- Extend `AgentSkillLink` with `enabled: z.boolean()`.
- Add `SkillVersion` (`skill_id`, `version`, `body`, `note`, `created_at`).
- Add `SkillImportPreview` (parsed-but-unsaved skill: `name`, `description`,
  `type`, `body`, `source`, `dropped_files: string[]`, `token_estimate`).
- Add `SkillStats` (for the Stats tab): `used_by: number`,
  `agents: { id, name }[]`, `pull_rate: number`, `accept_rate: number`,
  `findings_30d: number`, `by_category: { category, count }[]`.
- Re-export from `vendor/shared/index.ts`.
- **After editing the canonical copy, re-sync the vendored copy** into
  `client/src/vendor/shared` (the repo's vendoring step; drift is caught by
  pr-self-review).

### 2.3 Row types (`server/src/db/rows.ts`)
Add `SkillRow`, `SkillVersionRow`, `AgentSkillRow` via `$inferSelect`.

---

## 3. Server — new module `modules/skills/` (mirror `modules/agents/`)

Files: `routes.ts`, `service.ts`, `repository.ts`, `helpers.ts`, `constants.ts`
(+ co-located `*.test.ts`). Register in `modules/index.ts` (static, not autoload).
Workspace-scoped throughout, via `getContext`.

### 3.1 Repository (`SkillsRepository`)
- `list(workspaceId)`, `getById(workspaceId, id)`, `insert(...)`,
  `update(workspaceId, id, patch)`, `deleteById(workspaceId, id)`.
- `update` reuses the agent pattern: a **body change** (not just `enabled`)
  bumps `version` and writes `skill_versions` (`snapshotVersion`), storing the
  optional change `note` from the save.
- `insert` writes `skill_versions` v1 (note: "Initial").
- `listVersions(skillId)`, `getVersion(skillId, version)`.
- `restore(workspaceId, skillId, version)` — copy an old version's body into the
  skill as a **new** version (Restore button); never mutates history.
- `agentCount(skillId)` + `agentsUsing(skillId)` — for "3 agents" and the
  "Agents using this skill" list.
- `stats(skillId)` — aggregates for the Stats tab (see §3.6 for the data source).

### 3.2 Service (`SkillsService`)
- `list / get / create / update / delete / listVersions / getVersion / restore / stats`.
- `importFromUpload(file)` → returns a `SkillImportPreview` (no DB write).
  See §3.4. `create` then persists the confirmed preview.

### 3.3 Routes
```
GET    /skills                       → list (workspace-scoped)
GET    /skills/:id                   → one
POST   /skills                       → create (manual OR confirmed import)
PUT    /skills/:id                   → update / toggle enabled (versions body, takes note)
DELETE /skills/:id                   → delete (cascade unlinks agent_skills)
GET    /skills/:id/versions          → history (newest first, with note + date)
GET    /skills/:id/versions/:version → one snapshot (for Diff)
POST   /skills/:id/versions/:version/restore → restore old body as a new version
GET    /skills/:id/stats             → Stats tab payload (SkillStats)
POST   /skills/import                → multipart upload → SkillImportPreview (no save)
```
Zod `body`/`params` on every route (project convention: validation before handler).
`type`/`source` validated against the existing enums. `body` `min(1)`.

### 3.4 Import pipeline (`helpers.ts`, pure + testable)
1. Accept multipart upload (register `@fastify/multipart` on this route group;
   confirm it isn't already registered globally before adding).
2. **`.md`** → body = file text; `name` from first `# H1` or filename;
   `description` from first paragraph / front-matter; `source = 'imported_url'`.
3. **`.zip`** → unzip in memory (`adm-zip` or `unzipper`); pick `SKILL.md` else
   first `*.md`; collect every non-markdown path into `dropped_files`;
   **never write or execute** any entry; `source = 'community'`.
4. Compute `token_estimate` via the container's tokenizer adapter.
5. Return `SkillImportPreview`. The client shows it; **save only on confirm**
   (a normal `POST /skills`). Trust note (UI copy): an imported skill is
   *someone else's instructions in your agent's prompt*.

### 3.5 Agent side — extend existing endpoints (small)
The Agent → Skills tab (see §5.4) is **one checklist over the whole library**:
every skill is a row with a checkbox (= enabled for this agent) and a drag handle
(= order). So the natural persistence is a **single bulk save** of the full
ordered list with each row's enabled flag:
- Change `POST /agents/:id/skills` to also accept
  `{ skills: [{ skill_id, order, enabled }] }` (superset of today's `skill_ids`).
  It upserts a row per checked skill (enabled=true) and either disables or removes
  unchecked ones; order = list index. Keeping disabled rows (enabled=false)
  preserves their place when re-checked.
- `agent_skills` link DTO now includes `enabled`; `linkedSkills` returns it.
- Optional convenience: `PATCH /agents/:id/skills/:skillId { enabled }` for a
  single fast toggle (the control experiment), if we don't want a full save.
- `agent_versions` snapshot: keep storing the ordered **enabled** skill IDs (so a
  version replay reproduces exactly what was injected).

### 3.6 Stats tab — data source (be honest about scope)
- **Real & cheap (implement):** `used_by` + `agents` list — a `COUNT`/join on
  `agent_skills`. These are accurate and drive the "Agents using this skill" panel
  and the card's "N agents".
- **Needs attribution we don't have:** `pull_rate`, `accept_rate`, `findings_30d`,
  `by_category`. Findings are not tagged with the skill that produced them, so
  true per-skill rates aren't derivable from the current schema. For L02, pick one:
  - **(a) Seed illustrative numbers** into the demo data and render them (simplest,
    matches the mock; label them as demo). **← recommended for the lesson.**
  - (b) Approximate from `agent_runs` of agents that link the skill (coarse, can
    mislead).
  - (c) Add real attribution (tag findings by skill) — a later lesson, out of L02.
  > Note: the mock's "Findings by category" shows `$` amounts — that's a reused
  > cost widget; treat it as a **count**-per-category donut here.

---

## 4. Wiring skills into the review run

`server/src/modules/reviews/run-executor.ts` (today `skills: null` at the failure
trace, and the success path never loads skills):

1. Before calling `reviewPullRequest`, load the agent's **enabled** linked skills
   (link.enabled && skill.enabled), ordered by `order`:
   ```ts
   const links = await this.container.agentsRepo.linkedSkills(agent.id); // ordered
   const skillBodies = links
     .filter((l) => l.enabled && l.skill.enabled)
     .map((l) => l.skill.body);
   ```
   *(Access skills/links through a repository on the container — never reach into
   another module's folder. Add `agentsRepo` / `skillsRepo` to the container if not
   already exposed; follow the existing `repoIntel`/`runBus` pattern.)*
2. Pass `...(skillBodies.length ? { skills: skillBodies } : {})` into
   `reviewPullRequest`. `assemblePrompt` already emits the `## Skills / rules`
   block and sets `assembly.skills`.
3. `prompt_assembly: outcome.assembly` already flows to the trace → the **enabled
   skills block shows in the run trace; disabled skills are absent** (acceptance).
4. Log a line: `runLog.info('skills: N enabled block(s) injected (~T tokens)')`.
5. Fix the failure-path `traceFromBuffer` to reflect resolved skills too (cosmetic).

No reviewer-core change required — the slot already exists (keep the package pure).

---

## 5. Client — new surface (mirror the agents UI)

### 5.1 Data hooks — `client/src/hooks/skills.ts`
`useSkills`, `useSkill(id)`, `useCreateSkill`, `useUpdateSkill`, `useDeleteSkill`,
`useSkillVersions(id)`, `useRestoreSkillVersion`, `useSkillStats(id)`,
`useImportSkill` (multipart POST → preview), and agent-side
`useAgentSkills(agentId)` / `useSetAgentSkills` (bulk ordered+enabled) /
`useToggleAgentSkill`. Export from `hooks/index.ts`. Same TanStack patterns as
`hooks/agents.ts`.

### 5.2 Skills list page — `client/src/app/skills/page.tsx` + `_components/`
- `SkillsListView` — grid of `SkillCard`s (name, type badge, source badge,
  description, **enabled toggle**, `N agents` / pull% / accept% stats as in the
  mock). Search box. Click a card → side **preview** panel (rendered markdown,
  "Rendered as the reviewing agent receives it").
- `AddSkillDropdown` — "Add Skill ▾" with **Create** / **Import**.
- `CreateSkillModal` — name / description (with directive-interface caption) /
  type / markdown body. Mirror `CreateAgentModal`.
- `ImportSkillModal` — file picker (`.md`/`.zip`) → calls `/skills/import` →
  shows `SkillImportPreview` (parsed body + `dropped_files` list + token est. +
  **trust warning**) → **Save** persists, **Cancel** discards.

### 5.3 Skill editor — `client/src/app/skills/[id]/page.tsx` + `SkillEditor`
Tabs (mirror `AgentEditor` tab shell; **Evals is out of scope for L02**):
- **Config** — name / description (directive-interface caption) / type / markdown
  body, `Enabled` switch, `vN` badge, token count.
- **Preview** — rendered markdown ("Rendered as the reviewing agent receives it").
- **Stats** (`StatsTab`) — KPI cards (Used by · Pull freq · Accept rate donut ·
  Findings 30d), an **Agents using this skill** list (each row links to that
  agent), and a **Findings by category** donut. Data from `GET /skills/:id/stats`
  (see §3.6 — `used_by`/agents real, the rest seeded for L02). Reuse `recharts`
  (already a client dep).
- **Versions** (`VersionsTab`) — "Version history · N versions". One row per
  snapshot: `vN` badge, change **note**, date; newest tagged **Current**; older
  rows get **Diff** (compare bodies, render with a markdown/text diff) and
  **Restore** (`POST …/restore` → new version). Caption: "Every save snapshots the
  body so eval runs stay reproducible against the exact text they scored."

### 5.4 Agent editor — new **Skills** tab  *(updated to match the design)*
`client/src/app/agents/[id]/_components/AgentEditor/_components/SkillsTab/`:
- Add `{ key: 'skills', ... }` to `AgentEditor/constants.ts` `TABS` and render it.
- **One checklist over the entire skill library** (not an attach-picker). Header:
  "Skills · 3 of 6 enabled" + a "Filter skills…" box + caption "Order matters —
  earlier skills appear earlier in the assembled prompt. Drag to reorder."
- Each row = drag handle (≡) · **checkbox** (= enabled for this agent) · skill name
  · type badge. Checked rows are the ones injected into the prompt, in list order.
- Persist via the bulk `POST /agents/:id/skills` (ordered list + enabled per row);
  optional single-toggle `PATCH` for the fast on/off used in the experiment.

### 5.5 Navigation
The sidebar lives in `client/src/vendor/ui/nav.ts` (vendored). Add a
`{ key: 'skills', label: 'Skills', icon: 'Sparkles', href: '/skills', gKey: 's' }`
entry + shortcut. **Note:** `vendor/**` is "do-not-touch" for *type fixes* — a
nav entry is a real content change; make it at the canonical source and re-vendor
(confirm where `vendor/ui` is sourced from before editing). Also extend
`app-shell/helpers.ts` active-route detection (`/skills` → `skills`).

### 5.6 i18n
Add a `skills` namespace under `client/messages/<locale>/` (labels, captions,
trust warning, tab labels), mirroring the `agents` namespace.

---

## 6. Seed data (`server/src/db/seed.ts`, idempotent)

Two demo agents, **each with linked skills**, at least one skill via the import
path:
- **Test Quality Reviewer** — flags untested branches, missing corner cases,
  over-mocking, flaky patterns. Skills: e.g. `test-coverage-nudge` (manual) +
  one **imported** skill.
- **API Contract Reviewer** — flags breaking route/signature changes. Skills:
  e.g. `api-contract-gate`.
- Seed `pr-self-review` skills coverage: the existing `pr-self-review` agent
  exists with auto-invoke off; ensure it links both a frontend and a backend
  skill so a manual run pulls both (final-check item).
- Seed must be **idempotent** (upsert by name+workspace) per `db:seed` contract.

---

## 7. Control experiment (acceptance demo)

| Agent | PR fixture | Without skills | With skills |
|---|---|---|---|
| Test Quality | test covering only happy-path | misses the uncovered branch | flags uncovered branch + boundary case |
| API Contract | route signature change | misses it | detects breaking change |

Procedure: run agent with its skill **disabled** (per-link toggle) vs **enabled**;
open the run **trace → prompt assembly**; confirm the **Skills block + added
tokens** appear only when enabled.

### Concrete repro steps (using the seeded demo data)

**Pre-condition:** `pnpm db:seed` has been run; the app is running (`./scripts/dev.sh`).
Use seeded **PR #482** (`acme/payments-api` → *Add rate limiting to public API endpoints*).

#### Baseline — "without skills" run
1. In the Agent editor for **Test Quality Reviewer** (or **API Contract Reviewer**),
   open the **Skills** tab.
2. Uncheck (disable) the key skill for that agent:
   - Test Quality Reviewer → uncheck **Test Coverage Nudge**.
   - API Contract Reviewer → uncheck **API Contract Gate**.
   *(Or call `PATCH /agents/:id/skills/:skillId { "enabled": false }` directly.)*
3. Open PR #482 → click **Run Review** → select the agent → wait for completion.
4. Click the run row → **Trace** drawer → **Prompt assembly** tab.
   Confirm: the `## Skills / rules` block is **absent**; token count is lower.
5. Note the findings: the agent will likely miss the uncovered branch / contract gap.

#### Experiment — "with skills" run
6. Re-enable the skill in the Agent → Skills tab (check the box, save).
7. Run the same agent on PR #482 again.
8. Open the new run's **Trace → Prompt assembly**:
   - Confirm the `## Skills / rules` block is **present**.
   - Confirm the token count is higher by the skill body's token estimate.
9. Compare findings: the agent should now flag the missing test branch (Test Quality)
   or the breaking route change (API Contract) that it missed in step 5.

#### Pass criteria
- Trace shows the Skills block iff the link is enabled.
- Disabling the link (not the skill library entry) is sufficient to remove it.
- The run that injected skills produces at least one additional finding relevant to
  the skill's rubric.

---

## 8. Acceptance checklist (from requirements)

- [ ] `pr-self-review` exists with auto-invoke off; manual run pulls **both**
      frontend and backend skills.
- [ ] A skill can be **created and edited** in the UI.
- [ ] Both new agents have **linked skills**.
- [ ] **Enabled** skill appears as its own block in the trace; **disabled** does not.
- [ ] Import went **through preview**; executable parts were **not** run.
- [ ] Control experiment reproduces on **both** agents.

---

## 9. Test plan

- **Server unit:** import parser (`.md` happy path, `.zip` picks `SKILL.md`,
  drops executables, lists `dropped_files`); version-bump rule (body change bumps,
  enable toggle does not); DTO mappers.
- **Server integration (`*.it.test.ts`, testcontainers):** skills CRUD +
  versions; `agent_skills.enabled` round-trip; run-executor injects only
  doubly-enabled skills (assert `prompt_assembly.skills`).
- **reviewer-core:** existing prompt tests already cover the skills block; add one
  asserting order is preserved.
- **Client (vitest + jsdom, fetch mocked):** SkillCard toggle, CreateSkillModal,
  ImportSkillModal preview/confirm, Agent SkillsTab enable/reorder.
- **e2e (optional):** deterministic create-skill → attach-to-agent → run → see
  block in trace.

---

## 10. Build order (suggested)

1. Migration (`agent_skills.enabled`) + contracts + rows + re-vendor.
2. `modules/skills` repo/service/routes (CRUD + versions) + tests.
3. Import endpoint + parser + tests.
4. Run-executor wiring (skills injected) + integration test.
5. Agent-side `enabled` toggle endpoint + repo updates.
6. Client hooks → Skills page → Skill editor → Agent Skills tab → nav/i18n.
7. Seed (agents + skills + one import) + experiment fixtures.
8. Full acceptance pass + pr-self-review.

## 11. Open risks / watch-list

- **Multipart**: confirm `@fastify/multipart` registration scope; add a sane
  size limit; reject non-`.md`/`.zip`.
- **Vendor nav edit**: locate the canonical `vendor/ui` source before touching
  `nav.ts`; otherwise the change is clobbered on next vendor sync.
- **Container access**: expose skills/agents repos on the container rather than
  importing across modules (onion/hexagonal rule).
- **Token budget**: many enabled skills can blow the prompt; log token estimate,
  consider a soft cap later (out of scope for L02).
- **`source` enum**: `.zip`→`community`, `.md`→`imported_url` is a convention
  choice; adjust if the lesson narrative prefers otherwise.
