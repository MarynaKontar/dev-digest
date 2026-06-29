---
name: pr-self-review
version: 2.0.0
description: "Orchestrates a local pre-PR self-review. Collects the working diff, classifies changed files into layer buckets (frontend / backend-server / reviewer-core / shared-contracts / migrations / e2e / infra), loads the matching domain skills, runs them against only the changed hunks under a confidence gate, detects vendored shared-contract sync drift, and emits one severity-ranked report. BLOCKS the user from pushing to GitHub if any CRITICAL finding survives. Invoke with /pr-self-review or wire as a pre-push hook."
metadata:
  tags: review, pre-pr, orchestration, diff, gate, devdigest
---

# PR Self-Review

Run **before opening a GitHub Pull Request** (or before `git push` / `gh pr
create`). This skill audits the working diff locally, layer by layer, using the
project's existing domain skills. If any CRITICAL finding survives the
confidence gate, the run ends with a hard **BLOCK** — do not push until fixed.

See `examples.md` for calibrated CRITICAL / HIGH / do-not-flag triplets per
bucket. See `README.md` for the bucket→skill map and the
confidence-vs-severity model.

---

## When to invoke

- Manually: `/pr-self-review` — diff audit on demand.
- Before GitHub: always, ahead of `gh pr create` or `git push`.
- No arguments — the skill diffs the current branch against `main` itself.

---

## Phase 0 — Collect the diff

Run these in order. Capture both the **name list** (for classification) and the
**unified diff with context** (for content analysis). Use `--unified=5` so each
hunk carries 5 lines of context — enough to trace an import target or a missing
`return`.

```bash
# Resolve the branch + base once.
git rev-parse --abbrev-ref HEAD                       # current branch name
git merge-base HEAD main                              # confirm a shared base exists

# Primary: committed work on this branch vs main.
git diff main...HEAD --name-only --diff-filter=ACMRT
git diff main...HEAD --unified=5 --diff-filter=ACMRT
```

**Fallbacks (pick the first that yields files):**

1. No commits yet on the branch but work is staged/unstaged — review the working
   tree against `main`:
   ```bash
   git diff main --name-only --diff-filter=ACMRT
   git diff main --unified=5 --diff-filter=ACMRT
   ```
2. Staged-only mode (user staged a slice and wants just that reviewed):
   ```bash
   git diff --staged --name-only --diff-filter=ACMRT
   git diff --staged --unified=5 --diff-filter=ACMRT
   ```
3. No `main` / detached / shallow clone — last commit only:
   ```bash
   git diff HEAD~1...HEAD --unified=5 --diff-filter=ACMRT
   ```

`--diff-filter=ACMRT` = Added, Copied, Modified, Renamed, Type-changed. Deletions
(`D`) are excluded from content review but **noted** if they remove an exported
symbol from a shared contract (see Phase 2 → shared-contracts).

If the diff is empty, stop: "No changes to review against `main`."

---

## Phase 1 — Classify changed files

Route every path to one or more buckets. **Apply skip rules first** — a skipped
path is removed from all buckets before classification.

### Skip rules (drop these from review entirely)

| Skip when path matches | Why |
|------------------------|-----|
| `**/*.generated.ts`, `**/*.gen.ts`, `**/__generated__/**` | Machine output — fix the generator, not the artifact |
| `**/__mocks__/**`, `**/*.mock.ts`, `**/mocks.ts` | Test doubles — not production behavior |
| `**/*.test.ts`, `**/*.test.tsx`, `**/*.spec.ts`, `**/test/**`, `**/__tests__/**` | Test files — review only for the e2e bucket's light pass; never apply prod-security/arch rules |
| `**/*.snap`, `**/*.lock`, `pnpm-lock.yaml`, `package-lock.json` | Lockfiles / snapshots — no human-authored logic |
| `.claude/skills/**`, `.cursor/skills/**` | Reviewing the reviewer — out of scope, would self-reference |
| `**/dist/**`, `**/.next/**`, `**/build/**`, `**/node_modules/**` | Build output |
| `server/clones/**` | Cloned target repos used by repo-intel — not our source |

