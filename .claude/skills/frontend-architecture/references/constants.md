# Constants

Where to place and how to manage constants in a React + Next.js project.

## Placement Rules

| Scope | Location |
|---|---|
| Used by one component only | Module-level in the same file, or a colocated `constants.ts` next to the component |
| Used by one feature | `features/[name]/constants.ts` |
| Used across 2+ features | `src/constants/` or `src/constants/[domain].ts` |
| Next.js config / environment | Root `.env*` files; access via a typed config object in `lib/config.ts` |

**Promotion rule:** Start colocated. Move to a wider scope only when a second consumer appears.

## Naming

All constants: `SCREAMING_SNAKE_CASE`

```ts
// Good
export const MAX_RETRY_ATTEMPTS = 3
export const SUPPORTED_LOCALES = ['en', 'uk', 'de'] as const
export const API_TIMEOUT_MS = 5_000
export const DEFAULT_PAGE_SIZE = 20

// Bad
export const maxRetry = 3
export const supportedLocales = ['en', 'uk', 'de']
```

## Never Hard-code Strings in Component Bodies

Isolating strings from UI enables content changes, i18n, and auditing without touching component logic.

```tsx
// Bad
<Button>Submit Review</Button>
<p>No reviews found</p>

// Good
import { LABELS } from './constants'
<Button>{LABELS.SUBMIT_REVIEW}</Button>
<p>{LABELS.EMPTY_STATE}</p>
```

## Enum-Style Constants

Prefer `as const` objects over TypeScript `enum` for better tree-shaking and JS interop:

```ts
// Preferred
export const ReviewStatus = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
} as const

export type ReviewStatus = typeof ReviewStatus[keyof typeof ReviewStatus]

// Avoid
enum ReviewStatus { PENDING, APPROVED, REJECTED }
```

## Environment Variables

- Store in `.env`, `.env.local`, `.env.production`, `.env.development`
- Never commit `.env.local`
- In Next.js: prefix client-accessible vars with `NEXT_PUBLIC_`
- Never scatter raw `process.env` calls across components — wrap in a typed config object:

```ts
// src/lib/config.ts
export const config = {
  apiUrl: process.env.NEXT_PUBLIC_API_URL!,
  revalidateSeconds: Number(process.env.REVALIDATE_SECONDS ?? 60),
  isDev: process.env.NODE_ENV === 'development',
} as const
```

## i18n Constants

For multi-language apps, create per-locale files:

```
src/
  constants/
    i18n/
      en.ts
      uk.ts
      de.ts
```

Never mix locale strings into shared constants — they belong in their own locale files.
