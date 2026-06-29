# Onion Architecture Skill

**Version:** 1.0.0
**Scope:** Backend (`server/`)
**Stack:** Fastify 5 · Drizzle ORM · Zod · TypeScript · hand-rolled DI container
**Last updated:** 2026-06-27

---

## Focus

This skill enforces Onion Architecture (also called Clean Architecture or Hexagonal Architecture / Ports and Adapters) in the DevDigest backend. It answers **one question above all others**:

> "Does this dependency point inward — toward the domain — or does it point outward toward infrastructure or delivery?"

It operates at the **architectural level**: which layer does code belong to, what may it import, and what patterns must be followed to preserve layer isolation. It does NOT teach how to write Zod schemas, how to use Drizzle queries, or how Fastify plugins work — those are covered by the dedicated skills listed below.

---

## What This Skill Covers

| Topic | Reference file |
|---|---|
| Layer diagram, folder mapping, the dependency rule | `references/layers.md` |
| Domain interfaces (ports) and Zod contracts | `references/domain-layer.md` |
| Application services / use cases | `references/application-layer.md` |
| Drizzle repositories and adapter implementations | `references/infrastructure-layer.md` |
| Fastify routes as the HTTP delivery skin | `references/delivery-layer.md` |
| DI container as composition root | `references/di-container.md` |
| Cross-layer import violations and fixes | `references/anti-patterns.md` |
| Hermetic unit tests and integration tests | `references/testing-strategy.md` |

---

## What This Skill Does NOT Cover

| Topic | Use this skill instead |
|---|---|
| Drizzle query syntax, relations, transactions | `drizzle-orm-patterns` |
| Fastify routes, plugins, hooks, serialization | `fastify-best-practices` |
| Zod schema writing, parsing, error handling | `zod` |
| PostgreSQL schema design, indexes, constraints | `postgresql-table-design` |
| TypeScript type-level programming | `typescript-expert` |
| OWASP security, auth, injection | `security` |

---

## When to Use

Trigger this skill when:
- Adding a new module (`modules/<name>/`) — to verify all three files (routes, service, repository) sit in the right layer
- Writing a service method and unsure whether to add a Drizzle query directly or delegate to a repository
- Reviewing a PR for layer violations (Drizzle in a service, Fastify type in a repository, etc.)
- Wiring a new adapter into the DI container
- Asking "what layer does this code belong to?"
- Explaining the architecture to someone new to the codebase

---

## Related Skills and Boundaries

| Skill | Their focus | Boundary with this skill |
|---|---|---|
| `drizzle-orm-patterns` | HOW to write Drizzle queries, schemas, migrations | This skill = WHERE Drizzle belongs (Infrastructure only) and WHAT the repository boundary rule is. Drizzle mechanics → use `drizzle-orm-patterns`. |
| `fastify-best-practices` | HOW to write Fastify routes, plugins, hooks | This skill = WHERE Fastify belongs (Delivery only) and WHAT routes may not do (no direct DB calls). Fastify mechanics → use `fastify-best-practices`. |
| `zod` | HOW to write Zod schemas, parse, handle errors | This skill = WHERE Zod belongs (domain contracts in `vendor/shared/`, HTTP validation in routes). Zod mechanics → use `zod`. |
| `postgresql-table-design` | HOW to design Postgres schemas, indexes | This skill = WHERE the DB schema lives (Infrastructure). Design decisions → use `postgresql-table-design`. |
| `security` | OWASP Top 10, auth, input validation | This skill = WHERE auth middleware lives (Delivery hooks). Security rules → use `security`. |
| `frontend-architecture` | Frontend folder structure and feature modules | No overlap — that skill covers `client/`; this skill covers `server/`. Same architectural philosophy applied to different ends of the stack. |

---

## File Structure

```
onion-architecture/
  SKILL.md                         # Entry point — layer diagram + topic index
  README.md                        # This file — version, focus, sources
  references/
    layers.md                      # Full layer diagram + folder-to-layer mapping
    domain-layer.md                # Zod contracts, TS interfaces as ports
    application-layer.md           # Services, use cases, allowed/forbidden imports
    infrastructure-layer.md        # Drizzle repos, adapter implementations, boundary rule
    delivery-layer.md              # Fastify routes, HTTP concerns, route-as-skin pattern
    di-container.md                # Composition root, ContainerOverrides, lazy wiring
    anti-patterns.md               # 8 import violations with fixes
    testing-strategy.md            # Unit tests (ContainerOverrides) + integration (Testcontainers)
```

---

## Version History

| Version | Date | Notes |
|---|---|---|
| 1.0.0 | 2026-06-27 | Initial release — 8 reference files, covers Fastify 5 + Drizzle + Zod stack |

---

## Research Sources

All sources reviewed to build the rules in this skill.

### Foundational Architecture Concepts