> **Vendored shared is NOT skipped.** `client/src/vendor/shared/**` and
> `server/src/vendor/shared/**` look "generated" (they are copies) but a change
> here is high-stakes. Route them to **shared-contracts** and run sync-drift
> detection. Never silently ignore a vendor edit.

### Bucket routing (a file may match several)

| Bucket | Path match |
|--------|-----------|
| **shared-contracts** | `server/src/vendor/shared/**`, `client/src/vendor/shared/**` *(takes precedence — do NOT also put these in frontend/backend)* |
| **migrations** | `server/src/db/migrations/**`, `**/drizzle/**` |
| **frontend** | `client/**` (after vendor + skip removals) |
| **backend-server** | `server/**` (after vendor + migrations + skip removals) |
| **reviewer-core** | `reviewer-core/**` |
| **e2e** | `e2e/**` |
| **infra/config** | `*.json`, `*.yaml`, `*.yml`, `Dockerfile`, `docker-compose*`, `scripts/**`, `.env*` (at any depth, after skip removals) |

Print the classified list before reviewing so the user sees the plan:

```
Classified 9 changed files:
  shared-contracts (1): server/src/vendor/shared/contracts/findings.ts
  backend-server   (3): server/src/modules/reviews/{routes,service,repository.ts}
  frontend         (4): client/src/app/repos/[repoId]/...
  infra/config     (1): docker-compose.yml
  skipped          (2): server/.../service.test.ts, .claude/skills/...
```

---

## Phase 2 — Load skills per bucket and review

For each **non-empty** bucket, load the listed skills in priority order and apply
them to that bucket's changed hunks only. Read whole files only when a check
explicitly needs it (onion import-chain tracing; sync-drift byte compare).

Every check below states **(pattern → severity → DevDigest example)**. A finding
is emitted only if it clears the **confidence gate** (Phase 3). When unsure of a
severity, consult `examples.md`.

### 2A. Frontend bucket → `client/**`

Skills: `frontend-architecture` → `next-best-practices` → `react-best-practices`
→ `typescript-expert` → `zod` → `security`.

| # | Check (pattern → severity) | DevDigest example |
|---|----------------------------|-------------------|
| 1 | Cross-feature import: a component under `client/src/app/<routeA>/_components` imports from another route's `_components` → **MEDIUM** | `app/agents/_components/Foo.tsx` importing `app/repos/[repoId]/_components/Bar.tsx` — hoist the shared piece to `client/src/components/` |
| 2 | File misplaced: reusable widget living in a route's `_components` instead of `client/src/components/` → **MEDIUM** | a generic `RunCostBadge` belongs in `client/src/components/RunCostBadge`, not under one route |
| 3 | `'use client'` on a component that does only data display / no hooks/handlers → **MEDIUM** (needless client bundle); **HIGH** if it forces a server-only import (secret/`fs`) into the client | adding `'use client'` to a page that then imports `server/src/...` |
| 4 | Server-only value reaching the client: secret or server import inside a `'use client'` file, or a non-`NEXT_PUBLIC_` env var read in client code → **CRITICAL** | `process.env.OPENROUTER_API_KEY` referenced in any `client/**` file |
| 5 | `async` route segment using `params`/`searchParams` without `await` (Next 15 — these are async) → **HIGH** | `app/repos/[repoId]/page.tsx` reading `params.repoId` without `await params` |
| 6 | Hook rule break: hook called conditionally / in a loop / after an early `return` → **HIGH** | `useState` after `if (!data) return null` |
| 7 | `useEffect` with a missing/over-broad dep causing a stale closure or refetch loop → **HIGH** if it changes behavior, else **MEDIUM** | effect calling `fetchReviews()` with `[]` deps but reading a changing `pullId` |
| 8 | Missing/unstable `key` on a `.map` (index key on a reorderable list) → **MEDIUM** | findings list keyed by array index |
| 9 | `any` / unsafe cast / `as unknown as` that erases a contract type → **HIGH** if it hides a real shape mismatch, else **MEDIUM** | casting an API response `as ReviewRun` without `safeParse` |
| 10 | Zod schema constructed **inside** a component body (re-created every render) → **MEDIUM** | move `z.object({…})` to module scope |
| 11 | Untrusted API/LLM data fed to the UI without `.safeParse` at the boundary → **HIGH** | `fetch(...).then(r => r.json())` used directly as typed data |
| 12 | `dangerouslySetInnerHTML` without DOMPurify; `href={userValue}` without protocol check → **CRITICAL** (XSS) | rendering LLM-produced markdown/HTML raw in `diff-viewer` |

