# Client — Insights

> Running log of gotchas & lessons learned for `@devdigest/web` (Next.js 15 studio).
> Maintained by the `engineering-insights` skill. APPEND-ONLY — add entries, never edit or delete existing ones.

## What Works
<!-- Approaches/solutions that worked -->
- Client-side `BATCH_GAP_MS = 90_000` clustering in `PRSeverityFindings`: sort `ReviewRecord[]` DESC by `created_at`, take the newest ms, keep only reviews within 90s, then flatten findings. Without this, concurrent agent sessions (3 agents ran at the same timestamp) silently show 0 findings because the single "latest-by-date" review happens to hold none.
- Multi-line clamp in inline JSX: `{ display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }` — all three properties are required together. Omit any one and the clamp silently does nothing.

## What Doesn't Work
<!-- Dead ends & antipatterns -->
- `overflow: hidden` on `tableCard` (or any ancestor card) clips `position: absolute` dropdown children — the card visually cuts them off at its bottom edge. Fix: set `overflow: visible` on the card AND add explicit `borderTopLeftRadius`/`borderTopRightRadius` to `headRow` (the element that needs the rounded-top visual). The border-radius itself does NOT require `overflow: hidden`.
- Passing per-severity filtering to `PRSeverityFindings` (one panel per clicked severity) adds complexity for no UX gain — the design shows all findings together. One unified panel sorted CRITICAL → WARNING → SUGGESTION is simpler and matches the design intent.

## Codebase Patterns
<!-- Conventions, architectural decisions -->
- `RunHistory` (Agent Runs timeline) gets findings detail via `reviews?: ReviewRecord[]` passed from `FindingsTab` (which fetches via `useReviews(prId)`). `RunSummary` only carries `findings_count`/`blockers` — no per-finding data. To render per-run severity badges, match the `ReviewRecord` by `run_id` in `RunHistory`. Do NOT add `findings_by_severity` to `RunSummary` — it would need a server-contract change and a server-side aggregation query.
- The PR-list table is a CSS grid; columns live in TWO places that must stay in sync: `pulls/constants.ts` `GRID` (track widths) and `COLUMN_KEYS` (header labels, read from `messages/en/prReview.json` `list.columns`). Cells render in `PRRow.tsx` in the SAME order. Adding a column = add a track to `GRID` + a key to `COLUMN_KEYS` (correct position) + an i18n label + a cell in `PRRow.tsx`. Miss the grid track and every cell after it shifts.
- Cost display rule (whole app): money is nullable and `null → "—"`, real `0 → "$0.00"` — they must look different ("—" = no data: failed/un-priced/pre-tracking run). Centralized in `lib/cost.ts` `formatCost()`; reuse it, don't reimplement. `<RunCostBadge>` (`components/RunCostBadge`) wraps it: `variant="compact"` (PR list) and `variant="withTokens"` (timeline: `"N tok · $x"`, shows "—" when no tokens AND no cost).

## Tool & Library Notes
<!-- Dependency quirks -->
- `src/vendor/shared/contracts` is a COPY of `server/src/vendor/shared/contracts`. A contract change (e.g. adding `cost_usd` to `RunSummary`/`RunStats`/`PrMeta`) must be applied IDENTICALLY to both copies or types drift between client and server. Edit both in the same change; don't "fix" the client copy alone.

## Recurring Errors & Fixes
<!-- Repeated error + the fix -->
- `noUncheckedIndexedAccess` in tsconfig causes `arr[0]` to type as `T | undefined` even in tests — always use `arr[0]!` when you know the element exists, or `find()` + a `expect(x).toBeDefined()` guard. Pattern seen in SkillCard.test.tsx and SkillsTab.test.tsx.
- TS5076: `'??' and '||' operations cannot be mixed without parentheses` — always parenthesise: `(a ?? b) || c`, not `a ?? b || c`. Seen in disabled props that combine optional booleans (`isPending?: boolean`) with additional conditions.
- `screen.getByText("X")` fails when a modal has both a heading and a button with the same label (e.g., "Create skill"). Use `getAllByText("X").length >= 1` or `getAllByRole("button").find(b => b.textContent?.includes("X"))` for the submit button specifically.

## Session Notes
<!-- Datestamped session summaries -->
- 2026-06-28 — Conventions feature (L0x) client-side implementation: `hooks/conventions.ts` (5 hooks: useConventions, useExtract, useJudge, useJudgeBulk, useCreateConventionSkill), nav entry (`ListChecks` icon, gKey `c`, repo-scoped `/repos/:repoId/conventions`), `/repos/[repoId]/conventions/page.tsx` thin route, `ConventionsView` (header + selection bar + empty state), `ConventionCandidateCard` (italic rule, path:line chip with copy + GitHub link, confidence bar, Accept/Reject toggle, selection checkbox), `CreateConventionSkillModal` (merged skill body pre-seeded from selected candidates, `mergeCandidatesToMarkdown` + `slugRule` helpers), updated `messages/en/conventions.json`. Typecheck clean, all 58 existing tests pass. Key gotcha: mixing `??` and `||` without parentheses is a TS error (`TS5076`) — always write `(a ?? b) || c`.
- 2026-06-28 — Skills feature (L02) client-side implementation: `hooks/skills.ts` (12 hooks mirroring agents.ts), nav entry (`Sparkles` icon, gKey `s`), `/skills` list page + `SkillCard` + `CreateSkillModal` + `ImportSkillModal`, `/skills/[id]` editor (Config/Preview/Stats/Versions tabs, `Donut` recharts), Agent Editor `SkillsTab` (up/down reorder, no dnd lib). 22 new files. i18n extended in `messages/en/skills.json`. All 58 tests pass, typecheck clean. Multipart import uses raw `fetch` (bypasses `apiFetch`'s `application/json` content-type injection). The `CATEGORY_COLORS` array needs `?? fallback` on indexed access due to `noUncheckedIndexedAccess`.
- 2026-06-22 — findings-by-severity feature: severity badges on PR list + 400px floating dropdown (`position: absolute`) showing ALL findings from the latest batch session (`PRSeverityFindings`, no per-severity filter). Same pattern added to Agent Runs timeline (`RunHistory` via `reviews` prop). New component: `FindingMiniCard` (compact, always-visible 3-line rationale, colored left border). `PRRow` switched from Fragment to single div; expansion state simplified to `expandedPrId: string | null` in `page.tsx`. `tableCard` changed to `overflow: visible`. Spec updated at `server/specs/findings-by-severity-pr-list.md`.
- 2026-06-21 — Added per-run cost UI on three surfaces: PR-list `COST` column (`PRRow.tsx` + `constants.ts` grid), Agent-runs timeline (`RunHistory.tsx`, `withTokens` badge under the timestamp on settled runs), and the Run Trace Stats block (`TraceBody.tsx`, a `COST` `Stat` tile between TOKENS and FINDINGS). New: `lib/cost.ts` (`formatCost`) + `components/RunCostBadge`. Contract fields mirrored from `server/src/vendor/shared`.

## Open Questions
<!-- Still unresolved -->
<!-- 2026-06-28 conventions session: no open questions remaining. -->
