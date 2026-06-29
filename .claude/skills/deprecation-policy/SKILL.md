---
name: deprecation-policy
version: 1.0.0
description: "Enforces marking API routes, request/response Zod fields, and exported code symbols as deprecated instead of silently deleting them. Scans the current branch diff (vs main / a custom ref / the working tree) for silent removals and renames and, for each, prescribes the deprecation path — @deprecated JSDoc tags, HTTP Deprecation/Sunset headers for routes (RFC 8594), and a changelog/migration note — following a deprecate → sunset → remove lifecycle. It is both a checker and a playbook, and the remediation companion to /breaking-change and /response-schema: those skills DETECT contract breaks; this one says how to phase them out safely. DB columns/tables are out of scope (migrations have their own lifecycle)."
metadata:
  tags: api, deprecation, lifecycle, sunset, contract, breaking-change, devdigest
---

# Deprecation Policy

Enforces the rule: **mark deprecated instead of silently deleting.** It is both a
**checker** (scans the diff for silent removals) and a **playbook** (prescribes
exactly how to deprecate each thing it finds).

This is the **remediation companion** to `/breaking-change` and
`/response-schema`: run those to *detect* that a route, contract field, or
public export was removed/renamed; run **this** skill to turn each removal into
a safe, staged deprecation instead of a hard break.

Invoke with `/deprecation-policy` — no arguments needed for the common case
(current branch vs. `main`). Optional argument: a git ref to compare against,
or the literal `working` to check uncommitted changes.

### Scope — three surfaces

1. **API routes / endpoints** — removed or renamed HTTP routes in
   `server/src/modules/**/routes.ts`.
2. **Request / response fields** — Zod contract fields: request
   `params`/`body`/`querystring` in routes, and response/shared-contract schemas
   in `server/src/vendor/shared/contracts/**` (plus the barrel re-exports).
3. **Exported code symbols** — public TS functions / types / constants exported
   across packages or from `reviewer-core` / `server/src/vendor/shared` (an
   `export` removed or renamed in a module that other packages consume —
   remember `reviewer-core` and the vendored shared are consumed as TypeScript
   SOURCE via path alias, so a removed export breaks consumers at compile time).

> **Out of scope: DB columns and tables.** Drizzle migrations in
> `server/src/db/migrations/**` have their own lifecycle (expand/contract,
> backfill) — do not apply this skill's HTTP/JSDoc mechanisms to schema columns.

---

## Phase 1 — Resolve the diff basis

Run these commands. Capture the **name list** and the **unified diff with
context**. Always use `--unified=5`. The signal here is **`D` (deletions)** and
**`R` (renames)** — those are where silent removals hide.

### Default: current branch vs. main

```bash
git rev-parse --abbrev-ref HEAD          # confirm you're on a feature branch
git merge-base HEAD main                 # prints the common ancestor SHA

BASE=$(git merge-base HEAD main)
git diff $BASE..HEAD --name-status --diff-filter=ACMDRT   # D = deleted, R = renamed
git diff $BASE..HEAD --unified=5 --diff-filter=ACMDRT
```

### With a custom ref argument

If the user provides a ref, e.g. `origin/v2-stable`:

```bash
BASE=$(git merge-base HEAD origin/v2-stable)
git diff $BASE..HEAD --name-status --diff-filter=ACMDRT
git diff $BASE..HEAD --unified=5 --diff-filter=ACMDRT
```

### With `working` argument (uncommitted changes)

```bash
git diff HEAD --name-status --diff-filter=ACMDRT
git diff HEAD --unified=5 --diff-filter=ACMDRT
```

> Use `--name-status` (not just `--name-only`) so deleted (`D`) and renamed (`R`)
> files are obvious at a glance. A whole deleted route file is a removed
> endpoint set; a renamed file is a likely path/symbol rename.

---

## Phase 2 — Detect silent removals across the three surfaces

