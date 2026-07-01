# Plan: Smart Diff

**Status:** Implemented · 2026-07-01 · reflects shipped code (updated after build)
**Type (Diátaxis):** Explanation + Reference — the Development Plan for the Smart Diff feature.
**Scope:** A deterministic, **token-free** reviewer-ordered diff. The existing "Files changed" tab gains a `Smart order | Original order` toggle. Smart order deterministically classifies each PR file into **core / wiring / boilerplate**, groups them (boilerplate collapsed), and, using the latest review's findings, renders **in-diff severity badges** (suggestion / warning / blocker) with **severity-colored line highlighting**, a per-file **"N findings" badge** (click jumps straight to the offending line), a **"What this does"** summary under **every** file, and a "PR is large — suggested splits" banner. It also adds **cross-tab navigation** (URL-param driven, no reload): a finding's `file:line` on the **Agent runs** tab jumps to that line in the diff, and clicking a diff **severity badge** opens the **Findings** tab with the matching `FindingCard` expanded + highlighted. It composes already-imported `t.prFiles` + already-computed `t.findings` — **no LLM call**. Touches the server `pulls` module (new files + one route), the client `DiffTab` + shared `diff-viewer` (opt-in props only), and the Agent-runs/Findings navigation chain. **One additive shared-contract change** (`finding_markers` added to the pre-existing `SmartDiff`/`SmartDiffResponse` contract, mirrored to both vendored copies).

---

## 1. Goal & scope

**Ships:** `GET /pulls/:id/smart-diff` returning `SmartDiffResponse` (groups sorted core→wiring→boilerplate, `finding_lines` + `finding_markers` per file, `split_suggestion` computed), a deterministic file classifier + its test, and a `DiffTab` toggle that renders the grouped Smart order view reusing the `diff-viewer`, with:
- **In-diff severity badges** (suggestion / warning / blocker) at flagged lines + **severity-colored left-bar line highlighting** (opt-in props on the shared `CodeLine`/`FileCard`).
- A per-file **"N findings" badge** (counts findings, not lines) whose click scrolls to the first offending line via per-line DOM anchors.
- A **"What this does"** summary under **every** file: the review-rationale summary when the file has findings, else a deterministic diff-derived note (declared symbols, else a size note).
- Files with findings **auto-expand**; the "PR is large — suggested splits" banner.
- **Cross-tab navigation (no reload, URL-param driven):**
  - Agent runs tab → diff: a finding's `file:line` (in `FindingMiniCard`) navigates to `?tab=diff&focus=<file>:<line>`; `SmartDiffView` scrolls to that line's anchor.
  - Diff → Findings tab: clicking an inline **severity badge** navigates to `?tab=findings&findingId=<id>`; the run holding that finding opens and its `FindingCard` expands + highlights + scrolls into view.

**Explicitly OUT of scope:**
- Any LLM / model call at the Smart Diff step — `pseudocode_summary` is assembled from *already-computed* finding rationales (or `null`); the no-findings summary fallback is derived deterministically from the patch client-side.
- Any new DB table, migration, or change to `t.prFiles` / `t.findings`. Smart Diff is computed on read.
- Severity-by-side/precise multi-line badge placement beyond one badge per finding anchored at its end line.

---

## 2. Architecture impact