### 2B. Backend-server bucket → `server/**`

Skills: `onion-architecture` → `fastify-best-practices` → `drizzle-orm-patterns`
→ `postgresql-table-design` → `typescript-expert` → `zod` → `security`.

**Onion layer→folder map (memorize before judging an import violation):**

| Layer | Files in a module | May import |
|-------|-------------------|-----------|
| Delivery (outer) | `modules/<m>/routes.ts`, `app.ts` | service, domain contracts, `_shared` |
| Application | `modules/<m>/service.ts`, `run-executor.ts`, `platform/run-executor.ts` | domain contracts, **port interfaces** (not concrete repos/adapters) |
| Domain (inner) | `vendor/shared/**` (Zod + TS port interfaces), `_shared` schemas | nothing outward |
| Infrastructure (parallel ring) | `modules/<m>/repository.ts`, `repository/*.repo.ts`, `adapters/**` | domain interfaces it implements |
| Composition root | `platform/container.ts` only | **everything** (the one legal cross-layer importer) |

| # | Check (pattern → severity) | DevDigest example |
|---|----------------------------|-------------------|
| 1 | **Delivery imports Infrastructure directly** — `routes.ts` importing a `*.repo.ts` / `repository.ts` / a concrete adapter, bypassing the service → **CRITICAL** (breaks dependency inversion) | `modules/reviews/routes.ts` importing `./repository/run.repo.js` instead of going through `ReviewService` |
| 2 | Inner layer imports outer — `service.ts` importing from `routes.ts`, or a domain contract importing from `modules/**` → **CRITICAL** | `modules/pulls/status.ts` importing `routes.ts` |
| 3 | Service `new`-ing a concrete adapter instead of resolving it from the `container` → **HIGH** (untestable, hidden coupling) | `service.ts` doing `new OpenRouterClient()` rather than `container.llm` |
| 4 | New Fastify route missing Zod schema on `params`/`body`/`querystring` (project uses `withTypeProvider<ZodTypeProvider>()`) → **HIGH** | a `POST` handler reading `req.body` with no `schema: { body: … }` |
| 5 | Route body parsed with `any`/manual cast instead of a Zod contract from `@devdigest/shared` → **HIGH** | `const x = req.body as RunRequest` instead of `RunRequest.parse(req.body)` |
| 6 | Unhandled async rejection in a handler / missing error mapping to `platform/errors.ts` → **HIGH** | awaiting a repo call with no try/catch and no known error adapter |
| 7 | Expensive/fan-out route with no `config.rateLimit` (LLM-triggering endpoints especially) → **HIGH** | a new `/pulls/:id/review`-style route lacking `rateLimit` |
| 8 | N+1: a Drizzle query inside a `for`/`map` over rows instead of a join or `inArray` → **HIGH** if hot path, else **MEDIUM** | looping PRs and querying findings per-PR in `reviews/service.ts` |
| 9 | Multi-table write without a `db.transaction(...)` → **HIGH** (partial-write risk) | inserting a run + its findings in two separate awaits |
| 10 | Raw `sql\`…\`` interpolating a value where the query builder suffices → **HIGH** if value is request-derived (injection), else **MEDIUM** | `sql\`… where id = ${req.params.id}\`` instead of `eq(table.id, …)` |
| 11 | Schema (`db/schema.ts`) FK column with no index; `text` where bounded `varchar(n)` fits; nullable column that is logically required → **MEDIUM** | a new `reviewId` FK without an index |
| 12 | Secret in logs / committed; auth/context check missing on a route that reads another workspace's data → **CRITICAL** | logging the OpenRouter key; a route skipping `getContext(container, req)` workspace scoping |

### 2C. reviewer-core bucket → `reviewer-core/**`

**Pure engine — NO HTTP, NO database.** Do **not** load fastify-best-practices,
drizzle-orm-patterns, or postgresql-table-design here; flagging them is noise.