Scan the diff for **removed `-` lines** (and renamed files) that drop something
consumers can see. Read the **full current file** when a hunk lacks context (a
schema or export may be defined far from where it is used).

### Surface 1 — Routes removed / renamed

Look for `app.get / .post / .put / .patch / .delete('<path>', …)` registrations
that exist on the base but are **gone** (or whose path/verb changed) on HEAD.

- A deleted `server/src/modules/<m>/routes.ts`, or a removed `app.<verb>(…)` line
  → route removed.
- A path string changed (`/agents/:id/skills` → `/agents/:id/skill-links`) or a
  verb changed (`PUT` → `PATCH`) → route renamed.

### Surface 2 — Request / response Zod fields removed

- **Request fields:** a key dropped from a `params`/`body`/`querystring` schema
  in a route file (e.g. a property removed from `CreateAgentBody`).
- **Response/contract fields:** a key dropped from a schema in
  `server/src/vendor/shared/contracts/**` (e.g. a field removed from
  `ReviewRecord`/`FindingRecord`), or from an inline response schema. Chase
  `.extend()`/embedding chains — a field dropped from `Finding` disappears from
  every response that embeds it.

### Surface 3 — Exported symbols removed / renamed

- An `export function`/`export type`/`export const`/`export interface` (or a
  named entry in an `export { … }` barrel) present on the base but **gone** on
  HEAD, in a consumed module (`reviewer-core/**`, `server/src/vendor/shared/**`,
  or any module another package imports).
- Grep both sides to confirm the symbol is actually consumed before treating its
  removal as policy-relevant:

```bash
# Is the removed symbol still referenced anywhere?
grep -rn "<SymbolName>" server/src client/src reviewer-core/src --include='*.ts' --include='*.tsx'
```

### If nothing was removed

If no route, field, or export was removed or renamed, print and stop:

```
No silent removals detected — nothing to deprecate.
The diff adds or modifies code but removes no public route, contract field, or
exported symbol. (Additive changes don't require a deprecation path.)
```

Otherwise, list what you found before prescribing:

```
Silent removals detected (3):
  route   DELETE /agents/:id/legacy            server/src/modules/agents/routes.ts (removed)
  field   ReviewRecord.legacy_score            server/src/vendor/shared/contracts/review-api.ts (removed)
  export  buildLegacyPrompt()                  reviewer-core/src/prompt/legacy.ts (removed, still referenced ×2)
```

---

## Phase 3 — Prescribe the deprecation path per finding

For each removed thing, restore it and apply the prescribed mechanism(s). The
old surface must keep working through the deprecation window — **never remove in
the same change that deprecates.**

| Removed thing | Prescribed mechanism(s) |
|---------------|-------------------------|
| **Route** (removed/renamed) | Keep the old route working → add `Deprecation` + `Sunset` headers (+ `Link` successor) → `@deprecated` JSDoc on the handler → changelog entry |
| **Request / response field** | Restore the field → `@deprecated` JSDoc on the property (and `.describe('@deprecated …')` for response Zod fields so it surfaces in the serialized schema) → changelog entry |
| **Exported symbol** | Restore the export → `@deprecated` JSDoc tag (optionally re-export under the new name and keep the old as a deprecated alias) → changelog entry |

### Mechanism 1 — `@deprecated` JSDoc tags

Editors, `tsserver`, and reviewers surface `@deprecated` with a strikethrough.
Use a consistent one-liner: what to use instead + planned removal.

Exported function / type / const:

```ts
/** @deprecated since v1.4 — use buildPrompt() instead; removal planned v2.0 */
export function buildLegacyPrompt(diff: string): string { /* … */ }

/** @deprecated since v1.4 — use ReviewRecord; removal planned v2.0 */
export type LegacyReview = ReviewRecord;
```

Zod field (JSDoc on the property line; add `.describe(…)` for response schemas):