- **Modules/layers touched:** server **delivery** (new route in `pulls/routes.ts`) + a pure **application/domain** composer (`pulls/smart-diff.ts`) + pure classifier (`pulls/classifier.ts`). No new module (fits inside existing `pulls`). No infra/repository change — the route reads `t.prFiles` and `t.findings` via `container.db`, exactly like the on-read aggregate pattern already in this module. Client: `DiffTab` + new route-local `_components` + one data hook + **opt-in props on the shared `diff-viewer`** (`CodeLine`/`FileCard`), plus the **cross-tab navigation chain** in the PR-detail page (`page.tsx` URL params) and the existing Agent-runs / Findings components (`FindingMiniCard`, `RunHistory`, `FindingsTab`, `ReviewRunAccordion`, `FindingsPanel`, `FindingCard`) — all threaded via **optional** callback/id props.
- **Public-contract impact:** **routes — additive only** (one new route `GET /pulls/:id/smart-diff`). **Response contract — additive only:** `finding_markers: SmartDiffFinding[]` (`.default([])`) added to `SmartDiffFile` in `contracts/brief.ts`, where `SmartDiffFinding = { id, severity, start_line, end_line }` (the `id` carries the finding id so a badge click can open its card); mirrored to `client/src/vendor/shared`. Run `/breaking-change` → additive (new route). Run `/response-schema` → **additive** (new optional/defaulted response field, no removals/tightening). No request body/params beyond `IdParams`.
- **Shared component impact:** `CodeLine` and `FileCard` gain **optional** props (`severity`, `badge`, `badgeFindingId`, `onBadgeClick`, `anchorId`, `findingMarkers`, `lineAnchorId`, `onFindingClick`). Original order passes none → its render is byte-identical; the anchor-id scheme is owned by the app (`DiffTab/constants.ts`) and passed *down*, so the diff-viewer stays generic.
- **Navigation impact:** deep-links are **URL search params** on the PR-detail page (`?tab`, `?focus=<file>:<line>`, `?findingId=<id>`) driven by `router.replace` (client-side, no reload). Manual tab switches clear `focus`/`findingId` so they don't re-fire on a revisit.
- **Onion check:** `classifier.ts` and `smart-diff.ts` are pure (no DB/HTTP imports) — the route (delivery) does the DB read and calls the pure composer. Dependencies point inward only.

```mermaid
flowchart TD
  Toggle((Smart order toggle)) --> HOOK[useSmartDiff prId]
  HOOK --> ROUTE[GET /pulls/:id/smart-diff]
  ROUTE --> FILES[(t.prFiles: path, additions, deletions)]
  ROUTE --> SESS[latest review session findings\nBATCH_GAP_MS cluster + isNull dismissedAt\n+ severity]
  FILES --> BUILD[buildSmartDiff files, findings\ndedup files by path]
  SESS --> BUILD
  BUILD --> CLS[classifyFile path -> core|wiring|boilerplate]
  BUILD --> RESP[SmartDiffResponse:\ngroups, finding_lines, finding_markers,\nsplit_suggestion]
  RESP --> VIEW[SmartDiffView: groups + N-findings badge\n+ What-this-does summary + split banner]
  VIEW --> DV[FileCard/CodeLine opt-in:\nseverity highlight + inline badge + line anchor]
  Badge((N findings badge)) -.click.-> ANCHOR[scroll to flagged LINE anchor]
  SevBadge((severity badge)) -.click.-> NAV1[?tab=findings&findingId=id]
  NAV1 --> CARD[ReviewRunAccordion opens →\nFindingCard expands + highlights + scrolls]
  MiniLink((finding file:line\non Agent runs)) -.click.-> NAV2[?tab=diff&focus=file:line]
  NAV2 --> VIEW
```

---

## 3. Relevant insights (from INSIGHTS.md)

**server/INSIGHTS.md**
- **On-read aggregate pattern (follow it exactly):** PR-list score/cost/findings are computed **on read** in `modules/pulls/routes.ts` — one `inArray(prId, prIds)` query over the source table + a JS `Map` grouping pass, no denormalized columns. `buildSmartDiff` must follow this shape: pull `t.prFiles` + latest-session `t.findings` in the route, compose in JS.
- **No review-session id exists.** "Latest session" is approximated by **time-clustering** reviews newest-first with `gap ≤ BATCH_GAP_MS = 90_000` ms — the very heuristic already inline in the `GET /repos/:id/pulls` handler. Reuse that constant + walk for the single-PR case; do NOT invent a new grouping.
- **Open findings only:** filter `isNull(t.findings.dismissedAt)` when collecting `finding_lines` (dismissed findings are excluded, matching the list counters).

