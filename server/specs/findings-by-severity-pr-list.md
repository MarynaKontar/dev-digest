# Spec: Findings-by-Severity counters on the PR list and Agent Runs timeline

**Status:** Implemented
**Date:** 2026-06-21 (revised 2026-06-22)
**Scope:** `server/` (PR list route + contract) and `client/` (PR list UI + Agent Runs timeline)

## Summary

Each PR row in the list (`/repos/:repoId/pulls`) gains a dedicated **Findings** column
showing severity counters — e.g. **`⚠ 2 · ◇ 1`** — derived from that PR's **latest review
session**, counting only **open** (not-dismissed) findings. Clicking any counter opens a
compact **floating dropdown panel** showing **all findings** (all severities together, sorted
CRITICAL → WARNING → SUGGESTION) for that PR's latest session. Clicking again collapses.

The same severity badges + dropdown panel are also added to each run row in the Agent Runs
timeline (`/repos/:repoId/pulls/:number?tab=findings`), showing findings for that specific
run.

## Locked decisions

| Decision | Choice |
|---|---|
| Click behavior | Any severity badge opens **one unified panel** showing ALL findings (not filtered by severity) |
| Panel appearance | **Floating dropdown** (`position: absolute`, `width: 400px`, `z-index: 50`) anchored below the findings cell — overlays rows beneath, does NOT expand the table |
| Count scope | Latest review **session** per PR — findings **summed across all reviews within the same 90s batch** (`BATCH_GAP_MS = 90_000`), not just the review with the newest timestamp |
| Client-side session clustering | `PRSeverityFindings` also applies the 90s batch clustering when filtering reviews from `usePrReviews`, so counters and panel always reflect the same session |
| Dismissed findings | Excluded (`dismissed_at IS NULL`) |
| Counter placement | **Dedicated column** ("Findings") in the row grid |
| Expansion concurrency | **One panel open at a time** across the whole list; clicking any badge when panel is open collapses it |
| Empty / unreviewed PR | Show nothing (no counters, no marker) |
| Finding card style | **`FindingMiniCard`** (new compact component) — always-visible rationale (3-line clamp), no expand/collapse, no accept/dismiss actions |
| Agent Runs scope | Per-run findings derived client-side from `ReviewRecord[]` passed to `RunHistory` as `reviews` prop |
| tableCard overflow | Changed to `overflow: visible` so the dropdown is not clipped; `headRow` gets explicit `borderTopLeftRadius`/`borderTopRightRadius` to preserve the card appearance |

## Behavior details

### PR list panel

- Counters render **only for severities with count > 0**. Unreviewed PRs show an empty Findings cell.
- Each counter is a clickable `SeverityBadge` (`compact` + `count`). All badges in a row share the same toggle: any click opens/closes the same panel. All badges show `aria-pressed={isExpanded}`.
- Expansion state: `string | null` (just `prId`) held in `page.tsx`. Opening one PR closes any other.
- The panel renders as `position: absolute` inside the findings cell div (`position: relative`), appearing below the badges and overlaying subsequent rows.
- The panel lazily fetches via `usePrReviews(prId, { enabled: true })`, clusters reviews by the 90s batch heuristic, collects all non-dismissed findings from that session, sorts CRITICAL → WARNING → SUGGESTION, and renders `FindingMiniCard`s with a "N FINDINGS" header.
- `tableCard` uses `overflow: visible` (was `hidden`) so the dropdown is not clipped at the card's bottom edge.

### Agent Runs timeline panel

- `RunHistory` accepts `reviews?: ReviewRecord[]`. For each settled run, the matching `ReviewRecord` is found via `run_id`, non-dismissed findings are counted per severity.
- Severity badges render in the same style as the PR list. Any badge click toggles a `position: absolute` dropdown anchored within the badges wrapper (`position: relative`), showing all findings for that run with a "N FINDINGS IN THIS RUN" header.
- Expansion state: `string | null` (`runId`) local to `RunHistory`. One run open at a time.
- `FindingsTab` passes `runs: ReviewRecord[]` as `reviews` to `RunHistory`.

---

## Implementation

### 1. Contract — `PrMeta`

**File:** `server/src/vendor/shared/contracts/platform.ts`

