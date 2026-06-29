---
name: response-schema
version: 1.0.0
description: "Detects changes to the server's API RESPONSE shape — response Zod/contract schemas in server/src/vendor/shared/contracts/** (plus the barrel re-exports) and inline response schemas returned by route handlers — checking field types, mandatory/required fields, nullability, and .strict(). Diffs the current branch against main (or a custom ref / uncommitted working tree) and classifies each change as BREAKING, additive (non-breaking), or internal, then emits a grouped, per-contract report with a semver recommendation (major / minor / patch). Use before opening a PR that touches response contracts; it is the companion to /breaking-change, which covers routes, request schemas, and status codes."
metadata:
  tags: api, response, schema, contract, breaking-change, diff, semver, devdigest
---

# Response-Schema Change Detector

Audits the **API response shape** of the DevDigest server for consumer-visible
changes. It is the dedicated companion to `/breaking-change`: that skill covers
routes (path + method), request schemas, and status codes; **this** skill owns
the response surface — response Zod/contract schemas and the shapes handlers
return.

Invoke with `/response-schema` — no arguments needed for the common case
(current branch vs. `main`). Optional argument: a git ref to compare against,
or the literal `working` to check uncommitted changes.

---

## Phase 1 — Resolve the diff basis

Run these commands. Capture the **name list** and the **unified diff with
context**. Always use `--unified=5` — response contract schemas can be large
(`.extend()` chains, nested objects) and a hunk with too little context makes
classification ambiguous.

### Default: current branch vs. main

```bash
git rev-parse --abbrev-ref HEAD          # confirm you're on a feature branch
git merge-base HEAD main                 # prints the common ancestor SHA

BASE=$(git merge-base HEAD main)
git diff $BASE..HEAD --name-only --diff-filter=ACMDRT
git diff $BASE..HEAD --unified=5 --diff-filter=ACMDRT
```

> `--diff-filter=ACMDRT` includes Deletions (`D`) — a deleted contract file or a
> removed response field IS a breaking change.

### With a custom ref argument

If the user provides a ref, e.g. `origin/v2-stable`:

```bash
BASE=$(git merge-base HEAD origin/v2-stable)
git diff $BASE..HEAD --name-only --diff-filter=ACMDRT
git diff $BASE..HEAD --unified=5 --diff-filter=ACMDRT
```

### With `working` argument (uncommitted changes)

```bash
git diff HEAD --name-only --diff-filter=ACMDRT
git diff HEAD --unified=5 --diff-filter=ACMDRT
```

---

## Phase 2 — Filter to response-surface files

From the name list, keep only files that match **at least one** of these globs:

| Pattern | Response surface | Priority |
|---------|-----------------|----------|
| `server/src/vendor/shared/contracts/**` | Response contract Zod schemas — the primary surface | primary |
| `server/src/vendor/shared/*.ts` | Barrel re-exports of the contracts | primary |
| `server/src/modules/**/routes.ts` | Inline response schemas / shapes returned by handlers | secondary |

> About routes: this server uses `fastify-type-provider-zod`, so when a handler
> declares a response Zod schema it governs serialization, and the returned
> object is shaped by it. Many routes have **no explicit response schema** — in
> that case the object the handler `return`s IS the contract. Focus on the
> contract schema files; treat `routes.ts` as secondary, flagging changes to
> what handlers return only where a response Zod schema (inline or imported)
> governs the shape.

If **no file** in the diff matches any of these patterns, print:

```
No API response-shape changes detected.
The diff touches no response contract schemas (server/src/vendor/shared/contracts/**)
and no route handler response shapes. Routes, request schemas, and status codes are
covered separately by /breaking-change.
```

…and stop. There is nothing to classify.

If relevant files exist, print the filtered list so the user sees the scope:

```
Response-surface files changed (2):
  server/src/vendor/shared/contracts/review-api.ts   (primary)
  server/src/modules/reviews/routes.ts               (secondary — inline response)
```

