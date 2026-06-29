---
name: breaking-change
version: 1.0.0
description: "Detects breaking changes to the server's public HTTP API contract by diffing the current branch against main (or a custom ref / uncommitted working tree). Inspects three contract surfaces — routes (path + HTTP method), request Zod schemas (params/body/querystring), and status codes — then classifies every change as BREAKING, additive (non-breaking), or internal. Emits a grouped, endpoint-by-endpoint breaking-change report with a semver recommendation (major / minor / patch). Response-shape changes are covered by the companion `/response-schema` skill. Use before opening a PR or shipping an API-touching branch."
metadata:
  tags: api, contract, breaking-change, diff, semver, devdigest
---

# Breaking-Change Detector

Audits the **public HTTP API contract** of the DevDigest server for
consumer-visible changes. Run it on any branch that touches
`server/src/modules/**/routes.ts` or `server/src/modules/_shared/`.

> For response-shape changes (response field types, mandatory fields,
> nullability), run `/response-schema` — that surface lives in its own skill.

Invoke with `/breaking-change` — no arguments needed for the common case
(current branch vs. `main`). Optional argument: a git ref to compare against,
or the literal `working` to check uncommitted changes.

---

## Phase 1 — Resolve the diff basis

Run these commands. Capture the **name list** and the **unified diff with
context**. Always use `--unified=5` — Zod schemas can be large and a hunk
with too little context makes classification ambiguous.

### Default: current branch vs. main

```bash
git rev-parse --abbrev-ref HEAD          # confirm you're on a feature branch
git merge-base HEAD main                 # prints the common ancestor SHA

BASE=$(git merge-base HEAD main)
git diff $BASE..HEAD --name-only --diff-filter=ACMDRT
git diff $BASE..HEAD --unified=5 --diff-filter=ACMDRT
```

> `--diff-filter=ACMDRT` includes Deletions (`D`) — a deleted route file or a
> removed Zod field IS a breaking change.

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

## Phase 2 — Filter to contract-relevant files

From the name list, keep only files that match **at least one** of these globs:

| Pattern | Contract surface |
|---------|-----------------|
| `server/src/modules/**/routes.ts` | Routes + request schemas + status codes (NOT responses) |
| `server/src/modules/_shared/**` | Shared param schemas (`IdParams`, etc.) |

If **no file** in the diff matches any of these patterns, print:

```
No public API contract changes detected.
The diff touches only internal server files (services, repositories, adapters,
migrations, tests). No consumer-visible HTTP contract surface was modified.
```

…and stop. There is nothing to classify.

If relevant files exist, print the filtered list so the user sees the scope:

```
Contract-relevant files changed (3):
  server/src/modules/agents/routes.ts
  server/src/modules/reviews/routes.ts
  server/src/modules/_shared/schemas.ts
```

---

## Phase 3 — Analyze each file against the three contract surfaces

For each contract-relevant file in the diff, inspect it against the three
surfaces below. Read the **full current file** whenever the diff hunk alone
lacks enough context (e.g. a request Zod schema defined far from the route
registration, or an `.extend()` chain whose base is in a different file).

### Surface A — Routes (path + HTTP method)

Look at `app.get / .post / .put / .patch / .delete` calls in route files and
how they are registered in `server/src/modules/index.ts`.

Detect:
- A route path that existed before is no longer present (removed or renamed).
- An HTTP verb on an existing path changed (e.g. `PUT` → `PATCH`).
- A path segment changed (`/agents/:id/skills` → `/agents/:id/skill-links`).
- A new route added (additive).

### Surface B — Request schemas (params / body / querystring)

Route handlers declare schemas as:

```ts
app.post('/agents', { schema: { body: CreateAgentBody } }, async (req, reply) => { … });
app.get('/agents/:id', { schema: { params: IdParams } }, async (req) => { … });
```

The Zod schema in `schema.params`, `schema.body`, and `schema.querystring` IS
the request contract. Changes to these Zod schemas (or to shared schemas they
reference, like `IdParams` in `server/src/modules/_shared/schemas.ts`) are
request-contract changes.

Detect (per Zod pattern):
- **Removed field** — field present before, absent now → BREAKING.
- **New required field** — `.string()`, `.number()`, `.boolean()` etc. with no
  `.optional()` and no `.default(…)` → BREAKING (clients not sending it get 422).
- **New optional field** — `.optional()` or `.default(…)` → additive.
- **optional → required** — `.optional()` removed from an existing field → BREAKING.
- **Tightened validation** — added `.min()`, `.max()`, `.regex()`, `.email()`,
  `.uuid()`, narrowed `.enum([…])` values, changed `.z.string()` → `.z.number()`
  → BREAKING (previously-valid payloads now 422).
- **Loosened validation** — removed a `.min()`, widened an enum → additive.
- **Type changed** — `z.string()` → `z.number()` or equivalent → BREAKING.

### Response shapes → delegated

Response-shape changes (response field types, mandatory/required fields,
nullability, `.strict()`, changes to `server/src/vendor/shared/contracts/**`)
are **NOT** analyzed here. Run `/response-schema` for that surface.

### Surface C — Status codes

Status codes are set via `reply.status(…)` in handlers. Default success is
`200`; `POST` handlers that create resources typically use `reply.status(201)`.
Errors map through `server/src/platform/errors.ts`.

Detect:
- A success status code changed (`201` → `200`, `200` → `204`) → BREAKING.
- An error status changed (e.g. `404` → `422`) → BREAKING.
- `reply.status(…)` added where previously there was none (default 200 becomes
  explicit 201) → BREAKING.

---

## Phase 4 — Classify each change

Apply these rules from the consumer's perspective:

### BREAKING (major bump)

