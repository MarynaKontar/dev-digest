# Naming Conventions

Consistent naming across files, folders, and exports in a React + Next.js project.

## Files

| Item | Convention | Examples |
|---|---|---|
| React component files | `PascalCase.tsx` | `ReviewCard.tsx`, `UserAvatar.tsx` |
| Custom hook files | `camelCase.ts` (prefix `use`) | `useReviews.ts`, `useAuth.ts` |
| Utility files | `camelCase.ts` | `formatDate.ts`, `parseUrl.ts` |
| Type files | `camelCase.ts` or `types.ts` | `review.types.ts`, `types.ts` |
| Constant files | `camelCase.ts` or `constants.ts` | `constants.ts`, `endpoints.ts` |
| Server Action files | suffix `-action.ts` | `create-review-action.ts` |
| Query files | prefix `get-` | `get-reviews.ts`, `get-user-by-id.ts` |
| Test files | suffix `.test.ts(x)` | `ReviewCard.test.tsx`, `useReviews.test.ts` |

## Folders

| Item | Convention | Examples |
|---|---|---|
| General folders | `kebab-case` | `user-profile/`, `review-list/` |
| Feature folders | **singular** `kebab-case` | `auth/`, `review/`, `repository/` |
| Collection folders | **plural** | `components/`, `hooks/`, `features/`, `types/` |
| Route groups | `(kebab-case)` | `(marketing)/`, `(dashboard)/` |
| Private folders | `_camelCase` or `_kebab-case` | `_components/`, `_lib/` |

Feature folders are singular (`review/`, not `reviews/`). Collection folders are plural (`features/`, not `feature/`).

## Exports

| Item | Convention | Examples |
|---|---|---|
| React components | `PascalCase` | `export function ReviewCard()` |
| Custom hooks | `camelCase` + `use` prefix | `export function useReviews()` |
| Constants | `SCREAMING_SNAKE_CASE` | `export const MAX_RETRIES = 3` |
| Types and interfaces | `PascalCase` | `export interface Review {}`, `export type ReviewStatus = ...` |
| Utility functions | `camelCase`, verb-noun | `export function formatDate()` |
| Zod schemas | `camelCase` + `Schema` suffix | `export const reviewSchema = z.object(...)` |
| Server Actions | `camelCase` | `export async function createReview()` |

## File Organization Within a Module

Standard order inside any `.ts` / `.tsx` file:

1. Imports — external libraries first, then internal shared, then local
2. Types and interfaces (local to this file)
3. Constants (module-level)
4. Helper functions (pure, private to this file)
5. Main export (component, hook, or function)
6. Additional named exports if needed

## Barrel Files (`index.ts`)

Use **only** at feature boundaries to define the public API. Avoid barrel files inside `components/ui/` — they can break tree-shaking and slow down build tooling.

```ts
// Good — feature public API
// features/auth/index.ts
export { LoginForm } from './components/LoginForm'
export { useAuth } from './hooks/useAuth'
export type { AuthUser } from './types'

// Avoid — UI primitives barrel
// components/ui/index.ts  ← skip; import directly instead
```