```ts
export const ReviewRecord = z.object({
  id: z.string(),
  /** @deprecated since v1.4 — use `score`; removal planned v2.0 */
  legacy_score: z.number().int().nullable().describe('@deprecated — use `score`'),
  score: z.number().int().nullable(),
  // …
});
```

> The field stays in the schema (so existing clients keep receiving/sending it)
> until the sunset date; only the JSDoc/`.describe` marks intent. For a request
> field being phased out, keep it `.optional()` so new clients can omit it.

### Mechanism 2 — HTTP Deprecation / Sunset headers (routes, RFC 8594)

Keep the old route registered and functional; signal its end-of-life via
response headers. This server is Fastify 5 with `fastify-type-provider-zod`:

```ts
// server/src/modules/agents/routes.ts
/** @deprecated since v1.4 — use DELETE /agents/:id; removal planned v2.0 (sunset 2026-12-31) */
app.delete('/agents/:id/legacy', { schema: { params: IdParams } }, async (req, reply) => {
  reply.header('Deprecation', 'true');                  // RFC 8594: this resource is deprecated
  reply.header('Sunset', 'Wed, 31 Dec 2026 23:59:59 GMT'); // HTTP-date the route stops working
  reply.header('Link', '</agents/:id>; rel="successor-version"'); // point to the replacement
  // …existing handler logic stays intact — the route still works…
  return existingBehavior();
});
```

- `Deprecation: true` — the endpoint is deprecated (a date value is also valid).
- `Sunset: <HTTP-date>` — when it will be removed; format as an HTTP-date.
- `Link: <url>; rel="successor-version"` — optional pointer to the replacement.
- The handler must **continue returning its real response** during the window.

### Mechanism 3 — Changelog + migration note

Every deprecation needs a written record (CHANGELOG entry and/or PR
description). Copy-paste template:

```
### Deprecated
- `<thing>` (route / field / export) is deprecated as of v<X>.
  - Replacement: `<replacement>`
  - Reason: <why>
  - Removal: planned in v<Y> (sunset <YYYY-MM-DD> for routes)
  - Migration: <one line on how consumers switch over>
```

---

## Phase 4 — Lifecycle policy (deprecate → sunset → remove)

The staged lifecycle. Do not skip stages; do not collapse them into one release.

| Stage | When | What it requires |
|-------|------|------------------|
| **1. Deprecate** | The release where you'd have deleted | Restore the surface; add `@deprecated` JSDoc (+ `Sunset`/`Deprecation` headers for routes); write the changelog/migration note. The old surface still works identically. |
| **2. Sunset (announced)** | After deprecate, before removal | Keep it working but advertised as ending. Routes carry `Sunset: <date>`. Give consumers at least **one minor version / one full release cycle** to migrate. Optionally add runtime warn-logs on use. |
| **3. Remove** | Only after the Sunset date has passed **and** at least one release cycle elapsed | Delete the route/field/export and its `@deprecated` markers. This removal is itself a BREAKING change — confirm with `/breaking-change` and `/response-schema`, and note it in the changelog under "Removed". |

Window guidance (repo-practical):
- Keep anything deprecated for **at least one minor version** (one release cycle)
  before removal.
- For routes, **never remove before the `Sunset` date** you published.
- Removal and deprecation must be in **separate changes** — a removal PR should
  reference the earlier deprecation PR.

---

## Phase 5 — Emit the report

Use exactly this template. Fill every section; omit empty sections with
"(none)".