```ts
findings_by_severity: z
  .object({
    CRITICAL: z.number().int(),
    WARNING: z.number().int(),
    SUGGESTION: z.number().int(),
  })
  .nullish(),
```

Vendored into `client/src/vendor/shared/contracts/platform.ts`.

### 2. Server — PR list route

**File:** `server/src/modules/pulls/routes.ts` (`GET /repos/:id/pulls`)

- Latest-review-per-PR loop clusters reviews into sessions using `BATCH_GAP_MS = 90_000`.
- One bulk query (`inArray` + `isNull(dismissedAt)`) counts findings per `(reviewId, severity)`.
- Results accumulated into `findingsByPr: Map<prId, { CRITICAL, WARNING, SUGGESTION }>` and returned as `findings_by_severity` on each `PrMeta`.

### 3. Client — `FindingMiniCard` component

**File:** `client/src/app/repos/[repoId]/pulls/_components/FindingMiniCard/FindingMiniCard.tsx`

Compact card: colored left border by severity, title + severity badge + category tag on one line, `file:line` + confidence on next line, rationale always visible with `-webkit-line-clamp: 3`. No expand/collapse, no actions.

### 4. Client — `PRSeverityFindings` component

**File:** `client/src/app/repos/[repoId]/pulls/_components/PRSeverityFindings/PRSeverityFindings.tsx`

- Props: `prId: string` (no `severity` — shows all findings).
- Applies 90s batch clustering to reviews from `usePrReviews`.
- Renders "N FINDINGS" header + `FindingMiniCard` list sorted CRITICAL → WARNING → SUGGESTION.

### 5. Client — `PRRow`

**File:** `client/src/app/repos/[repoId]/pulls/_components/PRRow/PRRow.tsx`

- Props: `pr`, `repoId`, `isExpanded: boolean`, `onToggle: (prId: string) => void`.
- Returns a single row div (no Fragment). All severity badges call `onToggle(prId)`.
- Findings cell has `position: relative`; the panel renders as `position: absolute` inside it.

### 6. Client — PR list page

**File:** `client/src/app/repos/[repoId]/pulls/page.tsx`

- Expansion state: `expandedPrId: string | null`.
- `handleToggle(prId)`: toggle collapse/expand.

### 7. Client — `styles.ts`

**File:** `client/src/app/repos/[repoId]/pulls/styles.ts`

- `tableCard`: `overflow: visible` (was `hidden`).
- `headRow`: `borderTopLeftRadius: 10, borderTopRightRadius: 10` added.
- `findingsCell`: `display: flex, gap: 6, alignItems: center`.

### 8. Client — `RunHistory`

**File:** `client/src/app/repos/[repoId]/pulls/[number]/_components/RunHistory/RunHistory.tsx`

- New prop: `reviews?: ReviewRecord[]`.
- Expansion state: `expandedRunId: string | null` (local).
- For settled runs with findings: renders severity badges + `position: absolute` dropdown panel with "N FINDINGS IN THIS RUN" header and `FindingMiniCard`s.

### 9. Client — `FindingsTab`

**File:** `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsTab/FindingsTab.tsx`

- Passes `reviews={runs}` to `RunHistory`.

---

## Known issues found and fixed during implementation

1. **Single-review bug**: Original `PRSeverityFindings` picked only the newest single review. When multiple agents run concurrently, the "latest by timestamp" often has 0 findings. Fixed by applying the same 90s batch clustering server-side.

2. **Panel overflow clipping**: `tableCard`'s `overflow: hidden` was clipping the absolute-positioned dropdown at the card's bottom edge. Fixed by changing to `overflow: visible`.

3. **Per-severity filtering removed**: Initial implementation filtered the panel by the clicked severity. Design screenshots show all findings in one unified panel. Simplified to show all findings regardless of which badge was clicked.

---

## Testing

- **Client (RTL + vitest):** `PRRow.test.tsx` — counters render with correct counts; only `count > 0` severities appear; clicking a counter does NOT navigate; first click opens panel, second collapses; all badges share the same toggle; opening another row closes the first.
- **Manual:** verify PR list dropdown shows all findings from latest batch session; verify Agent Runs timeline shows per-run findings dropdown.
