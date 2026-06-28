# Conventions Feature — Plan & Specification (L0x)

Extract a repo's de-facto coding conventions with a cheap model, let the user
accept/reject each candidate, then **materialise the accepted ones into one or
more reusable skills** that link to agents through the existing L02 skill→agent
mechanism. Designed independently from requirements + the two provided designs.

---

## 0. What already exists (starter scaffolding — do NOT rebuild)

Verified in the tree on `lessons/lesson2`:

| Thing | Location | Status |
|---|---|---|
| `conventions` table | `server/src/db/schema/knowledge.ts:31` | exists: `rule, evidence_path, evidence_snippet, confidence, accepted` — **extended** in §2 |
| `ConventionCandidate` contract | `server/src/vendor/shared/contracts/knowledge.ts:184` | exists — **extended** in §2 |
| `conventions` feature-model (cheap-model slot) | `platform.ts:73` (`FEATURE_MODELS`) | exists; resolved via `resolveFeatureModel(c, ws, 'conventions')` |
| `repoIntel.getConventionSamples(repoId, n)` | `repo-intel/service.ts:630` | returns top-N ranked files (tests/configs/migrations stripped) |
| Git file read (for evidence check) | `adapters/git/simple-git.ts:129` `readFile(repo, path)` | reads from the local clone |
| Structured model call | `LLMProvider.completeStructured<T>({ schema, schemaName })` (`vendor/shared/adapters.ts:86`) | Zod-validated model output |
| Skill creation | `SkillsService.create()` — `skills` already supports `type:'convention'`, `source:'extracted'`, `evidence_files` | reuse as-is |
| **Skill → agent linking (L02)** | `POST /agents/:id/skills`, `PATCH /agents/:id/skills/:skillId`, `agentsRepo.linkSkill/linkedSkills`; run-executor injects enabled skills into the prompt | reuse as-is — **conventions only produces a skill, linking is unchanged** |
| Repo deep-link fields | `repos`: `owner, name, fullName, defaultBranch, clonePath` (`db/schema/repos.ts`) | for the GitHub URL |

**~50% is scaffolded.** This lesson wires the extractor, the candidate-review
UI, the verification gate, and the candidate→skill materialiser.

---

## 1. Decisions locked (from review with owner)

1. **Both grouping modes.** One UI supports *single merged skill* **and**
   *subset → many skills*. (Design: selection layer over accepted candidates;
   §5.4.)
2. **Editing only in the Create-skill modal** (editable merged skill-body). The
   candidate list is accept/reject + select only — no per-candidate inline edit.
