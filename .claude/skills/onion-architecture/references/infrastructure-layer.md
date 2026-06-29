# Infrastructure Layer

Implements the domain interfaces with real technology: Drizzle for persistence, Octokit for GitHub, simple-git for Git operations, ripgrep for code search.

## What Belongs Here

- **Adapter implementations** — concrete classes that implement port interfaces from the domain layer
  - `adapters/llm/anthropic.ts` → implements `LLMProvider`
  - `adapters/llm/openai.ts` → implements `LLMProvider`
  - `adapters/github/octokit.ts` → implements `GitHubClient`
  - `adapters/git/simple-git.ts` → implements `GitClient`
  - `adapters/codeindex/ripgrep.ts` → implements `CodeIndex`
  - `adapters/embedder/openai.ts` → implements `Embedder`
  - `adapters/secrets/local.ts` → implements `SecretsProvider`
  - `adapters/auth/local.ts` → implements `AuthProvider`
- **Repositories** — `modules/<name>/repository.ts` — Drizzle-backed data access objects
- **DB internals** — `db/schema.ts`, `db/client.ts`, `db/rows.ts` (Drizzle table defs and inferred types)

## The Repository Boundary Rule

Drizzle-inferred row types (`$inferSelect`, `$inferInsert`) and table references MUST NOT cross the repository boundary. The repository maps rows to domain or DTO types before returning.

```ts
// db/rows.ts — Drizzle inferred types (Infrastructure-internal)
export type AgentRow = typeof agentsTable.$inferSelect;

// modules/agents/repository.ts — OK to use AgentRow here
export class AgentsRepository {
  constructor(private db: Db) {}

  async getById(workspaceId: string, id: string): Promise<AgentRow | undefined> {
    const [row] = await this.db
      .select()
      .from(agentsTable)
      .where(and(eq(agentsTable.id, id), eq(agentsTable.workspaceId, workspaceId)));
    return row; // AgentRow is acceptable as the return because callers treat it opaquely
  }
}

// modules/reviews/service.ts — NOT OK to use AgentRow directly as output to routes
// Map to a domain DTO inside the repo or service before the value leaves the layer:
async reviewsForPull(prId: string): Promise<ReviewDto[]> {
  const rows = await this.repo.reviewsForPull(prId);
  return rows.map(({ review, findings }) => reviewToDto(review, findings)); // mapped ✓
}
```

When richer mapping is needed (e.g. joining two tables into a single domain type), do it inside the repository. The service should receive a domain-ready value, not raw rows.

## Adapter Implementation Pattern

Every adapter implements a domain interface — it does not invent new public APIs beyond what the interface declares.

```ts
// adapters/llm/anthropic.ts
import Anthropic from '@anthropic-ai/sdk';
import type {
  LLMProvider,
  CompletionRequest,
  CompletionResult,
} from '@devdigest/shared';

export class AnthropicProvider implements LLMProvider {
  readonly id = 'anthropic' as const;
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    // Anthropic SDK call → map SDK response to CompletionResult domain type
  }
}
```

The adapter takes raw external SDK types (Anthropic, Octokit, etc.) and translates them to domain types before returning.

## Allowed Imports

```ts
// YES — domain interfaces (to implement them)
import type { LLMProvider, GitHubClient } from '@devdigest/shared';

// YES — domain types (to produce them as return values)
import type { CompletionResult, PrMeta } from '@devdigest/shared';

// YES — Drizzle ORM (in repositories only)
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq, and, desc } from 'drizzle-orm';
import { agentsTable } from '../../db/schema.js';

// YES — external SDKs matching the adapter
import Anthropic from '@anthropic-ai/sdk';
import { Octokit } from 'octokit';
import simpleGit from 'simple-git';

// NO — application services
import { ReviewService } from '../../modules/reviews/service.js'; // ❌

// NO — Fastify
import type { FastifyInstance } from 'fastify'; // ❌

// NO — importing another module's repository from within a repository
import { AgentsRepository } from '../agents/repository.js'; // ❌ (use container)
```

## Adding a New Adapter

1. Create `adapters/<name>/<impl>.ts` implementing the domain interface
2. Create `adapters/mocks.ts` entry (or update it) with a mock for tests
3. Add the type to `ContainerOverrides` in `platform/container.ts`
4. Add a getter (or async factory) in the `Container` class
5. Export from `adapters/index.ts`

## See Also

- `drizzle-orm-patterns` skill — HOW to write Drizzle queries, relations, transactions
- [references/domain-layer.md](domain-layer.md) — the interfaces this layer implements
- [references/di-container.md](di-container.md) — how adapters are constructed and injected
- [references/anti-patterns.md](anti-patterns.md) — common violations in this layer