| Trigger | Why it breaks consumers |
|---------|------------------------|
| Route removed or renamed | Client gets 404 on a known path |
| HTTP method changed on existing path | Client request is rejected |
| New REQUIRED request field (no default) | Old clients missing the field get 422 |
| Request field removed | Harmless if client was sending it — but harmless only if not the ONLY valid identifier; removal of a discriminant field is BREAKING |
| optional → required on existing request field | Old clients missing the field now 422 |
| Tightened validation (new `.min/.max/.regex`, narrower enum, type narrowing) | Previously-valid payloads now 422 |
| Success or error status code changed | Client branching on that code breaks |

### NON-BREAKING / additive (minor bump)

| Trigger | Why it is safe |
|---------|---------------|
| New route added | Old clients unaffected |
| New OPTIONAL request field (`.optional()` / `.default()`) | Old clients can omit it |
| Loosened validation (removed `.min`, widened enum) | Previously-rejected inputs now accepted |
| New accepted enum value on a request field | Old clients still pass with old values |

### PATCH / internal (no semver impact)

| Trigger | Notes |
|---------|-------|
| Comments or JSDoc changes only | No runtime impact |
| Handler-internal logic (service calls, logging, caching) | Not visible in the contract |
| Repository / DB query changes | Behind the service interface |
| Error message text changed (not status code) | The code is what consumers branch on |

---

## Phase 5 — Emit the breaking-change report

Use exactly this template. Fill every section; omit empty sections with
"(none)".

```
## Breaking-Change Report
Branch: <branch-name>  vs  <ref or "main">        Mode: <branch-diff | working-tree>
Contract files inspected: <N>

### Verdict
🔴 BREAKING — major version bump recommended
  (or)
🟡 additive only — minor version bump recommended
  (or)
🟢 no contract changes — patch / no bump needed

---

### Endpoint / Contract Changes

#### POST /agents  (server/src/modules/agents/routes.ts)

| Change | Classification | Why |
|--------|---------------|-----|
| `strategy` field added to `CreateAgentBody` as `.optional()` | additive | Existing clients omitting it still pass validation |
| `output_schema` type widened from `z.string()` to `z.unknown()` | additive | Accepts more values than before |

#### GET /agents/:id/skills  (server/src/modules/agents/routes.ts)

| Change | Classification | Why |
|--------|---------------|-----|
| (no changes) | — | — |

#### PUT /agents/:id  (server/src/modules/agents/routes.ts)

| Change | Classification | Why |
|--------|---------------|-----|
| `name` in `UpdateAgentBody` gained `.min(3)` (was `.min(1)`) | **BREAKING** | Payloads with 1–2 char names that previously validated now get 422 |
| Success status changed from 200 to 204 (No Content) | **BREAKING** | Clients reading the returned agent body now get an empty response |

---

### BREAKING changes summary

1. `UpdateAgentBody.name` — validation tightened from `.min(1)` to `.min(3)`.
   File: server/src/modules/agents/routes.ts
   Consumer impact: previously-valid short names are now rejected with 422.
2. `PUT /agents/:id` — success status changed 200 → 204.
   File: server/src/modules/agents/routes.ts
   Consumer impact: clients reading the updated agent from the response body break.

---

### Semver recommendation

**MAJOR** — 2 breaking changes detected. Bump the major version, document the
migration, and consider a deprecation cycle if existing clients depend on the
old validation or status code.
```

---

### Example: fully filled-in report (no breaking changes)

```
## Breaking-Change Report
Branch: feat/add-skill-toggle  vs  main        Mode: branch-diff
Contract files inspected: 2

### Verdict
🟡 additive only — minor version bump recommended

---

### Endpoint / Contract Changes

#### PATCH /agents/:id/skills/:skillId  (server/src/modules/agents/routes.ts)

| Change | Classification | Why |
|--------|---------------|-----|
| New route: PATCH /agents/:id/skills/:skillId | additive | New endpoint; old clients unaffected |
| `ToggleSkillBody` — new required field `enabled: z.boolean()` | additive | This is a NEW endpoint, not a change to an existing one |

#### POST /agents/:id/skills  (server/src/modules/agents/routes.ts)

| Change | Classification | Why |
|--------|---------------|-----|
| `SetSkillsBody.skills` field added as `z.array(SkillEntry).optional()` | additive | Optional field; existing callers using `skill_ids` or `skill_id` unaffected |
| `SetSkillsBody.skills[].enabled` — new field on `SkillEntry` | additive | Part of new optional array; no impact on existing callers |

---

### BREAKING changes summary

(none)

---

### Semver recommendation

**MINOR** — 0 breaking changes; 1 new route and 2 new optional fields added.
Safe to ship without a major bump.
```

---

## Execution notes

- **Always read the full current file** for any changed routes.ts — the diff may
  show only the handler body while the request schema that changed is defined at
  the top of the same file outside the hunk.
- **Chase request-schema `.extend()`/`.refine()` chains.** If a request body
  builds on a schema defined elsewhere (e.g. a shared base), read that file too
  before classifying the request contract.
- **`_shared/schemas.ts` is a multiplier.** `IdParams` is used in dozens of
  routes. A change there affects every route that imports it — list them all.
- **Response-shape analysis is out of scope here — see `/response-schema`.**
- **Do not classify internal-only diffs as BREAKING.** If only `service.ts` or
  `repository.ts` changed and no route or contract file is in scope, stop at
  Phase 2 with "No public API contract changes."
- **Status 201 vs 200 matters.** A missing `reply.status(201)` on a POST that
  previously returned 201 IS a breaking change. Look for both explicit calls and
  their removal.
- After emitting the report, invoke `engineering-insights` in END mode if you
  discovered a non-obvious contract pattern (e.g. a shared param/request schema
  used by more routes than expected, or a route whose verb/path silently changed).