3. **Persist candidates; re-scan replaces ALL.** Candidates persist (accept/reject
   survives reload), but a re-scan **wipes every candidate for the repo and
   regenerates from scratch** (`repository.replaceAll`, per requirement #6). Prior
   accept/reject decisions are **not** carried across a re-scan.
4. **Create-skill adds to the library only.** Linking to an agent stays in the
   existing Agent → Skills tab (decoupled).

---

## 2. Data model changes

### 2.1 Migration — extend `conventions` (generate with `pnpm db:generate`, never hand-edit `db/migrations/**`)

Table is empty in the starter, so column changes are non-destructive in practice.

`server/src/db/schema/knowledge.ts` — `conventions`:

| Column | Change | Why |
|---|---|---|
| `evidence_line integer` | **add** | start line — **computed during verification** (line index where the snippet's first line is found, not model-provided); powers the GitHub deep-link |
| `status text {enum: suggested,accepted,rejected} notNull default 'suggested'` | **add** | three-state; replaces the binary `accepted` so "rejected" ≠ "unjudged" |
| `accepted boolean` | **drop** | superseded by `status` |
| `skill_id uuid → skills.id (onDelete set null)` | **add** | which skill this candidate was materialised into (`null` = not yet) |
| `scan_id uuid → convention_scans.id (onDelete cascade)` | **add** | groups candidates per extraction run |
| `created_at` | **add** (`now()`) | ordering |

### 2.2 New table — `convention_scans` (powers the header line)

```ts
export const conventionScans = pgTable('convention_scans', {
  id: uuid().primaryKey().defaultRandom(),
  workspaceId: uuid().notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  repoId: uuid().notNull().references(() => repos.id, { onDelete: 'cascade' }),
  sampleCount: integer().notNull(),          // "Detected from 84 sample files"
  provider: text().notNull(),
  model: text().notNull(),
  createdAt: now(),                           // "last scan 1h ago"
});
```

### 2.3 Contract additions — `vendor/shared/contracts/knowledge.ts` (edit the **canonical** server copy, then byte-copy to `client/src/vendor/shared/...`)

```ts
export const ConventionStatus = z.enum(['suggested', 'accepted', 'rejected']);

// What the model returns (server-internal; validated by completeStructured).
// Matches the required user-message contract exactly — NO category, NO line.
export const ConventionExtractionItem = z.object({
  rule: z.string(),                 // imperative: "Always…/Never…/Use X instead of Y"
  evidence_path: z.string(),        // relative path
  evidence_snippet: z.string(),     // 2–5 lines of exact code
  confidence: z.number().min(0).max(1),
});
export const ConventionExtraction = z.object({ candidates: z.array(ConventionExtractionItem) });

// Public candidate (replaces the old ConventionCandidate). `evidence_line` is
// COMPUTED by the verification step, not returned by the model.
export const ConventionCandidate = z.object({
  id: z.string(),
  repo_id: z.string(),
  rule: z.string(),
  evidence_path: z.string(),
  evidence_line: z.number().int(),
  evidence_snippet: z.string(),
  evidence_url: z.string(),           // GitHub blob deep-link w/ #Lnn
  confidence: z.number().min(0).max(1),
  status: ConventionStatus,
  skill_id: z.string().nullable(),    // set once materialised
});

export const ConventionScan = z.object({
  id: z.string(), repo_id: z.string(),
  sample_count: z.number().int(), model: z.string(),
  created_at: z.string(),
});
export const ConventionsView = z.object({
  scan: ConventionScan.nullable(),
  candidates: z.array(ConventionCandidate),
});

// Request bodies
export const JudgeConventionBody = z.object({ status: ConventionStatus });
export const JudgeConventionsBody = z.object({ ids: z.array(z.string()), status: ConventionStatus });
export const CreateConventionSkillBody = z.object({
  candidate_ids: z.array(z.string()).min(1),
  name: z.string().min(1),
  description: z.string(),
  type: SkillType.default('convention'),
  enabled: z.boolean().default(true),
  body: z.string().min(1),            // the user-edited merged markdown
});
```

### 2.4 Row types — `server/src/db/rows.ts`

Add `ConventionRow`, `ConventionScanRow` via `$inferSelect`.

---

## 3. Server — new module `modules/conventions/` (mirror `modules/skills/`)

**Module layout:** `extractor.ts` (the pure extraction pipeline — config + sample
reading, the LLM call, Zod parse, evidence verification; takes `samplePaths` in,
returns verified items) · `service.ts` (orchestration: resolve samples + model,
call the extractor, persist, judge, materialise skills) · `repository.ts` ·
`routes.ts` · `helpers.ts` (pure: verify/merge/url/key) · `constants.ts` (prompts).

### 3.1 Repository (`ConventionsRepository`, registered on the container)

Cross-module read surface (the client/agent side never reaches into the folder):

- `createScan(ws, repoId, {sampleCount, provider, model})` → scan row
- `latestScan(repoId)`, `listCandidates(repoId)` (ordered by status then confidence desc)
- `getCandidate(id)`
- `replaceAll(repoId, scanId, items[])` — **LOCKED (requirement #6)**: in one tx, delete every candidate for the repo, then insert the freshly verified set linked to the new `scanId`. A re-scan starts clean; prior accept/reject decisions are discarded. (No cross-scan preservation — §3.4 dropped.)
- `setStatus(id, status)`, `setStatusBulk(ids, status)`
- `setSkillId(ids, skillId)`

### 3.2 Service (`ConventionsService`)

**`extract(ws, repoId)`** — `service` resolves inputs, then calls
`extractor.extract({ repoName, configFiles, samplePaths, readFile, llm, model })`
(steps 1–5 below live in `extractor.ts`; steps 6–8 in `service`):

1. **Config files (code, no model).** Read every present config via `git.readFile`: ESLint (`eslint.config.*`/`.eslintrc*`), `tsconfig.json`, Prettier (`.prettierrc*`/`prettier.config.*`), **Biome (`biome.json`/`biome.jsonc`)**, **`.editorconfig`**. These give explicit conventions without the LLM.
2. **Sample files (code, no model).** `samplePaths = repoIntel.getConventionSamples(repoId, 12)` (passed *into* the extractor for testability); read up to 12 via `git.readFile`. `sampleCount = config + sample files read`.
3. **Build the messages** (`helpers.buildUserMessage`): config + sample files as `### path\n```\n<truncated>\n```` under `constants.SAMPLE_TOKEN_BUDGET` (`PER_FILE_CHAR_CAP` per file).
4. **Cheap-model call.** `{provider, model} = resolveFeatureModel(c, ws, 'conventions')`; `llm = await c.llm(provider)`. `llm.completeStructured({ schema: ConventionExtraction, schemaName: 'conventions', system: CONVENTIONS_SYSTEM, prompt: userMessage, model })`. Model returns `{rule, evidence_path, evidence_snippet, confidence}[]`. (Respects the workspace Settings override — recommend a cheap model, don't hardcode.)
5. **Verify + filter (code, no model) — §3.3.** Drop `confidence ≤ 0.6`; for each survivor read the file from disk and confirm the **first line of `evidence_snippet` literally exists**; drop on fail; set `evidence_line` to the found index. Prevents hallucinated `file:line` references.
6. **Build `evidence_url`** = `https://github.com/{repo.fullName}/blob/{repo.defaultBranch}/{path}#L{line}` (`helpers.buildEvidenceUrl`).
7. **Persist.** `createScan(...)` then `replaceAll(repoId, scanId, verified)` (§3.1 — LOCKED).
8. Return `ConventionsView`.

Other methods: `view(ws, repoId)`; `judge(ws, id, status)`; `judgeBulk(ws, ids, status)`; **`createSkill(ws, repoId, body)`** → load the given `candidate_ids` (must be `accepted`, same repo), call `SkillsService.create({ name, description, type, source:'extracted', enabled, body, evidenceFiles: uniq(paths) })`, then `setSkillId(candidate_ids, skill.id)`; return the `Skill`. Operating on an explicit id list is what gives us **both** grouping modes (all accepted = one merged skill; subset = many skills) with no extra endpoint.

### 3.3 Evidence verification gate (the conventions analogue of the review grounding gate)

Pure, in `helpers.verifyEvidence(fileContent, snippet)` → `{ line } | null`:
- file missing (`git.readFile` throws) → **drop**.
- take the **first non-empty line of `evidence_snippet`** (trimmed); find it literally in the file → return its 1-based line index; not found → **drop**.

This is exactly requirement #5 ("check that the first line of evidence_snippet literally exists"). Mirrors the review rule "*a finding citing a line not in the diff is dropped*" (server/CLAUDE.md). Candidates without real, locatable evidence never reach the UI; `evidence_line` is the returned index.

### 3.4 Re-scan behaviour

LOCKED to **replace-all** (§3.1): a re-scan deletes every candidate for the repo and inserts the fresh verified set as `suggested`. No cross-scan preservation.

### 3.5 Routes (`modules/conventions/routes.ts`, registered in `modules/index.ts`)

| Method | Path | Body | Returns |
|---|---|---|---|
| `POST` | `/repos/:id/conventions/extract` | — | `ConventionsView` (runs the pipeline; "Re-scan" hits the same route) |
| `GET` | `/repos/:id/conventions` | — | `ConventionsView` (latest scan + candidates) |
| `PATCH` | `/repos/:id/conventions/:candidateId` | `JudgeConventionBody` | `ConventionCandidate` (accept/reject one) |
| `POST` | `/repos/:id/conventions/judge` | `JudgeConventionsBody` | `ConventionCandidate[]` (bulk accept/reject) |
| `POST` | `/repos/:id/conventions/skill` | `CreateConventionSkillBody` | `Skill` (materialise selected accepted → skill, set `skill_id`) |

All declare Zod `params`/`body` (validation → 422 before handler), per server conventions.

### 3.6 Constants / prompt (`constants.ts`)

`SAMPLE_FILES = 12`, `SAMPLE_TOKEN_BUDGET`, `PER_FILE_CHAR_CAP`, `MAX_CANDIDATES`, `MIN_CONFIDENCE = 0.6`.

**`CONVENTIONS_SYSTEM` (verbatim from requirements):**
```
You are a code-convention analyst. Analyze the provided code samples and
extract concrete coding conventions consistently followed in this repository.
Return ONLY conventions that: have clear evidence in the provided files,
can be formulated as a specific actionable rule (start with Always/Never/Use X
instead of Y), appear in at least 2 places or are configured explicitly,
would be useful for a code reviewer to enforce.
Do NOT include generic best practices obvious to any TypeScript developer,
things with only 1 example unless in a config file, or framework defaults.
```

**User message (`helpers.buildUserMessage`, verbatim shape):**
```
Repository: {repoName}
Analyze these files and extract coding conventions:
{fileContents}
Return JSON with candidates array: rule (imperative form), evidence_path
(relative path), evidence_snippet (2-5 lines of exact code), confidence
(0.0-1.0). Only include conventions with confidence > 0.6.
```

---

## 4. Client — new repo-scoped surface

Repo-scoped (the screenshot's left-nav "Conventions" + a repo selector).

### 4.1 Routes / pages
- `client/src/app/repos/[repoId]/conventions/page.tsx` — server component → `ConventionsView`.
- Nav: add `{ key:'conventions', label:'Conventions', icon:'ListChecks', href:'/repos/<active>/conventions' }` under the Skills-Lab group in `client/src/vendor/ui/nav.ts`.

### 4.2 Components (`_components/`)
- **`ConventionsView`** — header: *"Conventions in `<repo>`"*, *"Detected from N sample files · last scan …"*, **Re-scan** button (→ `POST .../extract`), **Deselect all · X of Y accepted** counter, **Create skill** button (enabled when ≥1 accepted+selected+unmaterialised). Empty state → "Run analysis".
- **`ConventionCandidateCard`** — italic rule title, `path:line` chip with copy + **click → `evidence_url` (GitHub) in new tab**, snippet code block, confidence bar (green/amber by `MIN_CONFIDENCE`), **Accept/Reject** toggle (`PATCH`), a **selection checkbox** (accepted+unmaterialised only). Materialised → muted `✓ in {skillName}` badge, not selectable.
- **`CreateConventionSkillModal`** — fields per design 2: Name, Description, Type select (default `convention`), Enabled toggle, **editable Skill-body** textarea seeded by merging the *selected* candidates (`helpers.mergeCandidatesToMarkdown`), live token count, footer *"Saved as v1 · added to Skills Lab"*, Cancel / **Create skill** (→ `POST .../skill` with the selected `candidate_ids` + edited body). On success the modal closes, candidates show their skill badge, selection clears.

### 4.3 Selection model (delivers "1 or several skills")
Client-only selection over accepted, unmaterialised candidates; defaults to all selected.
- **All selected, create once** → single merged `<repo>-conventions` skill.
- **Deselect a subset, create; then select the rest, create again** → several skills.
Materialised candidates drop out of the pool, so successive creates partition the accepted set.

### 4.4 Hooks + i18n
- `client/src/hooks/conventions.ts`: `useConventions(repoId)`, `useExtract`, `useJudge`, `useCreateConventionSkill` (mirror `hooks/skills.ts`).
- `client/messages/en/conventions.json`.

---

## 5. Skill body shape (merge output)

```md
# {repo}-conventions

House conventions for `{repo}`. Flag changes that violate any rule below and
cite the offending `file:line`.

## {slug(rule)}
{rule}

Detected in `{evidence_path}:{evidence_line}`:
\`\`\`
{evidence_snippet}
\`\`\`
```
The `##` heading is a slug derived from the rule (`helpers.slugRule`), since the
model no longer returns a category. `evidence_files` = unique evidence paths.
Body is fully user-editable before save.

---

## 6. Seed (`server/src/db/seed.ts`, idempotent)

Seed a `convention_scans` row + a few verified candidates for the demo repo
(one `accepted`, one `suggested`, one `rejected`) so the page renders without a
live model call. No new agent needed — reuse the L02 agents.

---

## 7. Control experiment (acceptance demo)

1. `POST /repos/:id/conventions/extract` on a seeded repo → candidates appear, each with locatable evidence.
2. Accept 3, reject 1 → `POST .../skill` (all accepted) → one `repo-conventions` skill in the library.
3. Link it to an agent via the **existing** Agent → Skills tab.
4. Run a review on a PR that violates a rule → run trace `prompt_assembly.skills` contains the convention block; a finding flags the violation citing `file:line`.
5. **Subset path:** deselect one accepted before create, make skill A; select the rest, make skill B → two skills, candidates partitioned.

**Pass:** ungrounded candidates never surface; accepted-only flow into skills; every card deep-links to real GitHub code; the generated skill changes review output.

---

## 8. Test plan

- **Unit (hermetic, default suite)** — `helpers.test.ts`: `verifyEvidence` (drop on missing file; drop when the snippet's first line isn't literally present; return correct 1-based line when present), confidence ≤ 0.6 filter, `buildEvidenceUrl`, `mergeCandidatesToMarkdown` + `slugRule`, `buildUserMessage` budget/truncation. Edge cases up front: empty samples, zero candidates, duplicate rules, snippet with leading blank lines.
- **Integration (manual-only, gated)** — `server/test/conventions.it.test.ts`, gate `RUN_CONVENTIONS_IT=1` + Docker (mirror `skills-injection.it.test.ts`). `MockLLMProvider` returns a mix of grounded + ungrounded candidates; assert: ungrounded dropped on `extract`; `GET` returns survivors; `PATCH`/judge persists; `POST .../skill` creates a skill, sets `skill_id`, and the skill injects into a review trace via the existing agent-skills wiring; re-scan preserves a judged decision. **Excluded from `pnpm test`.**

---

## 9. Build order (foundation → parallel)

1. **Foundation (serial):** §2 migration (`db:generate`) + contracts (both copies) + rows + `ConventionsRepository` + `helpers.ts` + helper unit tests. Register repo on the container.
2. **Parallel:**
   - (a) **Server** — service (extract pipeline + verification gate), routes, constants/prompt, module registration.
   - (b) **Client** — page, components, hooks, nav, i18n.
   - (c) **Seed + integration test.**
3. **Verify:** unit suite green; run the manual integration test + the §7 control experiment.

Per established workflow: Opus locks this spec; cheaper Sonnet subagents implement against it (foundation first, then the three parallel tracks).

---

## 10. Open risks / watch-list

- **Model invents evidence** → mitigated by the §3.3 gate (drop, don't trust). The grounding gate is the core correctness guarantee.
- **`gpt-5.4` default isn't "cheap"** → the requirement asks for a cheap model; set the workspace `conventions` feature-model to a cheap one (don't hardcode in code).
- **Clone freshness** — verification reads the local clone; if stale vs `defaultBranch`, deep-links may be off by a few lines. Acceptable; `Re-scan` after a refresh re-grounds.
- **Re-scan key drift** — a reworded rule loses its prior judgement (treated as new `suggested`). Acceptable for v1.
- **Contract sync** — `client/src/vendor/shared` must be byte-identical to the server copy (no sync script; copy manually).
