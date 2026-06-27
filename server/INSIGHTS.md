# Server — Insights

> Running log of gotchas & lessons learned for `@devdigest/api` (Fastify 5 + Drizzle/Postgres), including `src/modules/repo-intel`.
> Maintained by the `engineering-insights` skill. APPEND-ONLY — add entries, never edit or delete existing ones.

## What Works
<!-- Approaches/solutions that worked -->

## What Doesn't Work
<!-- Dead ends & antipatterns -->

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

## Open Questions
<!-- Still unresolved -->