---

## Phase 3 — Analyze each response schema

For each response-surface file in the diff, inspect the response Zod schemas.
Read the **full current file** whenever the diff hunk alone lacks context (a
schema is often defined far from where it is returned, and `.extend()` chains
cross files).

### Where the response shapes live

Key contract files and the exports to check:

- `review-api.ts` — `FindingRecord`, `ReviewRecord`, `ReviewRunTarget`, `ReviewRunResponse`, `PrIntentRecord`, `SmartDiffResponse`
- `findings.ts` — `Finding`, `Verdict`, `Severity`
- `brief.ts` — `Intent`, `SmartDiff`
- `observability.ts`, `knowledge.ts`, `trace.ts`, `productionize.ts`, `eval-ci.ts`, `platform.ts`, `why.ts` — additional response shapes

These compose: e.g. `FindingRecord = Finding.extend({ review_id, accepted_at, dismissed_at })`, `ReviewRecord` embeds `findings: z.array(FindingRecord)`, and `ReviewRunResponse` embeds `reviews: z.array(ReviewRecord)`. A change to `Finding` in `findings.ts` therefore ripples through every response that embeds it — trace and list each affected response.

### Detect (per Zod pattern)

| Pattern in a response schema | Classification |
|------------------------------|----------------|
| **Field removed** (present before, absent now) | BREAKING — clients reading it get `undefined` |
| **Field type changed** (`z.string()` → `z.number()`, enum widened/narrowed, etc.) | BREAKING |
| **Field renamed** (remove + add) | BREAKING |
| **`.nullable()` removed** (was nullable, now non-nullable / required) | BREAKING — clients that handled `null` break; the field's contract narrowed |
| **`.nullable()` / `.nullish()` added** (was always present, now may be null) | BREAKING — clients not expecting `null` break |
| **optional → required** on a response field, or a sometimes-absent field now always present | analyze: a field that DISAPPEARS or becomes optional/absent is BREAKING; making an always-present field newly nullable is BREAKING |
| **`.strict()` added** to a response schema | BREAKING — responses carrying extra keys now fail serialization |
| **New field added** (optional or always-present) | additive — clients ignore unknown keys (unless they parse with `.strict()`) |
| **`.optional()` added to an existing field that was already always-present** | additive on the wire if the field still ships, BREAKING if the field can now be omitted from responses clients relied on — inspect the handler to decide |

---

## Phase 4 — Classify each change

Apply these rules from the consumer's perspective (the client reading the
response).

### BREAKING (major bump)

| Trigger | Why it breaks consumers |
|---------|------------------------|
| Response field removed | Client code reading that field gets `undefined` |
| Response field type changed | Parsing / rendering on the client breaks |
| Response field renamed | Old key gone (remove + add) |
| `.nullable()` removed → field now non-nullable | Narrowed contract; clients that branched on `null` break |
| `.nullable()`/`.nullish()` added → field now may be null | Clients not handling `null` break |
| Always-present field becomes optional / can be omitted | Client reading it unconditionally breaks |
| `.strict()` added to a response schema | Responses with extra keys fail serialization |

### NON-BREAKING / additive (minor bump)

| Trigger | Why it is safe |
|---------|---------------|
| New response field added (optional or always-present) | Clients ignore unknown keys |
| A response field's validation loosened in a way that still satisfies old readers | Old shape still valid |

### PATCH / internal (no semver impact)

| Trigger | Notes |
|---------|-------|
| Comments / JSDoc on a contract file | No runtime impact |
| Handler-internal logic that doesn't change the returned shape | Not visible on the wire |
| Renamed internal type alias re-exported under the same public name | Public shape unchanged |

---

## Phase 5 — Emit the response-shape report

Use exactly this template. Fill every section; omit empty sections with
"(none)".