**client/INSIGHTS.md**
- **`@testing-library/user-event` is NOT installed** in the client package — the DiffTab test MUST use `fireEvent` from `@testing-library/react`. Importing `userEvent` silently skips the whole file.
- **`noUncheckedIndexedAccess` is on** — guard every indexed access (`arr[0]!`, `?? fallback`), especially when grouping/rendering `groups[]` and `files[]`.
- **`SectionLabel` (`@devdigest/ui`) has a `right?: ReactNode` prop** (renders with `marginLeft:auto`) — put the toggle there in the tab header without a wrapper div; the existing DiffTab already uses `right` for the comments toggle.
- **`Button` accepts `aria-label`** directly — use it for the icon-only badge/jump control.
- **TanStack Query v5:** with `enabled:false` a query's `isLoading` is `false` and `data` is `undefined` → fall through to the empty/original view via `data ?? null`; don't gate on `isLoading` alone.
- **Vendored copy sync applies** — the additive `finding_markers` contract field is edited in the canonical `server/src/vendor/shared/contracts/brief.ts` and must be mirrored byte-for-byte into `client/src/vendor/shared/contracts/brief.ts`.

---

## 4. Work units (disjoint file ownership)

> Client hooks live in **`client/src/hooks/`** (not `client/src/lib/hooks/` as some docs say) — confirmed by `hooks/core.ts`, `hooks/intent.ts`. The i18n `smartDiff` namespace **already exists** in `client/messages/en/prReview.json` (keys: `coreLabel`, `wiringLabel`, `boilerplateLabel`, `largeTitle`, `largeBody`, `filesCount`, `findingLines`, `groupedByRole`) — reuse these; only add the toggle + badge keys.

