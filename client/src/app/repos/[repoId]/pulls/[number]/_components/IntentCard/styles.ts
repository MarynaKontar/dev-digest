import type { CSSProperties } from "react";

/** Co-located styles for IntentCard. Follows the same satisfies-CSSProperties
    pattern used by FindingCard/styles.ts and ConventionCandidateCard/styles.ts. */
export const s = {
  card: {
    borderRadius: 8,
    // All-longhand border (never mix border shorthand with borderLeft — React
    // warns about updating shorthand + non-shorthand on the same rerender).
    borderStyle: "solid",
    borderWidth: 1,
    borderColor: "var(--border)",
    borderLeftWidth: 3,
    borderLeftColor: "var(--accent, #6366f1)",
    background: "var(--bg-elevated)",
    padding: 18,
  } satisfies CSSProperties,

  summaryQuote: {
    fontSize: 14,
    lineHeight: 1.6,
    color: "var(--text-primary)",
    fontStyle: "italic",
    margin: 0,
    marginTop: 4,
    marginBottom: 16,
  } satisfies CSSProperties,

  sectionTitle: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.07em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    marginBottom: 6,
    marginTop: 12,
  } satisfies CSSProperties,

  list: {
    margin: 0,
    padding: 0,
    listStyle: "none",
    display: "flex",
    flexDirection: "column",
    gap: 4,
  } satisfies CSSProperties,

  listItem: {
    display: "flex",
    alignItems: "flex-start",
    gap: 8,
    fontSize: 13,
    lineHeight: 1.5,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,

  /** Coloured prefix symbol (✓ / ✕ / ⚠) for each list item. */
  indicator: (color: string): CSSProperties => ({
    flexShrink: 0,
    fontSize: 12,
    fontWeight: 700,
    color,
    lineHeight: 1.5,
    minWidth: 14,
  }),

  emptyList: {
    fontSize: 12,
    color: "var(--text-muted)",
    fontStyle: "italic",
    margin: 0,
  } satisfies CSSProperties,

  emptySection: {
    padding: "12px 0",
    textAlign: "center",
  } satisfies CSSProperties,

  emptyTitle: {
    fontSize: 14,
    fontWeight: 600,
    color: "var(--text-secondary)",
    margin: 0,
  } satisfies CSSProperties,

  emptyBody: {
    fontSize: 13,
    color: "var(--text-muted)",
    margin: 0,
    marginTop: 6,
  } satisfies CSSProperties,
} as const;
