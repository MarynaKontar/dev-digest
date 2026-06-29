# Layer Map

The four concentric layers of the DevDigest backend and the one rule that governs them.

## The Dependency Rule

> "Source code dependencies must point only inward, toward higher-level policies."
> — Robert C. Martin, *Clean Architecture* (https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html)

Inner layers define policy (interfaces, domain types). Outer layers provide implementation. No inner layer may import from any outer layer.

## DevDigest Layer Diagram

```
┌────────────────────────────────────────────────────────────┐
│  DELIVERY                              (outermost)          │
│  modules/<name>/routes.ts · app.ts · server.ts             │
│  Tools: Fastify 5, fastify-type-provider-zod               │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  APPLICATION                                          │  │
│  │  modules/<name>/service.ts                           │  │
│  │  platform/run-executor.ts                            │  │
│  │  platform/grounding.ts · platform/prompts.ts         │  │
│  │  Tools: pure TypeScript — no Fastify, no Drizzle     │  │
│  │  ┌────────────────────────────────────────────────┐  │  │
│  │  │  DOMAIN                         (innermost)    │  │  │
│  │  │  vendor/shared/adapters.ts                     │  │  │
│  │  │  vendor/shared/contracts/                      │  │  │
│  │  │  Tools: Zod, TypeScript interfaces only        │  │  │
│  │  └────────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────┘  │
│  INFRASTRUCTURE           (parallel outer ring)             │
│  adapters/llm/ · adapters/github/ · adapters/git/          │
│  adapters/codeindex/ · adapters/embedder/                   │
│  modules/<name>/repository.ts · db/schema.ts               │
│  Tools: Drizzle ORM, Octokit, simple-git, ripgrep          │
└────────────────────────────────────────────────────────────┘
              platform/container.ts
              ← composition root — the ONLY file
                that constructs and imports across all layers
```

## Allowed Import Directions

| From | May import | Must NOT import |
|---|---|---|
| Domain | nothing at runtime beyond Zod | Application, Infrastructure, Delivery |
| Application | Domain interfaces and types | Infrastructure directly, Delivery, `drizzle-orm`, `fastify` |
| Infrastructure | Domain interfaces (to implement them) | Application services, Delivery |
| Delivery | Application services | Infrastructure directly, Drizzle, external SDKs |
| `container.ts` | Everything | — (it IS the composition root; this is by design) |

## Folder-to-Layer Map

| Path | Layer | Notes |
|---|---|---|
| `vendor/shared/adapters.ts` | Domain | All port interfaces live here |
| `vendor/shared/contracts/` | Domain | Zod domain schemas (PrMeta, PrDetail, …) |
| `modules/_shared/` | Domain / shared | Plain types used across modules |
| `platform/errors.ts` | Shared | Any layer may import; contains no framework deps |
| `modules/<name>/service.ts` | Application | Orchestrates use cases |
| `platform/run-executor.ts` | Application | Core review pipeline |
| `platform/grounding.ts` | Application | Domain logic: citation gate |
| `platform/prompts.ts` | Application | Prompt assembly logic |
| `adapters/<name>/` | Infrastructure | Implements domain port interfaces |
| `modules/<name>/repository.ts` | Infrastructure | Drizzle-backed data access |
| `db/schema.ts` | Infrastructure | Drizzle table definitions — never leak out |
| `db/rows.ts` | Infrastructure | Drizzle inferred types — never leak out |
| `db/client.ts` | Infrastructure | Drizzle connection — only repository + container use this |
| `modules/<name>/routes.ts` | Delivery | Fastify plugin — entry point for HTTP |
| `app.ts` | Delivery | Plugin registration, global hooks, error handler |
| `server.ts` | Delivery / bootstrap | Process entry point |
| `platform/container.ts` | Composition root | Constructs and wires all layers |
| `platform/config.ts` | Composition root support | `AppConfig` used by container and app |

## Why Infrastructure is a Parallel Ring

Infrastructure sits outside the domain (it implements domain interfaces) but it does NOT wrap the Application layer. Application code calls domain port interfaces; the container resolves those interfaces to Infrastructure at runtime. This means:

- Application → Domain (via interface call): ✅
- Infrastructure → Domain (to implement interface): ✅
- Application → Infrastructure (direct import): ❌
- Infrastructure → Application: ❌

The Dependency Inversion Principle is what makes this work: the domain defines the interface; infrastructure implements it; the container connects the two without either layer knowing about the other.
