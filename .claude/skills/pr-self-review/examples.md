# PR Self-Review — Calibration Examples

Each bucket below shows three diffs you might encounter:

- **🚫 CRITICAL** — survives the confidence gate, blocks the push.
- **⚠️ HIGH** — reported, does not block, fix advised.
- **✅ DO NOT FLAG** — a false-positive trap. Looks suspicious, is actually fine.
  Suppress it.

Paths and APIs are real DevDigest conventions (Fastify 5 + `ZodTypeProvider`,
Drizzle/Postgres, onion layers `routes.ts`/`service.ts`/`repository.ts`,
vendored `@devdigest/shared`, Next 15 App Router, pure `reviewer-core`).

Use these to calibrate severity and—just as important—to learn when to stay
quiet.

---

## Backend-server bucket

### 🚫 CRITICAL — Delivery imports Infrastructure directly (onion-architecture)

```diff
# server/src/modules/reviews/routes.ts
  import { ReviewService } from './service.js';
+ import { RunRepo } from './repository/run.repo.js';

  export default async function reviewsRoutes(appBase: FastifyInstance) {
    const app = appBase.withTypeProvider<ZodTypeProvider>();
    const { container } = app;
-   const service = new ReviewService(container);
+   const runRepo = new RunRepo(container.db);   // routes now talks to the DB directly
+   app.get('/runs/:id', async (req) => runRepo.findById(req.params.id));
```

**Why CRITICAL:** the Delivery layer reaches straight into Infrastructure,
bypassing `ReviewService`. This breaks dependency inversion — the one rule of the
onion. HTTP code now owns persistence concerns and can't be tested without a DB.
**Fix:** keep the call in `ReviewService`; let Delivery depend only on the
service, and resolve repos via the container inside Application.

### ⚠️ HIGH — New route with no Zod schema and `any` body (fastify + zod)

```diff
# server/src/modules/agents/routes.ts
+ app.post('/agents', async (req) => {
+   const body = req.body as { name: string; model: string };  // unchecked cast
+   return service.createAgent(body);
+ });
```

**Why HIGH:** the project validates every route through
`withTypeProvider<ZodTypeProvider>()` with a Zod `schema`. This handler trusts
`req.body` via a cast — malformed input reaches the service untyped. Not CRITICAL
(no privilege/data-loss path shown), but wrong under realistic input.
**Fix:** `schema: { body: CreateAgentRequest }` and `CreateAgentRequest.parse(req.body)`
from `@devdigest/shared`.

### ✅ DO NOT FLAG — composition root importing across layers

```diff
# server/src/platform/container.ts
+ import { ReviewRepo } from '../modules/reviews/repository/review.repo.js';
+ import { OpenRouterClient } from '../adapters/llm/openrouter.js';
+ import { ReviewService } from '../modules/reviews/service.js';
```

**Why it's fine:** `platform/container.ts` is the **composition root** — the one
file explicitly allowed to import across every layer to wire adapters. This is
the intended shape, not a violation. Flagging it shows you didn't apply the layer
map. (Contrast with the CRITICAL above, where `routes.ts` did the importing.)

---

## reviewer-core bucket

### 🚫 CRITICAL — Pure engine imports the server (onion-architecture)

```diff
# reviewer-core/src/review/run.ts
+ import { container } from '../../../server/src/platform/container.js';
+ import { ReviewRepo } from '../../../server/src/modules/reviews/repository.js';

  export async function runReview(diff: string) {
+   const repo = new ReviewRepo(container.db);   // engine now depends on the app
    ...
  }
```

**Why CRITICAL:** `reviewer-core` is a pure, leaf engine (diff → prompt → LLM →
findings) consumed as source by the server. Importing `server/**` inverts the
dependency and creates a cycle; the engine can no longer be reused or tested in
isolation. **Fix:** the engine receives everything it needs (LLM client, config)
as injected arguments; persistence stays in the server.

### ⚠️ HIGH — LLM output trusted without Zod validation (zod / security)

```diff
# reviewer-core/src/output/to-review.ts
- const parsed = FindingsSchema.parse(JSON.parse(raw));
+ const parsed = JSON.parse(raw) as Finding[];   // trusts model output verbatim
  return parsed;
```

**Why HIGH:** the model can return malformed or adversarial JSON; casting skips
the runtime guard and lets a bad shape become a typed `Finding[]`. **Fix:** keep
`FindingsSchema.safeParse(JSON.parse(raw))` and handle the failure branch.

