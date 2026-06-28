# PR Self-Review

Local, pre-PR "second pair of eyes." Run this **before** opening a GitHub Pull
Request (or before any `git push` / `gh pr create`). It reads your working diff,
splits the changed files into layer buckets, loads the domain skills that match
each bucket, runs them against only the changed hunks, and emits a single
severity-ranked finding report. **If even one CRITICAL finding survives the
confidence filter, the review BLOCKS — you must fix before pushing.**

The goal: catch architecture violations, sync drift, and exploitable bugs on
your machine, not in PR review.

---

## When to use it

- **Manually:** `/pr-self-review` any time you want a diff audit.
- **Before GitHub:** always run it before `gh pr create` or `git push`. If wired
  as a `pre-push` hook, it runs automatically.
- **No arguments.** It diffs the current branch against `main` on its own.

It is a *review orchestrator*, not a new rulebook. Every check it makes comes
from a skill that already lives in `.claude/skills/`. This skill only decides
*which* skills apply to *which* files and *how loud* a finding must be to ship.

---

## File structure

| File | Purpose |
|------|---------|
| `SKILL.md` | The executable protocol. Phases 0–5: collect diff → classify → load skills per bucket → aggregate → report → gate. Read this to run a review. |
| `examples.md` | CRITICAL / HIGH / "do-not-flag" triplets per bucket, using real DevDigest paths. Read this to calibrate severity and avoid false positives. |
| `README.md` | This orientation doc. |

---

## How to invoke

```
/pr-self-review
```

Or wire it as a Git hook so it gates every push:

```bash
# .git/hooks/pre-push  (chmod +x)
#!/usr/bin/env bash
echo "Running /pr-self-review before push…"
# Surface the skill to your agent runner here; abort push on BLOCK verdict.
exit 0
```

---

## Buckets and the skills they load

A changed file can land in more than one bucket. Each non-empty bucket loads its
skills in priority order and applies them only to that bucket's files.

| Bucket | Path match | Skills loaded |
|--------|-----------|---------------|
| **frontend** | `client/**` (excluding `client/src/vendor/shared/**`) | frontend-architecture, next-best-practices, react-best-practices, typescript-expert, zod, security |
| **backend-server** | `server/**` (excluding vendor + migrations) | onion-architecture, fastify-best-practices, drizzle-orm-patterns, postgresql-table-design, typescript-expert, zod, security |
| **reviewer-core** | `reviewer-core/**` | onion-architecture (domain/app only), typescript-expert, zod, security — **no Fastify, no Drizzle, no Postgres** |
| **shared-contracts** | `server/src/vendor/shared/**`, `client/src/vendor/shared/**` | zod, typescript-expert + **sync-drift detection** |
| **migrations** | `server/src/db/migrations/**`, `**/drizzle/**` | postgresql-table-design, drizzle-orm-patterns |
| **e2e** | `e2e/**` | typescript-expert (light pass only) |
| **infra/config** | `*.json`, `*.yaml`, `*.yml`, `Dockerfile`, `docker-compose*`, `scripts/**`, `.env*` | security |

Why `reviewer-core` is its own bucket: it is a **pure engine** (diff → prompt →
LLM → findings) consumed as TypeScript source via path alias. It has no HTTP
layer and no database, so Fastify, Drizzle, and Postgres rules would only
generate noise. See `reviewer-core/AGENTS.md`.

---

## How findings are classified

Two independent axes. **Confidence** decides whether a finding is *reported at
all*; **severity** decides where it lands and whether it blocks.

### Confidence gate (report or drop)

Modeled on the `security` skill. A finding is reported only if it clears the bar.

| Confidence | Criteria | Action |
|------------|----------|--------|
| **HIGH** | Bad pattern + the triggering input/path is confirmed in the diff | **Report** |
| **MEDIUM** | Bad pattern, but reachability/intent is unclear from the hunk | **Report only if it would be CRITICAL/HIGH severity**; otherwise drop |
| **LOW** | Theoretical, style, or framework-mitigated | **Drop** — never listed |

> Golden rule (borrowed from `security`): always ask *"can this actually
> happen / be reached, given what the diff shows?"* If you can't point at the
> line that proves it, it's LOW confidence — drop it.

### Severity (placement + gate)

| Severity | Meaning | Gate |
|----------|---------|------|
| **CRITICAL** | Exploitable bug, data loss, auth bypass, dependency-inversion break, `docker compose down -v`, hardcoded secret, shared-contract sync drift | **BLOCKS push** |
| **HIGH** | Wrong behavior under realistic conditions, broken RSC boundary, missing route validation, N+1 in a hot path | Does not block; fix strongly advised |
| **MEDIUM** | Degraded UX/perf, missing index, stale closure, misplaced file | Does not block |
| **LOW** | Style, naming, defense-in-depth | Collapsed to a count; expand on request |

The report ends with **PASS** (0 CRITICAL) or **BLOCK** (≥1 CRITICAL), plus a
"Skills applied" summary and a "Skipped buckets" line so you can see coverage.
