# Delivery Layer

The outermost layer. Translates HTTP into application calls and application results into HTTP responses. Knows about Fastify; knows nothing about Drizzle or external SDKs.

## What Belongs Here

- **Route files** — `modules/<name>/routes.ts` — one default-export Fastify plugin per module
- **Request validation schemas** — Zod schemas declared inline or imported from `modules/_shared/schemas.ts`, wired via `fastify-type-provider-zod`
- **Response shaping** — mapping service DTOs to HTTP response bodies
- **HTTP concerns** — status codes, headers, SSE stream setup, rate-limit config on specific routes
- **`app.ts`** — plugin registration, global hooks (rate-limit, cors, helmet), global error handler

## What Does NOT Belong Here

- Business logic — delegate to the service
- Direct repository calls — routes call services, never repositories
- Direct adapter calls — routes do not call `container.github()` or `container.llm()` directly
- Drizzle queries — no `db.select()` in route handlers
- Domain validation of business invariants — that lives in services

## The Route-as-Skin Pattern

A route handler should read: **parse → call service → return**. Nothing else.

```ts
// modules/reviews/routes.ts — correct
const RunReviewBody = z.object({
  prId: z.string().uuid(),
  agentId: z.string().uuid().optional(),
  all: z.boolean().optional(),
});

app.post('/runs', { schema: { body: RunReviewBody } }, async (request) => {
  const { prId, agentId, all } = request.body; // already validated by framework
  const targets = await reviewService.resolveTargets(workspaceId, { agentId, all });
  return reviewService.runReview(workspaceId, prId, targets);
});

// WRONG — route reaching into infrastructure
app.post('/runs', async (request) => {
  const row = await db.select().from(pullsTable)  // ❌ Drizzle in route
    .where(eq(pullsTable.id, request.body.prId));
  const llm = await container.llm('anthropic');   // ❌ adapter resolved in route
  const github = await container.github();        // ❌ adapter in route
});
```

## Validation Responsibility

Routes own HTTP input shape validation. Services own domain invariant validation.

```ts
// Route: validates HTTP shape, rejects malformed requests before the handler runs
const CreateAgentBody = z.object({
  name: z.string().min(1).max(100),
  model: z.string(),
  provider: z.enum(['openai', 'anthropic', 'openrouter']),
  systemPrompt: z.string().optional(),
});

app.post('/agents', { schema: { body: CreateAgentBody } }, async (request) => {
  // request.body is already typed + validated — do NOT call CreateAgentBody.parse()
  return agentsService.createAgent(workspaceId, request.body);
});

// Service: validates domain invariants (e.g. duplicate name, model availability)
async createAgent(workspaceId: string, input: CreateAgentInput): Promise<AgentDto> {
  const existing = await this.repo.findByName(workspaceId, input.name);
  if (existing) throw new AppError('agent_name_taken', 'Name already in use', 409);
  // ...
}
```

**Rule:** Do NOT call `Schema.parse()` inside a handler. `fastify-type-provider-zod` already validated `request.body`. A second parse is redundant and produces confusing double-errors.

## Plugin Registration

Each module registers as a Fastify plugin. Registration is static — not autoloaded.

```ts
// modules/index.ts — only file that lists all modules
export async function registerModules(app: FastifyInstance, container: Container) {
  await app.register(reviewsRoutes,  { prefix: '/reviews',  container });
  await app.register(agentsRoutes,   { prefix: '/agents',   container });
  await app.register(reposRoutes,    { prefix: '/repos',    container });
  await app.register(pullsRoutes,    { prefix: '/pulls',    container });
  await app.register(settingsRoutes, { prefix: '/settings', container });
}
```

Adding a new module: create `modules/<name>/routes.ts` as a default-export Fastify plugin, then add one line here.

## Receiving the Container

Routes receive the container via Fastify plugin options — never by importing it from a module path.

```ts
// modules/reviews/routes.ts
import type { Container } from '../../platform/container.js';

export default async function reviewsRoutes(
  app: FastifyInstance,
  opts: { container: Container },
) {
  const reviewService = new ReviewService(opts.container);

  app.get('/:id', async (request) => {
    return reviewService.getReview(workspaceId, request.params.id);
  });
}
```

## See Also

- `fastify-best-practices` skill — HOW to write Fastify routes, plugins, hooks, serialization
- [references/application-layer.md](application-layer.md) — which services routes may call
- [references/di-container.md](di-container.md) — how routes receive their dependencies
- [references/anti-patterns.md](anti-patterns.md) — violations specific to this layer
