# Feature Modules

Architecture pattern for medium-to-large React + Next.js applications.

## What Is a Feature?

A feature is a self-contained module that encapsulates one business domain or user capability. It owns its UI, logic, data access, and types.

**Litmus test:** A feature should be deletable as a folder without breaking unrelated code.

## Feature Folder Structure

```
features/
  auth/
    components/       # Auth-specific UI only (LoginForm, SessionBanner)
    hooks/            # Auth-specific hooks (useAuth, useSession)
    utils/            # Auth-specific helpers (parseToken, checkRole)
    types/            # Auth-specific TypeScript types
    actions/          # Next.js Server Actions ('use server')
    queries/          # Server-side data fetching functions
    constants.ts      # Feature-local constants
    index.ts          # Public API — the only export surface
```

## The Public API Rule

Each feature exposes ONLY what outside code needs via `index.ts`. Internal files are implementation details.

```ts
// features/auth/index.ts
export { LoginForm } from './components/LoginForm'
export { useAuth } from './hooks/useAuth'
export type { AuthUser } from './types'
// NOT exported: parseToken, SESSION_COOKIE_KEY, useInternalSession
```

Enforce with ESLint so imports can only go through `index.ts`:
```json
"no-restricted-imports": ["error", { "patterns": ["@/features/*/*"] }]
```

## Dependency Direction

Dependencies flow downward only. Never import upward or sideways between features.

```
app/ (routes)
  ↓
features/ (domain logic + UI)
  ↓
components/ui/ (stateless primitives)
  ↓
hooks/ (shared React logic)
  ↓
lib/ (clients, config, wrappers)
  ↓
utils/ (pure functions)
  ↓
types/ (TypeScript interfaces — no runtime dependencies)
```

**Rules:**
- Features import from `components/ui/`, `hooks/`, `lib/`, `types/`, `utils/`
- Features MUST NOT import from other features directly
- When two features need the same code, promote it to the appropriate shared layer
- `lib/` and `utils/` MUST NOT import from `components/` or `app/`
- `app/` imports from features and shared layers — never the reverse

## Promoting Shared Code

1. Code starts in `features/auth/utils/formatRole.ts`
2. `features/review/` now needs the same helper
3. Move to `utils/format/role.ts`
4. Both features import from `utils/`

"Promote, don't duplicate."

## When to Create `index.ts`

Create a barrel only when the feature has:
- More than 2 components, OR
- More than 1 hook

Below that threshold, direct imports within the feature are fine.

## Domain Grouping (Very Large Apps)

When features cluster into business domains, add a domain layer:

```
src/
  domains/
    workspace/
      features/         # project, customer, contact
    core/
      features/         # user, tenant, role
    cms/
      features/         # comment, space
  components/
  lib/
```

Domains do not import from each other. Cross-domain shared code moves to `lib/` or a `packages/shared/` workspace package.
