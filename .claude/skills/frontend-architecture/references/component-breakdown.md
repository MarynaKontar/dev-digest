# Component Breakdown

When and how to split a React component into smaller pieces.

## The Single Responsibility Test

A component should have exactly ONE reason to change. Apply the **"and" test**:

> "This component fetches user data **and** displays the profile **and** handles form submission."

If you use "and" to describe it, split it.

## The 3-Layer Pattern

For any non-trivial component, separate into three layers:

```
useReviews()                   ← 1. Hook: data fetching + state + business logic
  ↓ returns data
ReviewsList (props)            ← 2. Presentational: renders UI from props, no logic
  ↑ composed by
ReviewsContainer               ← 3. Container: wires hook to presentational
```

**Hook layer** — handles API calls, loading state, error state, business rules. Reusable across components. Independently testable with no DOM needed.

**Presentational layer** — receives typed props only, zero side effects. Easy to test, easy to Storybook, easy to reuse in different contexts.

**Container layer** — minimal orchestrator that connects data to UI. One per feature entry point. Should be almost entirely composition.

```tsx
// 1. Hook
function useReviews(repoId: string) {
  const [reviews, setReviews] = useState<Review[]>([])
  const [isLoading, setLoading] = useState(true)
  useEffect(() => {
    fetchReviews(repoId).then(setReviews).finally(() => setLoading(false))
  }, [repoId])
  return { reviews, isLoading }
}

// 2. Presentational
function ReviewsList({ reviews }: { reviews: Review[] }) {
  return <ul>{reviews.map(r => <ReviewCard key={r.id} review={r} />)}</ul>
}

// 3. Container
function ReviewsContainer({ repoId }: { repoId: string }) {
  const { reviews, isLoading } = useReviews(repoId)
  if (isLoading) return <Skeleton />
  return <ReviewsList reviews={reviews} />
}
```

## Six Pillars of Component Architecture

1. **Logical separation** — Group by purpose; don't mix unrelated functionality in one component
2. **Reusability** — Design for 2+ consumers before extracting to a shared location
3. **Single responsibility** — One primary purpose per component
4. **Maintainability** — Clear naming, consistent style, no magic values inline
5. **Testability** — Small, focused, injectable dependencies (no hard-coded API calls inside)
6. **Performance** — Memoize, lazy-load, and code-split where measured (not assumed)

## Breakdown Heuristics

| Signal | Action |
|---|---|
| Can't state purpose in one sentence | Split |
| Over 200 lines | Split |
| More than 5–7 props | Component does too much — split or compose |
| Fetching + error + form + rendering in one file | 4 concerns → 4 units |
| Filtering/sorting logic in JSX | Move to hook or util |
| The word "and" appears in the description | Split |

## What Stays Where

| Concern | Location |
|---|---|
| Data fetching | Custom hook |
| Loading / error / empty states | Container (via hook return values) |
| Form state + validation | Custom hook or isolated form component |
| Rendering | Presentational component |
| Reusable UI (button, modal, badge) | `components/ui/` |
| Business rules | Custom hook or `features/[name]/utils/` |

## Composition Over Monoliths

Prefer composing at the call site over packing all variants into one component.

```tsx
// Avoid — prop explosion
<Card variant="outlined" size="lg" hasImage hasBadge badgeText="New" />

// Prefer — composition
<Card>
  <CardImage src={imgSrc} />
  <CardBody>
    <Badge>New</Badge>
    <CardTitle>{title}</CardTitle>
  </CardBody>
</Card>
```
