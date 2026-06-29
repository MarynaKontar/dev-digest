# @devdigest/e2e — AGENTS.md
Deterministic browser end-to-end flows for the web app, driven by Vercel **agent-browser** (Rust + CDP). No Playwright, no LLM, no API key.

## Stack (beyond root)
agent-browser CLI. Each flow = a JSON list of commands run in order by `run.ts` against one shared browser session.

## Commands
- `./scripts/e2e.sh` (from repo root) — hermetic: isolated freshly-seeded stack on alt ports, safe alongside your dev stack. PREFERRED.
- `cd e2e && npm install && npm run e2e:hermetic` — same thing.
- `npm test` — against your own running stack; only safe if your dev DB has ONLY the seeded repo.
- One-time: `npm i -g agent-browser && agent-browser install`.

## Where things live
- `specs/NN-name.flow.json` — flow specs (these are agent-browser command lists; `{BASE}` → `E2E_BASE_URL`).
- `lib/` + `run.ts` — the thin runner.
- `test-results/` — failure screenshots (git-ignored).

## Conventions (non-default)
- Locators are DETERMINISTIC only (`--url`, `--text`, `find role|text|label`). Never use the AI `chat` command — keeps runs stable and key-free.
- `wait --text` / `wait --url` ARE the assertions (non-zero exit fails the step).
- Flows target read-only seeded data (demo repo `acme/payments-api`, PR #482) so nothing triggers a model call.

## Gotchas
- Flows 02/04/05 assume a FRESHLY-SEEDED DB with only the seeded repo. Your dev DB usually has extra repos → use the hermetic runner.
- NOTE: here `specs/` holds flow JSON (the behaviour spec), not prose docs.

## Do-not-touch
- `test-results/` (generated) · don't introduce LLM/`chat` steps (breaks determinism).

## Deeper docs — read when the task needs them (not loaded by default)
- [README.md](./README.md) — how a flow works, env knobs, coverage table
- [docs/](./docs/) — design notes
- [specs/](./specs/) — flow specs (JSON command lists)
- [INSIGHTS.md](./INSIGHTS.md) — running log of gotchas & lessons learned