### ✅ DO NOT FLAG — no Fastify/Drizzle rules apply here

```diff
# reviewer-core/src/llm/openrouter.ts
+ export async function complete(client: LlmClient, prompt: string) {
+   const res = await client.chat({ messages: [{ role: 'user', content: prompt }] });
+   return res.text;
+ }
```

**Why it's fine:** this is a network call through an **injected** `LlmClient`
port — exactly how a pure engine should reach the outside world. Do **not** flag
"missing rate limiting," "no JSON schema," or "no DB transaction" — those are
Fastify/Drizzle/Postgres concerns and this bucket does not load those skills.

---

## Frontend bucket

### 🚫 CRITICAL — server secret pulled into a client component (security / next)

```diff
# client/src/app/settings/[section]/_components/ModelPicker.tsx
  'use client';
+ const key = process.env.OPENROUTER_API_KEY;            // not NEXT_PUBLIC_*
+ const models = await fetch('https://openrouter.ai/api/v1/models', {
+   headers: { Authorization: `Bearer ${key}` },
+ }).then((r) => r.json());
```

**Why CRITICAL:** a `'use client'` component runs in the browser. A non-`NEXT_PUBLIC_`
secret either resolves to `undefined` (broken) or, if exposed, leaks the
OpenRouter key into the client bundle. **Fix:** fetch models server-side (route
handler / server component) and pass only the safe list to the client; never read
provider secrets in `client/**`.

### ⚠️ HIGH — async `params` read without `await` (next-best-practices)

```diff
# client/src/app/repos/[repoId]/page.tsx
- export default async function RepoPage({ params }: { params: { repoId: string } }) {
-   const repo = await getRepo(params.repoId);
+ export default async function RepoPage({ params }: { params: Promise<{ repoId: string }> }) {
+   const repo = await getRepo(params.repoId);   // params is a Promise in Next 15 — repoId is undefined
```

**Why HIGH:** in Next 15 `params`/`searchParams` are async. Reading `params.repoId`
without awaiting yields `undefined`, so the page fetches the wrong repo under real
navigation. **Fix:** `const { repoId } = await params;`.

### ✅ DO NOT FLAG — plain interpolation is auto-escaped (security)

```diff
# client/src/components/diff-viewer/FindingRow.tsx
+ <span className="finding-msg">{finding.message}</span>
```

**Why it's fine:** even though `finding.message` originates from LLM output,
rendering it as a JSX child means React auto-escapes it. There is no
`dangerouslySetInnerHTML` and no `href={…}`. This is the framework's built-in
safety net — flagging it as XSS is a LOW-confidence false positive. (It *would*
be CRITICAL if it were `dangerouslySetInnerHTML={{ __html: finding.message }}`.)

---

## Shared-contracts bucket

### 🚫 CRITICAL — vendor copy edited on one side only (sync drift)

```diff
# server/src/vendor/shared/contracts/findings.ts   (canonical edited)
  export const Finding = z.object({
    id: z.string(),
    severity: z.enum(['critical', 'high', 'medium', 'low']),
+   confidence: z.number().min(0).max(1),
  });
# client/src/vendor/shared/contracts/findings.ts   — UNCHANGED
```

Detection:

```bash
diff -u server/src/vendor/shared/contracts/findings.ts \
        client/src/vendor/shared/contracts/findings.ts
# → the two copies differ
```

**Why CRITICAL:** `@devdigest/shared` is vendored — the server copy and client
copy must be byte-identical. Editing one side means server and client now compile
against different `Finding` shapes; the client will mis-parse responses at
runtime. **Fix:** copy the canonical `server/src/vendor/shared` version into
`client/src/vendor/shared` so `diff -rq` reports no differences.

### ⚠️ HIGH — additive field with no validation downstream (zod)

```diff
# server/src/vendor/shared/contracts/review-api.ts  (mirrored to client too)
  export const RunRequest = z.object({
    agentId: z.string().optional(),
    all: z.boolean().optional(),
+   priority: z.number().optional(),   // new optional field, both copies updated
  });
```

**Why HIGH (not CRITICAL):** the field is **optional and additive**, and both
copies were updated (no drift), so it is backward-compatible. It's HIGH rather
than benign only if no consumer validates/uses it, leaving a silently-ignored
input. **Fix:** confirm both vendor trees match and that the consuming route
actually reads `priority`. A *required* new field or a removed/narrowed field
would instead be CRITICAL (breaking).