```
## Response-Schema Change Report
Branch: <branch-name>  vs  <ref or "main">        Mode: <branch-diff | working-tree>
Response-surface files inspected: <N>

### Verdict
🔴 BREAKING — major version bump recommended
  (or)
🟡 additive only — minor version bump recommended
  (or)
🟢 no response-shape changes — patch / no bump needed

---

### Contract / Endpoint Changes

#### FindingRecord  (server/src/vendor/shared/contracts/review-api.ts)
Embedded in: ReviewRecord.findings → ReviewRunResponse.reviews (GET /reviews, POST /pulls/:id/review)

| Change | Classification | Why |
|--------|---------------|-----|
| `dismissed_at` changed from `z.string().nullable()` to `z.string()` | **BREAKING** | Field narrowed to non-nullable; clients handling `null` break, and a null value now fails serialization |
| New field `resolved_by: z.string().optional()` added | additive | Clients ignore the unknown key |

#### ReviewRecord  (server/src/vendor/shared/contracts/review-api.ts)

| Change | Classification | Why |
|--------|---------------|-----|
| Inherits the BREAKING `FindingRecord` change via `findings[]` | **BREAKING** | Embedded shape changed |

---

### BREAKING changes summary

1. `FindingRecord.dismissed_at` — `.nullable()` removed, narrowing the field to non-nullable.
   File: server/src/vendor/shared/contracts/review-api.ts
   Ripples to: ReviewRecord.findings[], ReviewRunResponse.reviews[].
   Consumer impact: any client reading `dismissed_at` and handling `null` breaks.

---

### Semver recommendation

**MAJOR** — 1 breaking response change detected. Bump the major version, document
the migration, and consider a deprecation cycle for clients depending on the
removed nullability.
```

---

### Example: fully filled-in report (additive only)

```
## Response-Schema Change Report
Branch: feat/review-grounding-meta  vs  main        Mode: branch-diff
Response-surface files inspected: 1

### Verdict
🟡 additive only — minor version bump recommended

---

### Contract / Endpoint Changes

#### ReviewRecord  (server/src/vendor/shared/contracts/review-api.ts)
Returned by: GET /reviews, embedded in ReviewRunResponse (POST /pulls/:id/review)

| Change | Classification | Why |
|--------|---------------|-----|
| New field `grounding_meta: z.string().nullish()` added | additive | Optional/nullish; existing clients ignore the unknown key |

---

### BREAKING changes summary

(none)

---

### Semver recommendation

**MINOR** — 0 breaking changes; 1 new optional response field added. Safe to ship
without a major bump.
```

---

## Execution notes

- **Always read the full current contract file** — a response schema is usually
  defined away from where it is returned, and the diff hunk rarely shows the
  whole object.
- **Chase `.extend()` and embedding chains.** `FindingRecord = Finding.extend({…})`,
  `ReviewRecord` embeds `z.array(FindingRecord)`, `ReviewRunResponse` embeds
  `z.array(ReviewRecord)`. A change to a base schema in `findings.ts` or
  `brief.ts` ripples into every response that embeds it — list each affected
  response shape, not just the file that changed.
- **Vendor contracts ARE response contracts.** Any file under
  `server/src/vendor/shared/contracts/` is a consumer-facing response shape;
  treat deletions (`D`) with the same weight as type changes.
- **Routes are secondary.** Only flag a `routes.ts` change when a response Zod
  schema (inline or imported) governs the returned shape; pure handler-internal
  logic that doesn't change the returned object is internal/patch.
- **Nullability cuts both ways.** Removing `.nullable()` narrows the contract;
  adding it widens the value space — both can break clients. Classify by what the
  consumer now has to handle.
- **Routes, request schemas, and status codes are out of scope here** — run
  `/breaking-change` for those surfaces.
- After emitting the report, invoke `engineering-insights` in END mode if you
  discovered a non-obvious response pattern (e.g. a base schema embedded in more
  responses than expected, or a `.extend()` chain that silently widened a shape).
