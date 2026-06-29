# Application Layer

Orchestrates use cases. Contains all business logic that is NOT about persistence, delivery, or external systems.

## What Belongs Here

- **Service classes** — `modules/<name>/service.ts`, one per module
- **Use-case orchestration** — calling ports in the right order, error mapping, event publishing
- **Run executors** — `platform/run-executor.ts` (the core review pipeline)
- **Domain logic utilities** — `platform/grounding.ts`, `platform/prompts.ts`, `platform/trace-builder.ts`
- **Error definitions** — `platform/errors.ts` (domain error types; no framework deps)

## What Does NOT Belong Here

- Drizzle queries (`db.select().from(...)`) — delegate to a repository method
- Fastify types (`FastifyRequest`, `FastifyReply`) — extract what you need at the route
- HTTP status codes or response shaping
- `new OctokitGitHubClient(...)`, `new AnthropicProvider(...)` — those are Infrastructure; services receive them via the container
- `process.env` access — use `container.config` or `container.secrets`

## Allowed Imports

```ts
// YES — domain interfaces (ports)
import type { LLMProvider, GitHubClient } from '@devdigest/shared';

// YES — domain types derived from Zod
import type { PrMeta, FindingActionKind, RunTrace } from '@devdigest/shared';

// YES — shared error types
import { AppError, NotFoundError } from '../../platform/errors.js';

// YES — other application-layer utilities (platform/)
import { groundFindings } from '../../platform/grounding.js';

// YES — the container (to resolve infrastructure at runtime)
import type { Container } from '../../platform/container.js';

// NO — infrastructure implementations
import { OctokitGitHubClient } from '../../adapters/github/octokit.js'; // ❌

// NO — Drizzle ORM directly
import { db } from '../../db/client.js';   // ❌
import { eq } from 'drizzle-orm';          // ❌
import { agentsTable } from '../../db/schema.js'; // ❌

// NO — Fastify
import type { FastifyRequest } from 'fastify'; // ❌
```

## Service Design Rules

1. **One service per module** — `ReviewService`, `AgentsService`, `RepoIntelService`. Don't create multiple services for one module's use cases.

2. **Constructor receives Container** — never receive concrete adapters directly; the container is the dependency resolver.

3. **Resolve ports via container** — call `container.llm('anthropic')`, `container.github()` — never `new AnthropicProvider(key)`.

4. **Delegate persistence to repositories** — services may construct or receive repositories; they do not hold Drizzle table references.

5. **Return domain types** — services return plain objects or Zod-inferred types. Never return a Drizzle `$inferSelect` row directly.

6. **Cross-module reads via container** — use `container.agentsRepo`, `container.reviewRepo` for cross-cutting entities. Never import another module's repository file directly.

## Pattern: ReviewService boundary

```ts
export class ReviewService {
  private repo: ReviewRepository;       // Infrastructure — received, not new-ed here
  private agents: Container['agentsRepo'];

  constructor(private container: Container) {
    this.repo = new ReviewRepository(container.db); // OK: repo is Infrastructure
    this.agents = container.agentsRepo;             // OK: cross-module entity via root
  }

  async runReview(workspaceId: string, prId: string, targets: AgentRow[]) {
    const pull = await this.repo.getPull(workspaceId, prId); // repo call, not Drizzle
    if (!pull) throw new NotFoundError('Pull request not found');

    const llm = await this.container.llm('anthropic'); // port interface, not concrete class
    // orchestration: diff → prompt → llm.completeStructured → groundFindings → repo.save
  }
}
```

## See Also

- [references/domain-layer.md](domain-layer.md) — the port interfaces services depend on
- [references/infrastructure-layer.md](infrastructure-layer.md) — what repositories provide
- [references/di-container.md](di-container.md) — how the container resolves dependencies at runtime
