# Testing Strategy

How the Onion Architecture enables two tiers of hermetic tests: unit tests with injected mocks, and integration tests against a real database.

## Two Test Tiers

DevDigest splits tests by filename convention:

| File pattern | What it tests | Database | Infrastructure |
|---|---|---|---|
| `*.test.ts` | Unit — services, helpers, grounding, DTOs | None | Mocked via `ContainerOverrides` |
| `*.it.test.ts` | Integration — repositories, DB-backed flows | Testcontainers Postgres | Real Drizzle against real schema |

```bash
# Unit tests only (fast, no Docker)
pnpm exec vitest run --exclude '**/*.it.test.ts'

# Integration tests only (requires Docker)
pnpm exec vitest run .it.test
```

Integration tests self-skip when Docker is unavailable — they detect the absence of a daemon and exit cleanly. Production code never changes for this.

## Unit Tests: ContainerOverrides as the Seam

Services receive all dependencies via the container, so unit tests inject lightweight mock adapters — no filesystem, no network, no database required.

```ts
// modules/reviews/service.test.ts
import { Container } from '../../platform/container.js';
import { ReviewService } from './service.js';

const mockLlm: LLMProvider = {
  id: 'anthropic',
  listModels: async () => [],
  complete: async () => ({
    text: 'mock response',
    model: 'claude-3-5-sonnet',
    tokensIn: 10,
    tokensOut: 50,
    costUsd: 0,
  }),
  completeStructured: async () => ({
    data: mockFindings,
    model: 'claude-3-5-sonnet',
    tokensIn: 10,
    tokensOut: 200,
    costUsd: 0,
    raw: '...',
    attempts: 1,
  }),
  embed: async () => [],
};

const container = new Container(testConfig, testDb, {
  llm: { anthropic: mockLlm },
  github: mockGitHubClient,
  git: mockGitClient,
});

const service = new ReviewService(container);

it('grounds findings against the diff', async () => {
  const result = await service.runReview(workspaceId, prId, [testAgent]);
  expect(result.runs).toHaveLength(1);
});
```

The architecture enforces the seam: because `AnthropicProvider` is never imported directly in the service, there is nothing to mock at the module level. The container IS the injection point.

## Integration Tests: Testcontainers

Repository tests (`*.it.test.ts`) spin up a real Postgres instance via `@testcontainers/postgresql`, run all migrations, and test real Drizzle queries against the full schema.

```ts
// modules/agents/repository.it.test.ts
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { migrate } from '../../db/migrate.js';
import { AgentsRepository } from './repository.js';

let db: Db;
let container: StartedPostgreSqlContainer;

beforeAll(async () => {
  container = await new PostgreSqlContainer().start();
  const client = postgres(container.getConnectionUri());
  db = drizzle(client);
  await migrate(db); // applies all migrations — same as production
});

afterAll(async () => {
  await container.stop();
});

it('creates and retrieves an agent', async () => {
  const repo = new AgentsRepository(db);
  const id = await repo.create({ workspaceId, name: 'Test', model: 'claude-3-5-sonnet', provider: 'anthropic' });
  const agent = await repo.getById(workspaceId, id);
  expect(agent?.name).toBe('Test');
});
```

These tests catch: migration correctness, Drizzle query shape mismatches, constraint violations, transaction rollback behaviour, and pgvector index errors.

## What Each Tier Catches

| Tier | Catches | Does NOT catch |
|---|---|---|
| Unit | Logic bugs in services, grounding rules, DTO mapping, error handling | Real DB schema mismatches, Drizzle query errors, network adapter failures |
| Integration | Real DB schema correctness, Drizzle query validity, migration completeness | Business logic bugs, grounding rules, LLM response handling |

Run both before merging anything that touches a service or repository.

## Why Onion Makes This Possible

Without layering, a service that calls `new AnthropicProvider()` directly cannot be unit-tested without:
- Real API keys, or
- Module-level mocking (fragile — breaks on refactors, ties tests to import paths)

The Onion architecture enforces the seam at construction time. `ContainerOverrides` exposes it cleanly. The result: unit tests are fast and deterministic; integration tests are slow but faithful — and the two tiers never overlap.

## See Also

- [references/di-container.md](di-container.md) — the `ContainerOverrides` interface
- [references/infrastructure-layer.md](infrastructure-layer.md) — what integration tests verify
- [references/anti-patterns.md](anti-patterns.md) — bypassing ContainerOverrides in tests (anti-pattern #8)
