# Anti-patterns

Cross-layer violations that break the Onion dependency rule. Each entry shows the violation, identifies the broken boundary, and gives the fix.

---

## 1. Drizzle query directly in a service

**Boundary broken:** Application → Infrastructure

```ts
// ❌ modules/reviews/service.ts
import { db } from '../../db/client.js';
import { eq } from 'drizzle-orm';
import { pullsTable } from '../../db/schema.js';

async getPull(prId: string) {
  return db.select().from(pullsTable).where(eq(pullsTable.id, prId)); // ❌
}
```

**Fix:** Move the query into `ReviewRepository.getPull(prId)` and call it from the service via `this.repo.getPull(prId)`.

---

## 2. Fastify type in a service or repository

**Boundary broken:** Application/Infrastructure ← Delivery

```ts
// ❌ modules/reviews/service.ts
import type { FastifyRequest } from 'fastify';

async runReview(req: FastifyRequest) { ... } // ❌ Delivery type leaking inward
```

**Fix:** Extract the needed fields in the route handler and pass them as plain domain types or primitives to the service.

---

## 3. Route calling a repository directly (skipping the service)

**Boundary broken:** Delivery → Infrastructure (skips Application)

```ts
// ❌ modules/reviews/routes.ts
import { ReviewRepository } from './repository.js';

app.get('/reviews/:id', async (request) => {
  const repo = new ReviewRepository(db); // ❌ bypasses service layer
  return repo.getReview(request.params.id);
});
```

**Fix:** Routes call the service. The service calls the repository. Never skip a layer.

---

## 4. Reaching into another module's folder

**Boundary broken:** Cross-module coupling at the Infrastructure level

```ts
// ❌ modules/reviews/service.ts
import { AgentsRepository } from '../agents/repository.js'; // ❌ private to agents module
```

**Fix:** Cross-cutting entities live on the container. Use `container.agentsRepo` — it is constructed in the composition root and shared explicitly.

---

## 5. `new ConcreteAdapter(...)` inside a service

**Boundary broken:** Application constructs Infrastructure directly

```ts
// ❌ modules/reviews/service.ts
import { AnthropicProvider } from '../../adapters/llm/anthropic.js';

// In a method:
const key = process.env.ANTHROPIC_API_KEY!;
const llm = new AnthropicProvider(key); // ❌ service owns infrastructure lifecycle
```

**Fix:** Resolve via `await this.container.llm('anthropic')`. The container is the only place that constructs adapters.

---

## 6. Drizzle row type leaking from repository into service or route

**Boundary broken:** Infrastructure internal type used as Application/Delivery currency

```ts
// db/rows.ts — fine here:
export type AgentRow = typeof agentsTable.$inferSelect;

// ❌ modules/reviews/service.ts — leaks Infrastructure into Application
import type { AgentRow } from '../../db/rows.js';

async resolveTargets(...): Promise<AgentRow[]> { ... } // ❌ Drizzle type as return
```

**Fix:** Map to a domain DTO or Zod-inferred type inside the repository (or at the service boundary). The service and route deal with `AgentDto`, not `AgentRow`.

---

## 7. Manual `Schema.parse()` in a route handler

**Boundary broken:** Not a layer violation — but breaks the "validate once" contract with `fastify-type-provider-zod`

```ts
// ❌ modules/reviews/routes.ts
app.post('/runs', { schema: { body: RunReviewBody } }, async (request) => {
  const parsed = RunReviewBody.parse(request.body); // ❌ already parsed by framework
});
```

**Fix:** Remove the manual parse. When a route declares `schema: { body: RunReviewBody }`, `fastify-type-provider-zod` validates and types `request.body` before the handler runs. A second parse is redundant and will produce confusing double-error paths.

---

## 8. Bypassing `ContainerOverrides` in tests

**Boundary broken:** Tests couple to concrete Infrastructure instead of using the seam

```ts
// ❌ A test file
import { AnthropicProvider } from '../adapters/llm/anthropic.js';
vi.mock('../adapters/llm/anthropic.js', () => ({
  AnthropicProvider: vi.fn().mockImplementation(() => ({ complete: vi.fn() })),
})); // ❌ module-level mock bypasses the DI seam
```

**Fix:** Construct a `Container` with `ContainerOverrides` passing a mock `LLMProvider`. The seam exists precisely for this — use it.

```ts
// Correct
const container = new Container(testConfig, testDb, {
  llm: { anthropic: { id: 'anthropic', complete: vi.fn(), completeStructured: vi.fn(), ... } },
});
const service = new ReviewService(container);
```

---

## 9. Importing domain contracts from the wrong path

**Not a layer violation — but a copy/sync hazard**

```ts
// ❌ Importing from the server path inside the client (or vice versa)
import type { LLMProvider } from '../../server/src/vendor/shared/adapters.js';
```

**Fix:** Always import from `@devdigest/shared` (resolved via tsconfig path alias). The alias points to the correct vendored copy per package and insulates you from path changes.