| Source | URL | What it contributes |
|---|---|---|
| **Onion Architecture: Part 1** — Jeffrey Palermo | https://jeffreypalermo.com/2008/07/the-onion-architecture-part-1/ | Original article coining the term; establishes the core rule: "all code can depend on layers more central, but code cannot depend on layers further out" |
| **Onion Architecture: Part 2** — Jeffrey Palermo | https://jeffreypalermo.com/2008/07/the-onion-architecture-part-2/ | Continuation exploring layers and real implementation detail |
| **Onion Architecture: Part 3** — Jeffrey Palermo | https://jeffreypalermo.com/2008/08/the-onion-architecture-part-3/ | Completes the original series |
| **The Clean Architecture** — Robert C. Martin | https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html | Canonical concentric-circles diagram; the Dependency Rule; Entities → Use Cases → Interface Adapters → Frameworks & Drivers |
| **Hexagonal Architecture** — Alistair Cockburn | https://alistair.cockburn.us/hexagonal-architecture | Original Ports and Adapters pattern (2005); establishes the application/port/adapter vocabulary used in DevDigest's `vendor/shared/adapters.ts` |

### TypeScript + Node.js Implementation Guides

| Source | URL | What it contributes |
|---|---|---|
| **Clean Node.js Architecture** — Khalil Stemmler | https://khalilstemmler.com/articles/enterprise-typescript-nodejs/clean-nodejs-architecture/ | Practical mapping of Clean/Onion/Hexagonal to TypeScript; service layer boundaries, repository DTOs |
| **Implementing SOLID and Onion Architecture in Node.js** — Remo Jansen | https://dev.to/remojansen/implementing-the-onion-architecture-in-nodejs-with-typescript-and-inversifyjs-10ad | Four-layer walkthrough with TypeScript and DI; validates the layer structure used in this skill |
| **Onion Architecture in Node.js with TypeScript** — Sankhadip | https://sankhadip.medium.com/onion-architecture-in-node-js-with-typescript-5508612a4391 | Practical guide emphasising layer independence and decoupling from implementation details |
| **Clean Architecture in Node.js with DI** — Evan Gunawan | https://dev.to/evangunawan/clean-architecture-in-nodejs-an-approach-with-typescript-and-dependency-injection-16o | DI patterns with TypeScript; validates the Container / ContainerOverrides approach |
| **Definitive Guide: Node.js + Clean Architecture** — Vitalii Zdanovskyi | https://vitalii-zdanovskyi.medium.com/a-definitive-guide-to-building-a-nodejs-app-using-clean-architecture-and-typescript-41d01c6badfa | Comprehensive walkthrough on layer separation, DI, and project structure with TypeScript |
| **Leveraging TypeScript for DDD** — LogRocket | https://blog.logrocket.com/typescript-domain-driven-design/ | How TypeScript's type system enables fine-grained domain modelling |

### Fastify Architecture Integration

| Source | URL | What it contributes |
|---|---|---|
| **Fastify Plugins Guide** (official) | https://fastify.dev/docs/latest/Guides/Plugins-Guide/ | Plugin system encapsulation; how Fastify routes form the outermost delivery skin |
| **Fastify Validation & Serialization** (official) | https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/ | Schema-first validation; the basis for the "don't parse manually in handlers" rule |
| **The Complete Guide to the Fastify Plugin System** — nearForm | https://nearform.com/digital-community/the-complete-guide-to-fastify-plugin-system/ | Plugin context encapsulation; common patterns and pitfalls |
| **clean-architecture-fastify-mongodb** (GitHub) — borjatur | https://github.com/borjatur/clean-architecture-fastify-mongodb | Reference project: Clean Architecture in TypeScript with Fastify |
| **fastify-clean-architecture** (GitHub) — revell29 | https://github.com/revell29/fastify-clean-architecture | DDD + Clean Architecture with Fastify and TypeScript |

### Drizzle ORM and Repository Pattern

| Source | URL | What it contributes |
|---|---|---|
| **Drizzle ORM Official Docs** | https://orm.drizzle.team/ | Schema definition, relations, queries, migrations — mechanics delegated to `drizzle-orm-patterns` skill |
| **Repository Pattern with Drizzle ORM** — Vimulatus | https://medium.com/@vimulatus/repository-pattern-in-nest-js-with-drizzle-orm-e848aa75ecae | How to implement repositories with Drizzle to decouple the DB layer from business logic |
| **Atomic Repositories in Clean Architecture** — Sentry | https://blog.sentry.io/atomic-repositories-in-clean-architecture-and-typescript/ | Transaction atomicity across repositories in Clean Architecture using Drizzle ORM |
| **Implementing DTOs, Mappers & Repository Pattern** — Khalil Stemmler | https://khalilstemmler.com/articles/typescript-domain-driven-design/repository-dto-mapper/ | How to prevent DB type leakage via mappers; the basis for the repository boundary rule |
| **Data-Access-Pattern First with Drizzle** — Drizzle Stories | https://medium.com/drizzle-stories/the-data-access-pattern-first-approach-with-drizzle-bca035bbdc63 | Schema-first data modelling; rapid iteration without external tools |

### Zod as Domain Contracts

| Source | URL | What it contributes |
|---|---|---|
| **Zod Official Documentation** | https://zod.dev/ | Schema definition, type inference, ecosystem integrations; mechanics delegated to the `zod` skill |
| **Zod GitHub Repository** | https://github.com/colinhacks/zod | TypeScript-first schema validation with zero dependencies |
| **Schema Validation in TypeScript with Zod** — LogRocket | https://blog.logrocket.com/schema-validation-typescript-zod/ | Runtime type checking patterns; validates the "Zod schema as domain contract" approach |