Skills: `onion-architecture` (Domain/Application reasoning only) →
`typescript-expert` → `zod` → `security`.

| # | Check (pattern → severity) | DevDigest example |
|---|----------------------------|-------------------|
| 1 | Engine reaches outward into the app — any import from `server/**` or `client/**` (the engine must stay a leaf dependency) → **CRITICAL** | `reviewer-core/src/review/run.ts` importing `server/src/...` |
| 2 | Node/server-only API leaking into the pure engine (`fs`, `process.env` for secrets, direct network outside the injected LLM port) → **HIGH** | reading `process.env.OPENROUTER_API_KEY` inside the engine instead of receiving a configured client |
| 3 | LLM output consumed without Zod validation before it becomes a typed finding → **HIGH** | `output/to-review.ts` trusting `JSON.parse(llmText)` with no `safeParse` |
| 4 | `any` on the public engine surface (`index.ts` exports) weakening the diff→findings contract → **HIGH** | export signature returning `any[]` instead of `Finding[]` |
| 5 | Prompt assembly that interpolates raw diff/user content enabling prompt injection of system instructions → **MEDIUM** (note for hardening) | `prompt.ts` concatenating untrusted diff into the system slot |

### 2D. shared-contracts bucket → `vendor/shared/**`

Skills: `zod` → `typescript-expert` **+ mandatory sync-drift detection.**

`@devdigest/shared` is **vendored**: the canonical copy is
`server/src/vendor/shared/**`, mirror-copied to `client/src/vendor/shared/**`.
The two copies **must be byte-identical**. A drift means client and server are
compiling against different contracts.

**Sync-drift procedure (run for every changed vendor file):**

```bash
# For a changed server-side contract, compare against the client mirror (and vice-versa).
diff -u server/src/vendor/shared/contracts/findings.ts \
        client/src/vendor/shared/contracts/findings.ts

# Full sweep — list every file that differs between the two trees:
diff -rq server/src/vendor/shared client/src/vendor/shared
```

| # | Check (pattern → severity) |
|---|----------------------------|
| 1 | A vendor file was edited on **one side only** → the two copies now differ → **CRITICAL sync drift**. Fix: copy the canonical (`server/src/vendor/shared`) version to the client mirror so both are identical. |
| 2 | Breaking change to an exported Zod schema: field **removed**, type **changed/narrowed**, `.strict()` **added**, or a previously-optional field made **required** → **CRITICAL** (breaks both consumers at runtime). Additive optional fields → **MEDIUM**. |
| 3 | Deleted export (`D` in the name list) that other modules still import → **CRITICAL**. Grep both trees for the symbol before clearing it. |
| 4 | New schema lacks `.safeParse` consumers / loses validation at a boundary → **HIGH**. |

> Note: today the two vendor trees already differ on several files (e.g.
> `adapters.ts`, `contracts/trace.ts`). That is exactly the drift class this
> bucket exists to catch — report any such file touched by the current diff.

### 2E. migrations bucket → `**/migrations/**`, `**/drizzle/**`

Skills: `postgresql-table-design` → `drizzle-orm-patterns`.

| # | Check (pattern → severity) |
|---|----------------------------|
| 1 | Irreversible op (`DROP COLUMN`, `DROP TABLE`, `TRUNCATE`) with no explicit data-loss acknowledgement in the PR → **CRITICAL**. |
| 2 | `ALTER TABLE … ADD COLUMN … NOT NULL` with no default on a populated table (fails / locks) → **HIGH**. |
| 3 | `CREATE INDEX` on a large table without `CONCURRENTLY` → **MEDIUM**. |
| 4 | Missing `IF EXISTS` / `IF NOT EXISTS` guard making the migration non-idempotent → **MEDIUM**. |

### 2F. e2e bucket → `e2e/**`

Light pass only. Skill: `typescript-expert`. Flag **HIGH** for an `any` that
disables type-checking on a page object or a hardcoded absolute URL that breaks
the hermetic alt-port setup (5433/3101/3100). Do **not** apply prod security or
architecture rules to test code.

### 2G. infra/config bucket

Skill: `security`.

