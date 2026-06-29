---
name: frontend-architecture
description: "React + Next.js frontend architecture and code organization. Use when deciding where to put files, how to split components, organize features, place constants/utilities/business logic, or structure a new project. Covers folder layout, feature-based architecture, naming conventions, and dependency direction rules."
version: 1.0.0
---

# Frontend Architecture

Code organization and architectural patterns for React + Next.js 15 (App Router).

Use this skill when deciding **where files go and why** — not for coding patterns within a component (see `react-best-practices`) or for Next.js framework APIs (see `next-best-practices`).

## Structure Evolution Rule

Choose structure by project size. Never over-engineer from the start:

| Stage | Component count | Recommended structure |
|---|---|---|
| Starter | < 15 | Flat `components/`, `hooks/` at `src/` root |
| Growing | 15–50 | Group by page/route; extract shared code upward |
| Large | 50+ / 3+ features | Feature-based with strict dependency boundaries |

**Core principle:** "Colocate first, extract later." Move something to a shared layer only when a second consumer appears.

---

## Topics

- [Folder Structure](./references/folder-structure.md) — Top-level layout for React + Next.js projects
- [Next.js App Router Organization](./references/nextjs-conventions.md) — Colocation, private folders, route groups, three strategies
- [Component Breakdown](./references/component-breakdown.md) — SRP, 3-layer pattern, 6 pillars, split heuristics
- [Feature Modules](./references/feature-modules.md) — Self-contained features, public API via index.ts, dependency direction
- [Constants](./references/constants.md) — Where to put constants, naming, promotion rules
- [Utilities & Helpers](./references/utilities-helpers.md) — `utils/` vs `lib/`, pure function rule, grouping
- [Business Logic](./references/business-logic.md) — Hooks, server actions, queries, dependency graph
- [Naming Conventions](./references/naming-conventions.md) — Files, folders, exports
