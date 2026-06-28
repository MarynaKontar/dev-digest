# Server — Insights

> Running log of gotchas & lessons learned for `@devdigest/api` (Fastify 5 + Drizzle/Postgres), including `src/modules/repo-intel`.
> Maintained by the `engineering-insights` skill. APPEND-ONLY — add entries, never edit or delete existing ones.

## What Works
<!-- Approaches/solutions that worked -->
- `@fastify/multipart` v10 works with Fastify v5. Register it INSIDE a route plugin (not globally) to scope it; `req.file()` is then available within that plugin scope. Always call `data.toBuffer()` before any throwing validation to avoid "Request is aborted" errors from unconsumed streams.
- Drizzle `jsonb('col').$type<string[]>()` infers the insert type as `string[] | null | undefined` — pass the value directly (no `as object` cast). Casting to `object` is rejected by Drizzle's overloaded insert signatures.
- `adm-zip` v0.5.17 ships its own `@types/adm-zip` is still needed separately (it does NOT ship built-in `.d.ts` at this version). Install `pnpm add -D @types/adm-zip`.

## What Doesn't Work
<!-- Dead ends & antipatterns -->
- Block comments (`/* ... */` and `/** ... */`) that contain `*/` inside a string literal (e.g. `'**/*.it.test.ts'`) prematurely close the comment — TypeScript reports baffling "Expression expected" / "Unterminated string literal" errors on the NEXT non-comment line. Use line comments (`//`) or escape the `*/` sequence in JSDoc copy.
- Drizzle `jsonb` insert: do NOT cast `string[] | null` to `object | null` — Drizzle's overloaded `.values()` doesn't accept the generic `object` type and will error with a confusing "no overload matches" message. Pass the typed value directly.

## Codebase Patterns
<!-- Conventions, architectural decisions -->
- `reviewer-core` already returns generation cost: `reviewPullRequest()` → `ReviewOutcome.costUsd` (real provider `usage.cost` when present, else price-book estimate). It is computed for free on every run — don't recompute cost server-side; capture `outcome.costUsd` in `run-executor.ts`. (Before the run-cost feature, the executor destructured only `{ tokensIn, tokensOut, grounding }` and silently dropped it.)
- PR-list aggregate columns (score, cost) are computed ON-READ in the `GET /pulls` handler (`modules/pulls/routes.ts`), NOT stored denormalized: one `inArray(prId, prIds)` query over the source table + a JS `Map` grouping pass, then merged into each row. Follow this same shape for any new per-PR aggregate.
- There is no review-session / batch id in the schema. "Cost of the latest review" is approximated by time-clustering `agent_runs` (newest-first, `status='done'`, gap ≤ `BATCH_GAP_MS` = 90s). Replace with exact grouping if a `review_session_id` column is ever added.

## Tool & Library Notes
<!-- Dependency quirks -->

## Recurring Errors & Fixes
<!-- Repeated error + the fix -->
- Adding a NON-optional field to an `agent_runs` write means updating EVERY `completeAgentRun` call site, not just the happy path: `run-executor.ts` has the success path PLUS `failAll` and failure/cancel branches and the `traceFromBuffer` synthetic stats, AND the wrapper signature in `modules/reviews/repository.ts`. Miss one → typecheck fails (or a branch writes a row missing the field). Grep `completeAgentRun` before assuming you've got them all.

## Session Notes
<!-- Datestamped session summaries -->
- 2026-06-21 — Re-introduced per-run cost (USD). Added nullable `costUsd` (`cost_usd` double precision) to `agent_runs` via generated migration `0010_chemical_skreet.sql` (`pnpm db:generate` then `pnpm db:migrate` — migrations are NOT applied on boot). Captured `outcome.costUsd` in `run-executor.ts`, persisted in `run.repo.completeAgentRun`, surfaced on `RunStats`/`RunSummary`/`PrMeta` contracts (`vendor/shared`), summed latest-batch per PR in `GET /pulls`. `cost_usd` is nullable everywhere so missing data stays distinct from a real $0.
- 2026-06-28 — Implemented full Skills feature server-side (L02). New module `modules/skills/` (routes/service/repository/helpers/constants + unit tests). Extended `POST /agents/:id/skills` with bulk `{ skills: [{skill_id, order, enabled}] }` form; added `PATCH /agents/:id/skills/:skillId { enabled }` toggle. Import pipeline: `@fastify/multipart` v10 + `adm-zip` for zip extraction. Wired skills into `run-executor.ts`: `linkedSkills` join already returns `skill.enabled`, filter on both flags, inject bodies via `{ skills: skillBodies }`. `container.skillsRepo` added. Typecheck + all 124 unit tests green.

## Open Questions
<!-- Still unresolved -->
