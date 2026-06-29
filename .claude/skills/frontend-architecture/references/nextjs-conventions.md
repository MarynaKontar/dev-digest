# Next.js App Router Organization

How to organize code within the `app/` directory and around it.

For the full reference on special file names and routing mechanics, see `next-best-practices/file-conventions.md`. This file covers the **organizational** decisions.

## Colocation in `app/`

A route is NOT publicly accessible until a `page.tsx` or `route.ts` file exists. All other files colocated inside a route folder are safe — they will not be exposed as routes.

```
app/
  dashboard/
    _components/        # Private folder — not routable, scoped to this route
      StatsCard.tsx
    _lib/               # Private folder — data utilities for this route
      fetch-stats.ts
    page.tsx            # The actual route (/dashboard)
    loading.tsx         # Loading UI
```

## Private Folders (`_folder`)

Prefix with `_` to exclude from the routing system entirely. Use for:
- UI components scoped to a single route segment
- Data fetching helpers for a specific route
- Internal utilities not meant to be shared globally

```
app/
  blog/
    _components/        # Only used by blog routes
    _lib/               # Only used by blog routes
    page.tsx
    [slug]/
      page.tsx
```

## Route Groups (`(folder)`)

Wrap in parentheses to organize routes without affecting the URL path.

```
app/
  (marketing)/          # Grouping — URL is NOT /marketing/...
    page.tsx            # → /
    about/
      page.tsx          # → /about
  (dashboard)/          # Grouping — URL is NOT /dashboard/...
    dashboard/
      page.tsx          # → /dashboard
    settings/
      page.tsx          # → /settings
```

Use route groups for:
- Sharing a layout across a subset of routes (e.g. shell layout for authenticated pages)
- Organizing routes by team ownership or product area without changing URLs
- Applying a loading skeleton to one specific route without affecting siblings

## Three Valid Location Strategies

Pick ONE and be consistent across the project.

**Strategy A — App = routing only (recommended for feature-based projects):**
```
src/
  app/              # Routing files only: page.tsx, layout.tsx, etc.
  components/
  features/
  lib/
```

**Strategy B — Everything inside app/:**
```
src/
  app/
    _components/
    _features/
    _lib/
    (routes)/
```

**Strategy C — Feature-split (advanced, large apps):**
```
src/
  app/              # Shared/global routes
  features/
    auth/
      _app/         # Auth-specific routes colocated with the feature
```

## Special Files Quick Reference

| File | Purpose |
|---|---|
| `layout.tsx` | Persistent UI wrapper (does NOT remount on navigation) |
| `page.tsx` | Route UI — the only file that makes a route publicly accessible |
| `loading.tsx` | Suspense boundary skeleton |
| `error.tsx` | Error boundary |
| `not-found.tsx` | 404 UI |
| `route.ts` | API endpoint (Route Handler) |
| `template.tsx` | Like layout but re-renders on every navigation |
| `default.tsx` | Fallback for parallel route slots |

Component hierarchy within a route segment (render order):
`layout → template → error → loading → not-found → page`