### ✅ DO NOT FLAG — pre-existing drift on a file this PR did not touch

```bash
diff -rq server/src/vendor/shared client/src/vendor/shared
# Files .../adapters.ts and .../adapters.ts differ   ← but adapters.ts is NOT in this diff
```

**Why it's fine:** the review scope is the **current diff**. `adapters.ts`
already differs in the repo, but if this PR did not modify it, it is not this
PR's regression — reporting it would block an unrelated change. Only flag
sync-drift on vendor files **present in the diff**. (Worth a one-line note to the
user, not a CRITICAL finding.)

---

## Migrations bucket

### 🚫 CRITICAL — destructive column drop, no acknowledgement

```diff
# server/src/db/migrations/0007_drop_legacy_cost.sql
+ ALTER TABLE reviews DROP COLUMN run_cost;
```

**Why CRITICAL:** `DROP COLUMN` is irreversible and silently destroys existing
data with no rollback path or stated acknowledgement. **Fix:** confirm the data
is truly dead, document the loss in the PR, and stage it (deprecate → backfill →
drop in a later migration) if anything still reads it.

### ⚠️ HIGH — NOT NULL added with no default on a populated table

```diff
# server/src/db/migrations/0008_findings_confidence.sql
+ ALTER TABLE findings ADD COLUMN confidence double precision NOT NULL;
```

**Why HIGH:** adding `NOT NULL` with no `DEFAULT` fails on any table that already
has rows, breaking `pnpm db:migrate`. **Fix:** add `DEFAULT 0` (or backfill, then
set `NOT NULL` in a follow-up).

### ✅ DO NOT FLAG — additive nullable column, idempotent guard present

```diff
# server/src/db/migrations/0009_add_note.sql
+ ALTER TABLE reviews ADD COLUMN IF NOT EXISTS note text;
```

**Why it's fine:** nullable, additive, guarded with `IF NOT EXISTS`. No data
loss, no lock surprise, idempotent. Nothing to report.

---

## Infra / config bucket

### 🚫 CRITICAL — volume-destroying command in a script

```diff
# scripts/reset.sh
+ docker compose down -v        # -v deletes the devdigest_pgdata volume
```

**Why CRITICAL:** `down -v` removes the `devdigest_pgdata` volume — every
imported repo and saved review is gone. This is an explicit do-not-touch rule.
**Fix:** `docker compose down` (no `-v`); never script `-v`.

### ⚠️ HIGH — committed credential in config

```diff
# docker-compose.yml
  environment:
-   POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
+   POSTGRES_PASSWORD: devdigest_prod_9f3a1c
```

**Why HIGH:** a hardcoded credential enters version control and shell history.
(It rises to CRITICAL if it is a real production/provider secret — e.g. an
`OPENROUTER_API_KEY` or a live DB password.) **Fix:** keep it in `.env` (which is
git-ignored) and reference `${POSTGRES_PASSWORD}`.

### ✅ DO NOT FLAG — dev ports in a dev compose file

```diff
# docker-compose.yml
  ports:
-   - '5432:5432'
+   - '5432:5432'
+   - '3001:3001'
```

**Why it's fine:** 3000/3001 (dev) and the Postgres port are the project's
expected local surface. Exposing them in the **dev** compose file is by design —
not a misconfiguration. (Exposing an unexpected port, or binding to `0.0.0.0` in
a prod config, would be MEDIUM/HIGH.)

---

## e2e bucket

### ⚠️ HIGH — hardcoded prod-port URL breaks hermetic runs

```diff
# e2e/tests/review.spec.ts
+ await page.goto('http://localhost:3000/repos');   // dev port, not the e2e alt port
```

**Why HIGH:** e2e runs hermetically on alt ports (web 3100, API 3101, Postgres
5433) so it never touches the dev DB. A hardcoded `:3000` URL points the test at
the dev server. **Fix:** read the base URL from the e2e config/env, not a
literal.

### ✅ DO NOT FLAG — `any` in a test helper

```diff
# e2e/support/fixtures.ts
+ export function stubRun(overrides: any = {}) {
+   return { id: 'run_1', status: 'done', ...overrides };
+ }
```

**Why it's fine:** this is test scaffolding, not production code. The e2e bucket
is a *light* pass — an `any` in a fixture builder is acceptable convenience and
does not warrant a finding. (Production `any` that erases a contract type would
be HIGH — but not here.)
