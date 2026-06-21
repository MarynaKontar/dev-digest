# @devdigest/reviewer-core — CLAUDE.md
Pure review engine: **diff → prompt → LLM → grounded findings**. No DB/GitHub/FS; the only side effect is an INJECTED `LLMProvider` (that's what makes it mock-testable).

## Stack (beyond root)
Pure TypeScript · openai SDK · Zod. Consumed by the server as SOURCE via tsconfig path alias.

## Commands
- `pnpm test` — vitest, hermetic units with a stubbed LLMProvider (no keys, no network).
- `pnpm typecheck` / `pnpm build` — both are just a type-check (the package NEVER emits JS).

## Where things live
- `src/review/run.ts` — orchestrates a run (single-pass by default).
- `src/prompt.ts` — `assemblePrompt`, `wrapUntrusted`, `INJECTION_GUARD`.
- `src/grounding.ts` — `groundFindings` (the mandatory citation gate).
- `src/llm/` — `openrouter.ts` provider + `structured.ts` (Zod→JSON Schema, parse-with-repair).
- `src/index.ts` — public API surface.

## Conventions (non-default)
- Keep this package PURE: no DB/GitHub/FS imports. New side effects go behind an injected interface.
- Contracts (`Review`, `Finding`, `Verdict`, …) come from `@devdigest/shared`.

## Gotchas
- Optional prompt slots (`skills`, `memory`, `specs`, `callers`) + `reduce()`/map-reduce exist for later lessons; the starter passes only diff + system prompt + repo map, so `assemblePrompt` omits the rest — that's intentional, not dead code.
- Score is recomputed from grounded findings; the model's self-reported score is ignored.

## Do-not-touch
- Don't add I/O or make this depend on the server — the purity is the point.

## Deeper docs — read when the task needs them (not loaded by default)
- [README.md](./README.md) — pipeline diagram + public API
- [docs/](./docs/) — design notes
- [specs/](./specs/) — feature / behaviour specs
- [INSIGHTS.md](./INSIGHTS.md) — running log of gotchas & lessons learned
