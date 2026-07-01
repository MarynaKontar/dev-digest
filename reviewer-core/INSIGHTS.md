# Reviewer-Core — Insights

> Running log of gotchas & lessons learned for `@devdigest/reviewer-core` (pure diff→prompt→LLM→findings engine).
> Maintained by the `engineering-insights` skill. APPEND-ONLY — add entries, never edit or delete existing ones.

## What Works
<!-- Approaches/solutions that worked -->
- Adding an optional prompt slot (e.g. `intent`) follows the same pattern as `prDescription`: guard with `parts.X && parts.X.trim().length > 0`, derive a local variable (`const intent = ... ? parts.intent : undefined`), push to `userSections` only when truthy. This guarantees byte-identical output when the slot is absent.
- Trusted scope-narrowing instructions must be placed OUTSIDE `wrapUntrusted` — write them as literal text in the section string (between the `## heading` and the `wrapUntrusted(...)` call). Inside the untrusted wrapper the INJECTION_GUARD overrides any "instructions" the model might otherwise follow.
- The `assembly` object literal in `assemblePrompt` needs explicit `intent: parts.intent ?? null` (not the processed local `intent` variable) so the raw value (before the empty-guard) is stored in the trace. This matches how `pr_description` stores the truncated string — use the processed form for rendering, but for intent there is no truncation so `parts.intent ?? null` is correct.

- **Byte-identical test for optional prompt slots:** assert `messages[1]!.content` string equality between `intent: undefined` and the no-field call — not just absence of `"## PR intent"`. Equality catches accidentally introduced stray blank lines or whitespace that absence checks would miss. Use a stable, realistic test input (not `diff: 'D'`) so structural regressions surface reliably.
- **Ordering assertions for trusted-vs-untrusted boundary:** use two `indexOf()` comparisons (leadIn < untrustedOpen, untrustedOpen < intentText) rather than a single regex with `.*s` to verify the trusted rule is outside the wrapper. The two-index approach pinpoints exactly which boundary is violated if the test fails.

## What Doesn't Work
<!-- Dead ends & antipatterns -->

## Codebase Patterns
<!-- Conventions, architectural decisions -->

## Tool & Library Notes
<!-- Dependency quirks -->

## Recurring Errors & Fixes
<!-- Repeated error + the fix -->

## Session Notes
<!-- Datestamped session summaries -->
- **2026-06-30** — Unit 3 (intent prompt slot + out-of-scope rule): added `intent?: string` to `PromptParts` and `ReviewInput`, rendered the `## PR intent` section with a trusted lead-in + `wrapUntrusted('intent', ...)`, set `assembly.intent = parts.intent ?? null`, and added `provider: { require_parameters: true }` to `OpenRouterProvider.completeStructured` when `req.requireParameters && this.id === 'openrouter'`. All 23 existing tests pass; typecheck clean.

## Open Questions
<!-- Still unresolved -->
