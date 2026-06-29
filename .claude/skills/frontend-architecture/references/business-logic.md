# Business Logic

Where business logic lives and how it flows through a React + Next.js application.

## The Rule

Business logic does NOT live in:
- Component bodies (violates SRP, makes components untestable)
- `components/ui/` — these must be logic-free presentational primitives
- Page files (`app/**/page.tsx`) — pages orchestrate, they do not compute

## Placement by Type

| Logic type | Location |
|---|---|
| UI state + user interactions | Custom hook in `features/[name]/hooks/` |
| Client-side data fetching | Custom hook in `features/[name]/hooks/` |
| Server-side data reads | `features/[name]/queries/` (called from Server Components) |
| Mutations / form submissions | `features/[name]/actions/` (Next.js Server Actions, `'use server'`) |
| Auth / session | `lib/auth.ts` + `features/auth/hooks/` |
| Input validation schemas | Colocated with the form component, or `lib/validation/` if shared |
| Cross-cutting rules | `lib/` or promoted `utils/` |

## Custom Hooks as Business Logic Containers

The primary pattern — extract all non-rendering work into a hook:

```ts
// features/reviews/hooks/useReviews.ts
export function useReviews(repoId: string) {
  const [reviews, setReviews] = useState<Review[]>([])
  const [isLoading, setLoading] = useState(true)

  useEffect(() => {
    fetchReviews(repoId)
      .then(setReviews)
      .finally(() => setLoading(false))
  }, [repoId])

  return { reviews, isLoading }
}
```

The component becomes a thin orchestrator:

```tsx
// features/reviews/components/ReviewsContainer.tsx
export function ReviewsContainer({ repoId }: { repoId: string }) {
  const { reviews, isLoading } = useReviews(repoId)
  if (isLoading) return <ReviewsSkeleton />
  return <ReviewsList reviews={reviews} />
}
```

## Next.js Server Actions

Server Actions are the Next.js primitive for mutations. Place in `features/[name]/actions/`:

```
features/
  review/
    actions/
      create-review-action.ts     # 'use server' — creates a review
      delete-review-action.ts     # 'use server' — deletes a review
      update-findings-action.ts   # 'use server' — updates findings
```

Server Actions are for mutations (write operations). Do not use them for reads.

## Server Queries

Read-only data fetching for Server Components lives in `features/[name]/queries/`:

```
features/
  review/
    queries/
      get-reviews.ts          # Called from app/(dashboard)/reviews/page.tsx
      get-review-by-id.ts
```

```ts
// features/review/queries/get-reviews.ts
export async function getReviews(repoId: string): Promise<Review[]> {
  return db.select().from(reviews).where(eq(reviews.repoId, repoId))
}
```

## Dependency Graph Direction

```
app/ page.tsx           ← orchestrates: calls queries, renders feature components
  ↓
features/[name]/        ← owns: UI + hooks + actions + queries for one domain
  ↓
components/ui/          ← stateless presentational primitives
  ↓
hooks/ (shared)         ← shared React logic (used by 2+ features)
  ↓
lib/                    ← clients, config, auth — no React
  ↓
utils/                  ← pure functions — no dependencies
  ↓
types/                  ← TypeScript interfaces — no runtime code
```

No upward imports. No sideways imports between features at the same level.
