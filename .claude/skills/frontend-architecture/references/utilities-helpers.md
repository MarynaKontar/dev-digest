# Utilities & Helpers

How to organize utility and helper functions across a React + Next.js project.

## `utils/` vs `lib/`

| Folder | Purpose | Key constraint |
|---|---|---|
| `utils/` | Pure, generic helper functions | No side effects, no external dependencies, no React imports |
| `lib/` | Third-party clients, wrappers, config | Axios instance, Stripe client, Prisma, auth config, feature flags |

**The pure function rule for `utils/`:** If a function has side effects or depends on external state, it is NOT a utility. Classify it as a service, hook, query, or action instead.

## What Belongs in `utils/`

```ts
// Good — pure, stateless, no external dependencies
export function formatCurrency(amount: number, currency = 'USD'): string { ... }
export function truncate(str: string, maxLength: number): string { ... }
export function groupBy<T>(arr: T[], key: keyof T): Record<string, T[]> { ... }
export function parseISODate(iso: string): Date { ... }
export function slugify(text: string): string { ... }
```

```ts
// Wrong folder — belongs elsewhere
export function fetchUser(id: string) { return api.get(`/users/${id}`) }
// → lib/api.ts or features/user/queries/

export function useUserData() { ... }
// → hooks/useUserData.ts or features/user/hooks/

export function showToast(msg: string) { toast(msg) }
// → lib/toast.ts (wrapper with side effects)
```

## Avoid the God File

Never let a single `utils.ts` grow past ~150 lines. Break by concern:

```
utils/
  format/
    date.ts          # Date formatting (formatDate, formatRelative, formatDuration)
    currency.ts      # Currency and number formatting
    string.ts        # Truncate, slugify, capitalize, camelToKebab
  validation/
    email.ts         # isValidEmail, normalizeEmail
    url.ts           # isValidUrl, extractDomain
  array/
    groupBy.ts
    sortBy.ts
    chunk.ts
  dom/
    scroll.ts        # scrollToTop, scrollIntoView wrappers
    clipboard.ts     # copyToClipboard
```

## `lib/` Contents

```
lib/
  api.ts            # Configured HTTP client (fetch wrapper or axios instance)
  auth.ts           # Auth configuration (next-auth, clerk, etc.)
  db.ts             # Database client instance (Prisma, Drizzle)
  stripe.ts         # Stripe client
  redis.ts          # Cache client
  config.ts         # Typed environment variable access
  analytics.ts      # Analytics wrapper (no raw SDK calls outside this file)
  toast.ts          # Toast notification wrapper
```

**Rule:** Nothing in `lib/` imports from `components/`, `features/`, or `app/`. Dependency graph flows downward, never upward.

## Promotion Rules

1. Start inside the feature: `features/review/utils/scoreToLabel.ts`
2. A second feature (`features/dashboard/`) needs the same function
3. Move to `utils/format/score.ts`
4. Both features import from the shared `utils/`

Never duplicate — extract and promote instead.

## Naming Utils

- Files: `camelCase.ts` (`formatDate.ts`, `parseUrl.ts`)
- Functions: `camelCase`, verb-noun style (`formatDate`, `parseQueryString`, `groupByKey`)
- Avoid: `helpers.ts`, `misc.ts`, `common.ts` — name by what the functions do, not where they landed
