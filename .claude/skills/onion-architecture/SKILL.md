---
name: onion-architecture
version: 1.0.0
description: "Enforces Onion Architecture (layered dependency inversion) in the DevDigest backend. Use when adding a module, writing a service, implementing a repository, or wiring a new adapter — to verify that imports flow inward only (Delivery → Application → Domain, never the reverse). Covers layer placement for Fastify routes, Drizzle repositories, Zod contracts, and the DI container. Trigger terms: onion architecture, hexagonal, clean architecture, layer violation, dependency direction, ports and adapters, composition root, DI container, adapter interface."
metadata:
  tags: architecture, backend, nodejs, fastify, drizzle, zod, di-container, clean-architecture
---

# Onion Architecture — DevDigest Backend

Enforces the one rule that governs all others: **dependencies point inward only**.

Use this skill when:
- Adding a new module (`modules/<name>/`)
- Writing or reviewing a service, repository, or adapter
- Deciding where a new file belongs in the layer stack
- Catching or explaining a cross-layer import violation
- Wiring a new adapter into the DI container

## Layer Quick Reference

```
┌─────────────────────────────────────────────────────┐
│  DELIVERY            (outermost)                     │
│  modules/<name>/routes.ts · app.ts                  │
│  ┌───────────────────────────────────────────────┐  │
│  │  APPLICATION                                  │  │
│  │  modules/<name>/service.ts                   │  │
│  │  platform/run-executor.ts                    │  │
│  │  ┌─────────────────────────────────────────┐ │  │
│  │  │  DOMAIN               (innermost)        │ │  │
│  │  │  vendor/shared/adapters.ts               │ │  │
│  │  │  Zod schemas · TS port interfaces        │ │  │
│  │  └─────────────────────────────────────────┘ │  │
│  └───────────────────────────────────────────────┘  │
│  INFRASTRUCTURE (implements Domain, parallel ring)   │
│  adapters/ · modules/<name>/repository.ts           │
└─────────────────────────────────────────────────────┘
          platform/container.ts  ← composition root
          (the ONLY file that imports across all layers)
```

**The one rule:** inner layers never import from outer layers. Infrastructure implements domain interfaces but never imports Application or Delivery.

## Topics

- [Layer Map](references/layers.md) — full diagram, folder mapping, the dependency rule
- [Domain Layer](references/domain-layer.md) — Zod contracts, TypeScript port interfaces
- [Application Layer](references/application-layer.md) — services, use cases, orchestration
- [Infrastructure Layer](references/infrastructure-layer.md) — Drizzle repositories, adapter implementations
- [Delivery Layer](references/delivery-layer.md) — Fastify routes, HTTP concerns
- [DI Container](references/di-container.md) — composition root, `ContainerOverrides`, lazy wiring
- [Anti-patterns](references/anti-patterns.md) — import violations and how to fix them
- [Testing Strategy](references/testing-strategy.md) — hermetic unit tests and integration tests