### Unit 1 — Classifier + module constants (+ classifier test)  ·  *layer: backend*  ·  INLINE-eligible
Pure, fully-specified deterministic code — no exploration needed. Per the playbook spawn-vs-inline rule this is **inline** work (or folded into the Unit 2 backend agent's single exploration pass — see §6).

**Owns (writes only these):**
- `server/src/modules/pulls/constants.ts` (NEW) — the SEPARATE constants file the design mandates. Holds:
  - `BOILERPLATE_PATTERNS`, `WIRING_PATTERNS` — arrays of `RegExp`/matchers (evaluated in order: boilerplate → wiring → else core).
  - `SMART_DIFF_TOO_BIG_LINES` — the split threshold constant (e.g. `600`).
  - Boilerplate = lock-files (`pnpm-lock.yaml`, `package-lock.json`, `yarn.lock`), `dist/`, snapshots (`__snapshots__/`, `*.snap`), migrations (`*.sql`, `**/migrations/**`). Wiring = configs (`*.config.*`, `tsconfig*.json`, `*.json` config, dotfiles) and index/barrel files (`index.ts`, `index.tsx`). Core = everything else.
- `server/src/modules/pulls/classifier.ts` (NEW) — `export function classifyFile(path: string): SmartDiffRole` (`SmartDiffRole` from `@devdigest/shared`). Basename + full-path aware; boilerplate checked first, then wiring, else `'core'`.
- `server/src/modules/pulls/classifier.test.ts` (NEW) — ~15 hermetic cases, 5 per category. MUST include exactly these four:
  - `classifyFile("pnpm-lock.yaml")` → `'boilerplate'`
  - `classifyFile("0001_migration.sql")` → `'boilerplate'`
  - `classifyFile("src/modules/reviews/service.ts")` → `'core'`
  - `classifyFile("src/index.ts")` → `'wiring'`
  - Fill the rest: boilerplate (`package-lock.json`, `dist/bundle.js`, `__snapshots__/Foo.snap`); wiring (`vite.config.ts`, `tsconfig.json`, `client/src/components/x/index.tsx`); core (`client/src/app/page.tsx`, `reviewer-core/src/prompt.ts`, `server/src/platform/container.ts`).

**Required skills:** `typescript-expert`, `zod` (import the `SmartDiffRole` type), `security` (path handling — never trust/execute path strings), `engineering-insights`.
**Done when:** `pnpm exec vitest run --exclude '**/*.it.test.ts'` green in `server/` with the four mandated assertions and all 15 passing; `pnpm typecheck` green.
**Out of scope:** the route, DB access, the composer (Unit 2 imports `SMART_DIFF_TOO_BIG_LINES` + `classifyFile` from here — read-only).

### Unit 2 — Smart-diff composer + route  ·  *layer: backend*  ·  depends on Unit 1
The real backend logic: composing prFiles + latest-session findings into `SmartDiffResponse`. Warrants exploration of the findings-session query → **agent** (or batched with Unit 1 as one backend agent, see §6).

**Owns (writes only these):**
- `server/src/modules/pulls/smart-diff.ts` (NEW) — pure composer:
  `export function buildSmartDiff(files: PrFile[], findings: SmartFinding[]): SmartDiffResponse`
  where `SmartFinding = { id: string; file: string; startLine: number; endLine: number; rationale: string; severity: Severity }` (a local input type; the route maps DB rows to it).
  - **Dedup input files by path** (first occurrence wins, PR order preserved): `t.prFiles` can carry duplicate rows for one path; a diff path is a single unit, so it must yield exactly one `SmartDiffFile` (unique React key + line anchor) and be counted once toward `total_lines`.
  - Classify each file via `classifyFile(file.path)`; build `SmartDiffFile` `{ path, additions, deletions, pseudocode_summary, finding_lines, finding_markers }`.
  - `finding_lines`: distinct sorted line numbers for that file (expand `startLine..endLine`, dedup).
  - `finding_markers`: one `SmartDiffFinding` `{ id, severity, start_line, end_line }` per finding on that file (PR order) — drives the in-diff severity badge (the `id` lets a badge click open that finding's card) + colored highlight.
  - `pseudocode_summary`: deterministic + token-free — join the deduped rationales of that file's findings (cap length); `null` when the file has no findings.
  - `groups`: exactly three `SmartDiffGroup` in fixed order `core → wiring → boilerplate`; files within a group keep PR file order.
  - `split_suggestion`: `total_lines = Σ(additions+deletions)` over deduped files; `too_big = total_lines > SMART_DIFF_TOO_BIG_LINES`; `proposed_splits`: `ProposedSplit[]` grouping **core** files by top-level path segment (e.g. `server`, `client`), each named after that segment; empty when `!too_big`.
- `server/src/modules/pulls/routes.ts` (EDIT — single owner) — add:
  `app.get('/pulls/:id/smart-diff', { schema: { params: IdParams, response: { 200: SmartDiffResponse } } }, async (req): Promise<SmartDiffResponse> => { … })`
  1. `getContext` + resolve the PR (scoped to `workspaceId`), 404 if missing.
  2. Load `t.prFiles` for the PR (`path, additions, deletions` — patch not needed server-side).
  3. **Latest-session findings:** reuse the `BATCH_GAP_MS = 90_000` newest-first clustering already in this file's `GET /repos/:id/pulls` handler, but for the single PR: select this PR's `t.reviews` (`kind='review'`) newest-first, cluster the latest session, then `inArray(t.findings.reviewId, sessionIds)` with `isNull(t.findings.dismissedAt)`; select `id` + `severity` too and map to `SmartFinding` (`id`, `file`, `startLine`, `endLine`, `rationale`, `severity`).
  4. `return buildSmartDiff(files, findings)`.

Also owns `server/src/modules/pulls/smart-diff.test.ts` (NEW) — composer unit tests: fixed group order, path dedup (duplicate rows → one entry, counted once), deduped/sorted `finding_lines` + one `finding_markers` per finding, `pseudocode_summary` null when no findings, and the `too_big` / `proposed_splits` threshold behavior.

**Required skills:** `onion-architecture` (composer pure, DB read in delivery only), `fastify-best-practices` (Zod `params`/`response`, `fastify-type-provider-zod`), `drizzle-orm-patterns` (`inArray` + `isNull` on-read query), `zod`, `typescript-expert`, `security` (workspace-scoped PR lookup — no IDOR), `breaking-change` (confirm the new route is additive), `engineering-insights`.
**Done when:** `GET /pulls/:id/smart-diff` returns a valid `SmartDiffResponse` — groups sorted core→wiring→boilerplate, `finding_lines` + `finding_markers` (with severity) populated from the latest **open** session findings, duplicate file paths deduped, `split_suggestion` computed against the threshold; unknown/foreign PR → 404; `pnpm typecheck` + server unit tests green; `/breaking-change` reports the route additive.
**Out of scope:** editing `constants.ts`/`classifier.ts` (Unit 1 owns them), any client file. The one contract edit (`finding_markers`) is the cross-cutting single-owner step in §5.

### Unit 3 — Client: DiffTab Smart order (toggle + view + badges + banner + hook)  ·  *layer: ui*  ·  depends on Unit 2 route
**Owns (writes only these):**
- `client/src/hooks/smart-diff.ts` (NEW) — `export function useSmartDiff(prId: string | null)` → `useQuery({ enabled: !!prId, queryFn: () => api.get<SmartDiffResponse>(\`/pulls/${prId}/smart-diff\`) })` (mirror `usePullDetail` in `hooks/core.ts`; import `SmartDiffResponse` from `@devdigest/shared`).
- `client/src/app/repos/[repoId]/pulls/[number]/_components/DiffTab/DiffTab.tsx` (EDIT) — add a `Smart order | Original order` toggle in the `SectionLabel` `right` slot (alongside the existing comments toggle). Default **Smart order**. When Smart order: render `<SmartDiffView …>`; when Original: keep today's `<DiffViewer files={files} commenting={commenting} />` unchanged.
- `client/src/app/…/DiffTab/SmartDiffView.tsx` (NEW) — presentational; props `{ groups, splitSuggestion, files, commenting }`. For each group (order core→wiring→boilerplate): a role heading + per-file cards; **boilerplate group collapsed by default**. Per file: a **"N findings" badge** row (when `finding_markers.length > 0`), a **"What this does" summary under every file** (`pseudocode_summary` when present, else deterministic fallback from the patch — `declaredSymbols()` → `summaryDefines`, else `summaryChanges`), then `FileCard` with `findingMarkers` + a `lineAnchorId(path, line)` generator. Reuse `diff-viewer` by matching each `SmartDiffFile.path` back to the `PrFile` (carries `patch`) in `files`. Split banner (`smartDiff.largeTitle`/`largeBody` + `proposed_splits`) above the groups when `split_suggestion.too_big`.
- `client/src/app/…/DiffTab/FindingsBadge.tsx` (NEW) — "N findings" badge counting **findings** (`finding_markers.length`); props `{ count, targetId }`; click `scrollIntoView` on `document.getElementById(targetId)` (the flagged line's row id); `aria-label` on the control; renders nothing when `count <= 0`.
- `client/src/app/…/DiffTab/constants.ts` (NEW) — `ROLE_ORDER: SmartDiffRole[] = ['core','wiring','boilerplate']` + `fileAnchorId(path)` + `lineAnchorId(path, line)` (sanitised DOM ids; no eval).
- `client/src/app/…/DiffTab/styles.ts` (NEW) — group heading / `badgeRow` / split banner / `whatThisDoes` style objects.
- `client/messages/en/prReview.json` (EDIT) — under existing `smartDiff`: add `smartOrder`, `originalOrder`, `findingsBadge` ("{count} findings"), `whatThisDoes`, `summaryDefines` ("Defines {symbols}"), `summaryChanges` ("{additions} added / {deletions} removed lines"). Reuse the already-present keys.
- **Shared diff-viewer (opt-in props — Original order unchanged):**
  - `client/src/components/diff-viewer/CodeLine/CodeLine.tsx` (EDIT) — optional `severity?` (severity-colored inset left-bar highlight), `badge?` (inline suggestion/warning/blocker pill mapped from `CRITICAL→blocker` / `WARNING→warning` / `SUGGESTION→suggestion`), `anchorId?` (row DOM id for line jump).
  - `client/src/components/diff-viewer/FileCard/FileCard.tsx` (EDIT) — optional `findingMarkers?: SmartDiffFinding[]` + `lineAnchorId?: (line) => string`; projects markers onto new-file line numbers (`sevByLine` for highlight — highest severity wins; `badgeByLine` — one badge per finding at its end line); passes `severity`/`badge`/`anchorId` to `CodeLine`; **auto-expands when the file has findings**.
- `client/src/app/…/DiffTab/DiffTab.test.tsx` (NEW) — component test, **`fireEvent`** + mocked hooks (no `userEvent`): (1) default Smart order renders the core heading, the "What this does" summary under every visible file, the "N findings" badge, and passes `finding_markers` to `FileCard`; (2) toggling to Original order shows the flat diff and hides the grouped view/badge/summary; (3) large PR shows the split banner. Guard indexed access.

**Required skills:** `frontend-architecture` (route-local `_components`, thin page, hook in `hooks/`; the shared diff-viewer stays generic via passed-in props), `react-best-practices` (derive don't store — group order/counts/summary computed from data; PascalCase components), `next-best-practices`, `react-testing-library` (`fireEvent`), `typescript-expert`, `zod`, `engineering-insights`.
**Done when:** toggle defaults to Smart order; groups render core→wiring→boilerplate with boilerplate collapsed; flagged lines show severity badges + colored highlight and the file auto-expands; the "N findings" badge counts findings and clicking scrolls to the offending line; every file shows a "What this does" summary; split banner shows for large PRs; Original order is byte-identical to today's DiffTab; `pnpm typecheck` + `pnpm test` green in `client/`.
**Out of scope:** any server file; editing `vendor/**` except the single mirrored `finding_markers` contract change (§5).

### Unit 4 — Cross-tab finding navigation (Agent runs ⇄ diff ⇄ Findings)  ·  *layer: ui*  ·  depends on Units 2 + 3
No-reload deep-linking between the three PR-detail tabs, driven by URL search params. All props added are **optional** so existing call sites are unaffected.

**Owns (edits — additive optional props only):**
- `client/src/app/…/page.tsx` (EDIT) — read `?focus` + `?findingId`; add `goToFileLine(file,line)` → `?tab=diff&focus=file:line` and `goToFinding(id)` → `?tab=findings&findingId=id` (both via `router.replace`, no reload). Pass `focus` → `DiffTab`, `onFindingClick={goToFinding}` → `DiffTab`, `onGoToFile={goToFileLine}` + `focusFindingId={findingId}` → `FindingsTab`. Manual `setTab` clears `focus`/`findingId`.
- **Diff → Findings** (severity badge click): `CodeLine` gains `badgeFindingId?` + `onBadgeClick?` (badge becomes a `<button>` when clickable); `FileCard` gains `onFindingClick?` and stores `{severity,id}` per badge line; `SmartDiffView`/`RoleGroup` thread `onFindingClick` → `FileCard`; `DiffTab` threads it from the page.
- **Diff scroll target** (from a finding's file:line): `DiffTab` + `SmartDiffView` gain `focus?: "path:line"`; `SmartDiffView` `useEffect` scrolls to `lineAnchorId(path,line)` once rendered.
- **Findings expand** (from a diff badge): `FindingsTab` → `ReviewRunAccordion` → `FindingsPanel` → `FindingCard` thread `focusFindingId`. The accordion **opens** when it holds the finding; `FindingsPanel` sets keyboard focus to it, scrolls via the existing `data-finding-id` attribute, and `FindingCard` expands (`defaultExpanded` when `f.id === focusFindingId`) + highlights (`focused`).
- **Agent runs → diff** (finding file:line link): `FindingMiniCard` gains `onGoToFile?` wired to its `MonoLink onClick`; `RunHistory` + `FindingsTab` thread it from the page.
- **Bug fix folded in:** `FindingCard/styles.ts` `card()` uses **fully per-side border longhands** (no `borderColor`/`borderWidth` shorthands) — mixing a shorthand with `borderLeft*` triggers React's "shorthand + non-shorthand" warning when `focused` toggles at runtime (surfaced by this feature's deep-link flipping `focused`).

**Required skills:** `frontend-architecture`, `react-best-practices` (optional props; effects only for the scroll/expand side-effects), `next-best-practices` (URL search params via `useSearchParams` + `router.replace`), `typescript-expert`.
**Done when:** clicking a finding's `file:line` on Agent runs lands on the diff (Smart order) scrolled to the line; clicking a diff severity badge lands on Findings with the right `FindingCard` open + highlighted + scrolled; no full reload; existing call sites (PR list `FindingMiniCard`, Original order) unchanged; the React style warning is gone; `pnpm typecheck` + `pnpm test` green in `client/`.
**Out of scope:** any server file; any contract change (reuses `finding_markers.id` from Unit 2).

---

## 5. Cross-cutting / shared files (single-owner)

- **Vendored shared contracts — ONE additive edit, mirrored to both copies.** `SmartDiff` / `SmartDiffResponse` already existed; the build added `SmartDiffFinding { id, severity, start_line, end_line }` and a `finding_markers: z.array(SmartDiffFinding).default([])` field on `SmartDiffFile` to carry per-finding severity (for the in-diff badges + highlight) and the finding `id` (so a badge click can open that finding's card on the Findings tab). `brief.ts` imports `Severity` from `./findings.js`. Edited in the CANONICAL copy `server/src/vendor/shared/contracts/brief.ts` **and mirrored byte-for-byte** to `client/src/vendor/shared/contracts/brief.ts` (both re-exported via each `index.ts` barrel). `finding_lines` is retained (unchanged). This supersedes the earlier "no per-file severity field / count-only badge" decision — the design's severity badges required it.
- **`server/src/vendor/shared/contracts/brief.ts` + `client/src/vendor/shared/contracts/brief.ts`** — the two copies MUST stay in sync (drift check: the `SmartDiffFinding`/`finding_markers` block is identical).
- **`server/src/modules/pulls/routes.ts`** — single owner: **Unit 2** only.
- **`server/src/modules/pulls/constants.ts`** — single owner: **Unit 1** only (Unit 2 imports read-only).
- **`client/messages/en/prReview.json`** — single owner: **Unit 3** only.
- **`client/src/components/diff-viewer/{CodeLine,FileCard}`** — edited by **Units 3 + 4** with **optional** props only; all other diff-viewer files and all existing call sites (Original order) are untouched.
- **`client/src/app/…/pulls/[number]/page.tsx`** — single owner: **Unit 4** (URL-param routing + the two `goToX` handlers).
- **Agent-runs / Findings components** (`FindingMiniCard`, `RunHistory`, `FindingsTab`, `ReviewRunAccordion`, `FindingsPanel`, `FindingCard` + its `styles.ts`) — edited by **Unit 4** with optional props / the border-longhand fix only.

---

## 6. Execution order & token strategy

Serial, one unit at a time (main working tree, no worktrees — matches the repo's current `implementer` flow).

| Wave | Unit(s) | Gate unlocked |
|---|---|---|
| **Wave 1** | Unit 1 (classifier + constants + test) | `classifyFile`, `SMART_DIFF_TOO_BIG_LINES` |
| **Wave 2** | Unit 2 (composer + route) | `GET /pulls/:id/smart-diff` |
| **Wave 3** | Unit 3 (client DiffTab Smart order) | UI toggle + grouped view |

**Spawn-vs-inline (per `docs/agent-workflow-playbook.md`):**
- **Unit 1 is INLINE-eligible** — pure, fully specified (exact patterns + exact test cases). Do it inline, or fold it into the Unit 2 agent since both share the same exploration surface (the `pulls` module). **Recommended:** one **sonnet** backend agent owning Units 1+2 together (pay the `pulls`-module + findings-clustering exploration once); the classifier is trivial within that pass.
- **Unit 3 is a single sonnet** client agent (needs `diff-viewer` + `DiffTab` + hooks exploration; multi-file UI against the spec).
- **Contract change:** a single additive edit (`finding_markers`) folded into the backend (canonical `brief.ts`) + client mirror — no separate agent. (The initial build shipped without it; it was added when realising the design's severity badges.)
- **Model right-sizing:** planning = opus (this doc); implementation = **sonnet** ×2 (backend batch, client); no opus for build-out; no haiku needed. Hand each agent the exact paths + signatures below so it explores minimally.

---

## 7. End-to-end verification

1. `pnpm exec vitest run --exclude '**/*.it.test.ts'` in `server/` — classifier's 15 cases (incl. the 4 mandated) + composer tests (order, dedup, `finding_markers`, thresholds) green; `pnpm typecheck` green.
2. `./scripts/dev.sh` smoke (Postgres + API :3001 + web :3000).
3. `curl :3001/pulls/<id>/smart-diff` → `SmartDiffResponse` with groups core→wiring→boilerplate, `finding_lines` + `finding_markers` (severity) for flagged files, deduped paths, `split_suggestion.too_big` correct for a large PR.
4. Web: open a PR → Files changed → toggle **Smart order**: files grouped, boilerplate collapsed; flagged lines show severity badges (suggestion/warning/blocker) + colored highlight and the file auto-expands; the "N findings" badge counts findings and clicking scrolls to the offending line; every file shows a "What this does" summary; split banner on a large PR; toggle **Original order** → unchanged flat diff; `pnpm test` + `pnpm typecheck` green in `client/`.
5. **Cross-tab navigation:** on **Agent runs**, click a finding's `file:line` → lands on Files changed (Smart order) scrolled to that line. On the diff, click a **severity badge** → lands on **Findings** with the right run open and the `FindingCard` expanded + highlighted + scrolled. Both are client-side (no reload); no React "shorthand + non-shorthand" style warning in the console.
6. Contract gates: `/breaking-change` → additive (one new route); `/response-schema` → **additive** (`finding_markers` is a new defaulted response field; no removals/tightening); vendored `brief.ts` copies in sync.

---

## 8. Risks / notes

- **Latest-session findings** rely on the 90 s time-cluster heuristic (no session id in schema) — same approximation the PR-list counters use; acceptable and consistent. If a `review_session_id` column ever lands, replace both.
- **No review yet** → `finding_markers`/`finding_lines` empty everywhere, no severity badges/highlights, and the "What this does" summary falls back to the deterministic diff-derived note; grouping + split banner are review-independent. This is the "works right after PR import, no model call" promise.
- **Jump-to-line is line-level:** the badge scrolls to the offending line via a per-line DOM anchor set on the flagged `CodeLine` row (the app owns the id scheme and passes it into the diff-viewer). Flagged files auto-expand so the target is rendered; if a user manually collapses the card, the scroll is a no-op.
- **Duplicate `t.prFiles` rows** (a real import-data condition — the original DiffViewer tolerated them via index keys) are deduped by path in `buildSmartDiff` so paths yield unique keys/anchors and `total_lines` counts once. Fixing the duplicate rows at the import layer is a separate, out-of-scope change.
- **Summaries are strictly token-free:** `pseudocode_summary` is assembled from existing finding rationales (never an LLM call); the no-findings fallback (`declaredSymbols` → size note) is derived from the patch on the client. No model call at any point.
- **Cross-tab navigation is mount-time + URL-driven:** switching tabs unmounts/remounts the target tab, so the `focus`/`findingId` deep-link is consumed on the fresh mount (accordion open, card expand, scroll effects). `router.replace` avoids a history entry and a reload; manual tab switches clear the params so they don't re-fire. Scroll is a no-op if the target row/card isn't rendered (e.g. a manually-collapsed file).
- **FindingCard border was a latent shorthand/longhand bug:** `card()` mixed the `borderColor`/`borderWidth` shorthands with `borderLeft*` longhands. It never fired until this feature toggled `focused` at runtime (the diff-badge deep-link). Fixed to fully per-side longhands; keep it that way for any future edits to that style.

<!-- Originally built via planner (read-only exploration); updated post-build to reflect the shipped code. Key facts: SmartDiff/SmartDiffResponse contract pre-existed (brief.ts, review-api.ts:64) and gained an additive finding_markers field ({id,severity,start_line,end_line}) mirrored to both vendored copies; BATCH_GAP_MS clustering + isNull(dismissedAt) live in modules/pulls/routes.ts; buildSmartDiff dedups files by path; client hooks in client/src/hooks/; smartDiff i18n namespace extended; diff-viewer CodeLine/FileCard gained opt-in severity/badge/anchor/finding-click props; Unit 4 adds URL-param cross-tab navigation (Agent runs file:line → diff, diff severity badge → Findings card) via page.tsx + optional props through FindingMiniCard/RunHistory/FindingsTab/ReviewRunAccordion/FindingsPanel/FindingCard, plus a FindingCard border longhand fix; user-event not installed (fireEvent). -->
