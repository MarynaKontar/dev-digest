# DI Container (Composition Root)

`platform/container.ts` is the single place in the codebase where concrete implementations are wired to domain interfaces. It is the **only** file allowed to import across all layers.

## Composition Root Principle

The composition root:
- Constructs every concrete adapter and repository
- Resolves domain interfaces to their implementations at runtime
- Uses lazy getters so construction is deferred until first use (avoids unnecessary secret lookups on boot)
- Is instantiated once per app process — or once per test

No other file may call `new ConcreteAdapter(...)`. Services, repositories, and routes receive pre-constructed dependencies via the container.

## Container Structure

```ts
export class Container {
  // Eagerly constructed — always needed on boot
  readonly config: AppConfig;
  readonly db: Db;
  readonly secrets: SecretsProvider;
  readonly auth: AuthProvider;
  readonly jobs: JobRunner;
  readonly runBus: RunBus;

  // Lazily constructed — gated on first use or async secret lookup
  get git(): GitClient { ... }
  get agentsRepo(): AgentsRepository { ... }
  get reviewRepo(): ReviewRepository { ... }
  get repoIntel(): RepoIntel { ... }
  get depgraph(): DepGraph { ... }
  get tokenizer(): Tokenizer { ... }
  get priceBook(): PriceBook { ... }

  async github(): Promise<GitHubClient> { ... }  // requires GITHUB_TOKEN
  async llm(id): Promise<LLMProvider> { ... }    // requires API key per provider
  async embedder(): Promise<Embedder> { ... }    // requires OPENAI_API_KEY + flag
}
```

## The Override Seam (Test Injection)

`ContainerOverrides` is the test seam. Tests construct a `Container` with mock adapters; production boots with real ones. This is the only injection mechanism — never use module-level mocking as a substitute.

```ts
export interface ContainerOverrides {
  secrets?: SecretsProvider;
  auth?: AuthProvider;
  github?: GitHubClient;
  git?: GitClient;
  codeIndex?: CodeIndex;
  embedder?: Embedder;
  llm?: Partial<Record<'openai' | 'anthropic' | 'openrouter', LLMProvider>>;
  repoIntel?: RepoIntel;
  depgraph?: DepGraph;
  tokenizer?: Tokenizer;
}

// In tests
const container = new Container(testConfig, testDb, {
  llm: { anthropic: mockAnthropicProvider },
  github: mockGitHubClient,
  git: mockGitClient,
});
```

Overrides always win — the getter checks `this.overrides.<field>` first before constructing the real implementation.

## Lazy Resolution Pattern

```ts
get git(): GitClient {
  if (this.overrides.git) return this.overrides.git;  // test seam wins
  this._git ??= new SimpleGitClient(this.config.cloneDir); // lazy init
  return this._git;
}

async llm(id: 'openai' | 'anthropic' | 'openrouter'): Promise<LLMProvider> {
  const injected = this.overrides.llm?.[id];
  if (injected) return injected;             // test seam
  const cached = this.llmCache.get(id);
  if (cached) return cached;                // already built this session
  const provider = await this.buildLlm(id); // secret lookup + construction
  this.llmCache.set(id, provider);
  return provider;
}
```

## Cache Invalidation

When a user updates an API key via the settings UI, call `container.invalidateSecretCaches()`. This clears `llmCache`, `_github`, and `_embedder` so the next resolution picks up the new secret without restarting the server.

```ts
invalidateSecretCaches(): void {
  this.llmCache.clear();
  this._github = undefined;
  this._embedder = undefined;
}
```

## Rules

1. **Only `container.ts` may call `new ConcreteAdapter(...)`** — nowhere else.
2. **Services receive the container, not individual adapters** — `constructor(private container: Container)`.
3. **Repositories are constructed in the container or inside a service constructor** — never imported and instantiated in routes.
4. **Tests use `ContainerOverrides` exclusively** — no `vi.mock()` patching of adapter modules.
5. **New adapters follow the pattern:** add to `ContainerOverrides` interface → add getter → add to `buildLlm`/constructor → export from `adapters/index.ts`.
6. **Shared cross-module repositories live on the container** — `container.agentsRepo`, `container.reviewRepo` — not imported from module folders.

## See Also

- [references/infrastructure-layer.md](infrastructure-layer.md) — what adapters the container wraps
- [references/testing-strategy.md](testing-strategy.md) — how ContainerOverrides enables hermetic unit tests
- [references/anti-patterns.md](anti-patterns.md) — violations of the composition root rule
