# @devdigest/web (client) — AGENTS.md
Next.js 15 studio: import repos, browse PRs, run/read AI reviews, author agents.

## Stack (beyond root)
Next.js 15 App Router · React 19 · TanStack Query · `next-intl` (messages in `messages/<locale>/*.json`) · Tailwind v4 · recharts · mermaid · react-markdown.

## Commands
- `pnpm dev` (:3000) · `pnpm build` · `pnpm start` · `pnpm typecheck`
- `pnpm test` — vitest + jsdom, `fetch` mocked (no API/browser needed).

## Where things live
- `src/app/**/page.tsx` — thin pages; feature logic in colocated `_components/<Name>/` (+ co-located `*.test.tsx`).
- `src/lib/hooks/*` — all data access (TanStack Query) → `src/lib/api.ts`.
- `src/components/app-shell` — nav, breadcrumbs, `g`-then-key shortcuts.
- `src/vendor/shared` (Zod contracts) + `src/vendor/ui` (UI primitives) — vendored copies.

## Conventions (non-default)
- Pages stay thin; never fetch in a page — go through `lib/hooks/*`.
- API base: `NEXT_PUBLIC_API_BASE` (default `http://localhost:3001`), used by `lib/api.ts`.

## Gotchas
- `src/vendor/shared` and `src/vendor/ui` are VENDORED copies — don't edit them to "fix" a type; fix at the source (`server/src/vendor/shared`) if it's a contract.
- Component tests mock `fetch`; they need neither API nor browser. Real browser journeys live in `../e2e`.

## Do-not-touch
- `src/vendor/**` (vendored) · `.next/` (build output).

## Deeper docs — read when the task needs them (not loaded by default)
- [README.md](./README.md) — UI route map
- [docs/](./docs/) — design notes
- [specs/](./specs/) — feature / behaviour specs
- [INSIGHTS.md](./INSIGHTS.md) — running log of gotchas & lessons learned