| # | Check (pattern → severity) |
|---|----------------------------|
| 1 | `docker compose down -v` anywhere in `scripts/**` (destroys the `devdigest_pgdata` volume → loses every imported repo/review) → **CRITICAL**. |
| 2 | Hardcoded secret / credential / API key committed (run the `security` skill's secret-pattern table) → **CRITICAL**. |
| 3 | `.env` / `.env.local` / `.env.production` added to version control → **CRITICAL**. |
| 4 | Production config missing `NODE_ENV=production`; ports exposed beyond 3000/3001 (dev) / 3100-3101/5433 (e2e) → **MEDIUM**. |

---

## Phase 3 — Confidence gate (drop before you aggregate)

Apply **before** listing anything. This is the signal-to-noise control.

| Confidence | Criteria | Action |
|------------|----------|--------|
| **HIGH** | Bad pattern present AND the triggering line/input is visible in the diff | **Keep** |
| **MEDIUM** | Pattern present, but reachability or intent unclear from the hunk | **Keep only if severity is CRITICAL or HIGH**; otherwise **drop** |
| **LOW** | Theoretical, stylistic, or framework-mitigated (e.g. React auto-escaping a plain `{value}`) | **Drop — never listed** |

Hard rules:
- **No finding without a line.** Every kept finding cites `path:lineRange` from a
  real hunk header and maps to a concrete rule in a loaded skill.
- **Do not invent.** If you can't point at the line that proves it, drop it.
- **One pass per (file, skill).** Never double-report the same line under the
  same skill.
- **Respect skip rules.** A finding in a skipped file is dropped regardless of
  severity.

---

## Phase 4 — Aggregate and report

Bucket findings by severity. Each finding carries: file + line range, severity,
the skill that caught it, one-sentence problem, one-sentence/snippet fix.

Collapse LOW to a count when ≥5 ("expand on request"). Print exactly:

```
## PR Self-Review Report
Branch: <branch>  vs  main        Mode: <branch-diff | working-tree | staged>
Files reviewed: <N>   Skipped: <M>
Buckets reviewed: <list>
Skills applied: frontend-architecture, next-best-practices, onion-architecture, zod, security, …
Skipped buckets: reviewer-core (no changes), migrations (no changes)

### CRITICAL  (<count>)
- [ ] [CRITICAL] server/src/modules/reviews/routes.ts:31 (onion-architecture)
      Delivery imports the run repository directly, bypassing ReviewService.
      Fix: call service.runReview(); resolve the repo via the container, not in routes.

### HIGH  (<count>)
- [ ] [HIGH] client/src/app/repos/[repoId]/page.tsx:8 (next-best-practices)
      Reads params.repoId without awaiting params (async in Next 15).
      Fix: const { repoId } = await params;

### MEDIUM  (<count>)
- [ ] ...

### LOW  (<count>)   # collapsed if >= 5
- (5 low-severity style findings — say "expand low" to list)

---
Verdict: ✅ PASS — 0 critical findings. Safe to open the PR.
   — or —
Verdict: 🚫 BLOCK — <N> critical finding(s). Fix before pushing.
```

---

## Phase 5 — Gate decision

**If CRITICAL count > 0:**
- Print the **BLOCK** verdict with the count and the critical list.
- Tell the user verbatim: *"Do NOT run `gh pr create` or `git push` until these
  are resolved."*
- Do **not** offer or run any GitHub command.

**If CRITICAL count == 0:**
- Print the **PASS** verdict.
- Optionally: *"Re-run `/pr-self-review` after addressing HIGH/MEDIUM items."*
- You may proceed to help open the PR.

---

## Execution notes

- **Hunks, not whole files** — review the `--unified=5` diff. Read a full file
  only for onion import-chain tracing or sync-drift byte compares.
- **Reviewer-core is not the server** — never load Fastify/Drizzle/Postgres
  skills against `reviewer-core/**`.
- **Vendor edits always trigger sync-drift detection** — never skip them as
  "generated."
- **Severity ≠ confidence** — severity decides placement and the gate;
  confidence decides whether it's printed at all.
- After the report, invoke `engineering-insights` in END mode if the review
  surfaced a durable, non-obvious lesson (a recurring drift, a layer trap).
