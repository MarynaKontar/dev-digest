# Domain Layer

The innermost ring. Defines the contracts all other layers depend on. Has no runtime dependencies beyond Zod.

## What Belongs Here

- **Port interfaces** — TypeScript `interface` definitions for every external dependency (`LLMProvider`, `GitHubClient`, `GitClient`, `CodeIndex`, `Embedder`, `SecretsProvider`, `AuthProvider`)
- **Zod domain schemas** — shared contracts between server and client (`vendor/shared/contracts/`)
- **Domain types** — TypeScript types derived from Zod via `z.infer<>`
- **Value objects** — immutable domain concepts with no runtime deps (e.g. `CompletionRequest`, `ModelInfo`)

## What Does NOT Belong Here

- Drizzle types (`$inferSelect`, `$inferInsert`, table references)
- Fastify types (`FastifyRequest`, `FastifyReply`, `RouteHandlerMethod`)
- Any `import from 'drizzle-orm'` or `import from 'fastify'`
- HTTP status codes, route prefixes, or response shapes
- Business logic, orchestration, or side effects

## Canonical Location in DevDigest

```
server/src/vendor/shared/
  adapters.ts        ← ALL port interfaces + Zod value-object schemas
  index.ts           ← re-exports everything from this layer
  contracts/
    platform.ts      ← domain entity schemas (PrMeta, PrDetail, RunTrace, …)
```

`vendor/shared/` is the canonical domain contract store. It is simultaneously vendored into `client/src/vendor/shared/` — both the HTTP server and the web client code against the same interfaces without a build step or published package.

## Port Interface Pattern

Each external dependency is represented as a TypeScript interface in `adapters.ts`. Services depend ONLY on the interface, never on the concrete class.

```ts
// Domain layer — adapters.ts (defines the port)
export interface LLMProvider {
  readonly id: 'openai' | 'anthropic' | 'openrouter';
  listModels(): Promise<ModelInfo[]>;
  complete(req: CompletionRequest): Promise<CompletionResult>;
  completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>>;
  embed(texts: string[]): Promise<number[][]>;
}

// Application layer — service.ts (depends on the port)
export class ReviewService {
  constructor(private container: Container) {}
  // resolves LLMProvider via container.llm('anthropic') — never new AnthropicProvider()
}

// Infrastructure layer — anthropic.ts (implements the port)
export class AnthropicProvider implements LLMProvider {
  readonly id = 'anthropic' as const;
  // ...
}
```

## Zod as Domain Contract

Zod schemas in `vendor/shared/` are more than validation utilities — they ARE the domain contract. They:

1. Define the shape of data that crosses layer boundaries
2. Provide runtime validation at system entry points (routes)
3. Generate TypeScript types via `z.infer<>` (compile-time safety)
4. Are shared between server and client without a build step

```ts
// vendor/shared/adapters.ts
export const ModelInfo = z.object({
  id: z.string(),
  provider: z.enum(['openai', 'anthropic', 'openrouter']),
  label: z.string().nullish(),
  // ...
});
export type ModelInfo = z.infer<typeof ModelInfo>; // type IS the schema
```

**Rule:** Export both the schema and the inferred type from the same file. Never write a manual TypeScript interface for a concept that already has a Zod schema — the schema IS the source of truth.

## Adding a New Port

When introducing a new external dependency:

1. Define its interface in `vendor/shared/adapters.ts`
2. Add it to `ContainerOverrides` in `platform/container.ts`
3. Implement it in `adapters/<name>/`
4. Wire it as a getter in the `Container` class

No other file changes are needed to make the port visible to services.

## See Also

- `zod` skill — HOW to write Zod schemas (mechanics, not placement)
- [references/application-layer.md](application-layer.md) — what services may import from this layer
- [references/di-container.md](di-container.md) — how ports are resolved to implementations