```
## Deprecation-Policy Report
Branch: <branch-name>  vs  <ref or "main">        Mode: <branch-diff | working-tree>
Silent removals found: <N>

### Verdict
🔴 BLOCKED — <N> silent removal(s); deprecate before merging (see actions below)
  (or)
🟡 deprecations in progress — markers present, verify the lifecycle artifacts
  (or)
🟢 no silent removals — nothing to deprecate

---

### Removed item → prescribed action

| Removed thing | Surface | Prescribed deprecation action | Status |
|---------------|---------|-------------------------------|--------|
| DELETE /agents/:id/legacy | route | Restore route + Deprecation/Sunset headers + @deprecated JSDoc + changelog | ❌ not done |
| ReviewRecord.legacy_score | response field | Restore field + @deprecated JSDoc + .describe + changelog | ❌ not done |

---

### Required artifacts before this change can ship

- [ ] `@deprecated` JSDoc added to every restored route handler / field / export
- [ ] `Deprecation: true` + `Sunset: <date>` headers set on every deprecated route
- [ ] Old routes still registered and returning their real response
- [ ] Changelog / migration note written (what, replacement, removal version/date)
- [ ] Removal deferred to a future change (not this one)

---

### Summary
<one or two sentences: what must be deprecated and the recommended sunset window>
```

---

### Example: fully filled-in report

```
## Deprecation-Policy Report
Branch: chore/drop-legacy-agent-api  vs  main        Mode: branch-diff
Silent removals found: 2

### Verdict
🔴 BLOCKED — 2 silent removals; deprecate before merging (see actions below)

---

### Removed item → prescribed action

| Removed thing | Surface | Prescribed deprecation action | Status |
|---------------|---------|-------------------------------|--------|
| DELETE /agents/:id/legacy (server/src/modules/agents/routes.ts) | route | Restore the route; add `Deprecation: true` + `Sunset: Wed, 31 Dec 2026 23:59:59 GMT` + `Link: </agents/:id>; rel="successor-version"`; add `@deprecated since v1.4 — use DELETE /agents/:id` JSDoc on the handler; changelog entry | ❌ not done |
| ReviewRecord.legacy_score (server/src/vendor/shared/contracts/review-api.ts) | response field | Restore the field; add `@deprecated since v1.4 — use \`score\`` JSDoc + `.describe('@deprecated — use \`score\`')`; changelog entry | ❌ not done |

---

### Required artifacts before this change can ship

- [ ] `@deprecated` JSDoc added to the restored `DELETE /agents/:id/legacy` handler and `ReviewRecord.legacy_score`
- [ ] `Deprecation: true` + `Sunset` headers set on `DELETE /agents/:id/legacy`
- [ ] `DELETE /agents/:id/legacy` still registered and returning its real response
- [ ] Changelog entry: "Deprecated DELETE /agents/:id/legacy → DELETE /agents/:id; legacy_score → score; removal v2.0, sunset 2026-12-31"
- [ ] Hard removal deferred to a post-sunset change (open a follow-up referencing this PR)

---

### Summary
Two surfaces were deleted outright. Restore both, mark them `@deprecated`, ship
the route with `Sunset: 2026-12-31`, document the replacements in the changelog,
and schedule the actual removal for v2.0 after the sunset date.
```

---

## Execution notes

- **Detect with the companions, remediate here.** Run `/breaking-change`
  (routes, request schemas, status codes) and `/response-schema` (response
  shapes) to FIND contract breaks; run this skill to turn each removal into a
  staged deprecation. A removal those skills flag as BREAKING should appear here
  with a prescribed deprecation path.
- **Never deprecate and remove in the same change.** Deprecation keeps the old
  surface working; removal comes only after the sunset date and at least one
  release cycle.
- **Read full files for renames.** A renamed route/symbol shows as a delete +
  add; confirm the old name is genuinely gone before prescribing.
- **Confirm exports are actually consumed** (`grep` across `server/src`,
  `client/src`, `reviewer-core/src`) before treating a removed `export` as
  policy-relevant — `reviewer-core` and `server/src/vendor/shared` are consumed
  as TypeScript source via path alias, so a removed export breaks consumers at
  compile time.
- **DB columns/tables are out of scope** — Drizzle migrations have their own
  expand/contract lifecycle; do not apply HTTP/JSDoc deprecation to schema
  columns.
- After emitting the report, invoke `engineering-insights` in END mode if you
  discovered a non-obvious deprecation pattern (e.g. an export consumed across
  more packages than expected, or a route with no clear successor).
