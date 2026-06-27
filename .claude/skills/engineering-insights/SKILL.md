---
name: engineering-insights
description: "Captures durable, module-specific engineering insights for the DevDigest repo. Use at the START of work in a module to read its INSIGHTS.md and surface the top relevant lessons before changing code, and at the END of a substantial session to append new, non-obvious lessons (gotchas, fixes, codebase patterns, library quirks) to that module's INSIGHTS.md — server, client, reviewer-core, or e2e. Strictly append-only: never overwrites or deletes existing content. Skip writing when nothing substantial was learned."
---

# Engineering Insights

Persist hard-won, non-obvious lessons next to the code they belong to, so the next session in a module starts already knowing them.

## Which file (routing)
Write to the `INSIGHTS.md` of the module the task touched:

| Module in play | File |
|---|---|
| `server/` (includes `src/modules/repo-intel` and vendored shared) | `server/INSIGHTS.md` |
| `client/` | `client/INSIGHTS.md` |
| `reviewer-core/` | `reviewer-core/INSIGHTS.md` |
| `e2e/` | `e2e/INSIGHTS.md` |

`repo-intel` is not a top-level package — its insights go in `server/INSIGHTS.md`.

## Protocol
1. **Start:** Identify the module(s) in play. Read that module's `INSIGHTS.md` before working, then confirm you read it and summarize the top 3 most relevant points so they actually inform the work.
2. **During:** Flag candidate lessons as you hit them.
3. **End:** Only if a substantial, non-obvious lesson emerged — re-read the file, skip anything already recorded, and append it under the right section.
4. If nothing substantial beyond what's already written → write nothing.

## APPEND-ONLY — never erase
- Only ever ADD text. NEVER overwrite, edit, reword, reorder, truncate, or delete any existing line, entry, section, or heading.
- A finding that contradicts an older entry is added as a NEW dated note under the same section. Leave the original entry untouched.
- Mechanically: read the file, locate the target section, insert the new bullet at the end of that section's existing list. Preserve all existing bytes verbatim. The only write that creates file content is the one-time seed of a missing file.

## The seven sections (every INSIGHTS.md uses these)
- **What Works** — approaches/solutions that worked
- **What Doesn't Work** — dead ends & antipatterns (most-skipped, most valuable)
- **Codebase Patterns** — conventions, architectural decisions
- **Tool & Library Notes** — dependency quirks
- **Recurring Errors & Fixes** — repeated errors + the fix
- **Session Notes** — datestamped session summaries
- **Open Questions** — what's still unresolved

## Write it concrete, not banal
An entry must be actionable cold: a future agent reads it and knows what to do, with no re-investigation.
- BAD: "Promises can be tricky." / "be careful with async"
- GOOD: "`Promise.all()` in the ingest pipeline times out past 30 items — use `Promise.allSettled()` in batches of 10."
- GOOD: "Checkout-flow state always goes through Zustand (`cartStore.ts`) because 3 components share the cart; local state breaks it."

Test: if it would be obvious to anyone reading the code, don't write it.
