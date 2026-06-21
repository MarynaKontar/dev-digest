# DevDigest — CLAUDE.md

**Local-first AI pull-request reviewer.** Add a GitHub repo → import its PRs → run an "agent" (model + system prompt) that reviews the diff and returns structured, line-grounded findings (severity + score).

> ⚠️ **This repo is a COURSE STARTER TEMPLATE, not the finished product.** It does one thing end-to-end (import a PR + review it); lessons L01–L08 each add one feature back. This explains most "incomplete" things: empty DB tables, unused prompt slots — all intentional.

## Packages (standalone — NO monorepo workspace)
Each has its own package.json + lockfile. Cross-package code is shared via tsconfig path aliases, not published modules.

| Folder | Package | What | Port |
|---|---|---|---|
| `server/` | `@devdigest/api` | Fastify 5 + Drizzle/Postgres (pgvector) | 3001 |
| `client/` | `@devdigest/web` | Next.js 15 studio | 3000 |
| `reviewer-core/` | `@devdigest/reviewer-core` | Pure engine: diff→prompt→LLM→findings | — |
| `e2e/` | `@devdigest/e2e` | Deterministic browser e2e (agent-browser) | — |

- `@devdigest/shared` (Zod contracts) is VENDORED: canonical copy at `server/src/vendor/shared`, copied into `client/src/vendor/shared`. Not a published package.
- `repo-intel` (codebase indexer behind the "Indexed" badge) lives INSIDE the server at `server/src/modules/repo-intel`.
- `reviewer-core` is consumed as TypeScript SOURCE via path alias (never emits JS).

## Stack (top level)
Node ≥22 · pnpm ≥10 · Docker (Postgres only) · TypeScript run as source via tsx (no build step in dev).

## Commands
- `./scripts/dev.sh` — from zero: Postgres + API :3001 + web :3000, migrate + seed.
- `./scripts/e2e.sh` — hermetic e2e on alt ports (5433/3101/3100); never touches dev DB.
- Per-package commands live in each module's CLAUDE.md.

## Do-not-touch (global)
- NEVER `docker compose down -v` — `-v` deletes the `devdigest_pgdata` volume and every imported repo/review.
- Migrations are NOT applied on boot — run `pnpm db:migrate` manually.

## Module maps (loaded only when you work in that subtree)
- [server/CLAUDE.md](./server/CLAUDE.md) · [client/CLAUDE.md](./client/CLAUDE.md) · [reviewer-core/CLAUDE.md](./reviewer-core/CLAUDE.md) · [e2e/CLAUDE.md](./e2e/CLAUDE.md)

## Deeper docs — read when the task needs them (not loaded by default)
- [README.md](./README.md) — full architecture + diagrams + lesson plan
- [TESTING.md](./TESTING.md) — test strategy across all packages
- [docs/](./docs/) — agent prompts & design notes
