# Folder Structure

Standard top-level layout for React + Next.js projects.

## Canonical Structure

```
src/
  app/               # Next.js App Router — routing only (page.tsx, layout.tsx, etc.)
  components/
    ui/              # Reusable primitives: Button, Modal, Input — zero business logic
    layout/          # Structural: Header, Footer, Sidebar, PageShell
  features/          # Self-contained feature modules (see feature-modules.md)
  hooks/             # Custom hooks shared by 2+ features
  lib/               # API clients, 3rd-party wrappers, config — no React components here
  types/             # Global TypeScript interfaces and type aliases
  data/              # Static JSON, seed content, lookup tables
  assets/            # Images, SVGs, fonts (if not in public/)
  constants/         # App-wide constants (if not colocated with features)
```

## What Lives Where

| Folder | Contains | Does NOT contain |
|---|---|---|
| `app/` | Routing files only (page, layout, loading, error, route) | Business logic, shared components |
| `components/ui/` | Stateless, reusable primitives | Business logic, API calls, domain terms |
| `components/layout/` | Page structure components | Per-feature UI |
| `features/` | All feature-specific code (UI, hooks, types, utils) | Code shared across 2+ features |
| `hooks/` | Custom hooks shared across features | Feature-specific hooks (stay inside feature) |
| `lib/` | Third-party wrappers, clients, config | React components, JSX |
| `types/` | Global interfaces and type utilities | Feature-local types (stay inside feature) |

## Size-Based Guidelines

**Small project (< 15 components):**
```
src/
  components/
  hooks/
  utils/
  assets/
```

**Medium project (15–50 components):**
```
src/
  app/
  components/
    ui/
    layout/
  hooks/
  utils/
  types/
```

**Large project (50+ components, 3+ features) → feature-based** (see feature-modules.md):
```
src/
  app/
  components/
    ui/
    layout/
  features/
    auth/
    review/
    repository/
  hooks/
  lib/
  types/
  utils/
```

## Nesting Rule

Never more than 2 levels of nesting inside any folder. If you need a 3rd level, it signals a feature boundary should be introduced instead.
