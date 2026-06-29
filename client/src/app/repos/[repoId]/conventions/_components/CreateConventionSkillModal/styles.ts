import type { CSSProperties } from "react";

export const s = {
  body: {
    padding: 24,
    display: "flex",
    flexDirection: "column",
    gap: 4,
  } satisfies CSSProperties,

  enabledRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  } satisfies CSSProperties,
  enabledLabel: {
    fontSize: 13,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,

  charCount: {
    fontSize: 12,
    color: "var(--text-muted)",
    textAlign: "right",
    marginTop: 4,
  } satisfies CSSProperties,

  footer: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  } satisfies CSSProperties,
  footerNote: {
    flex: 1,
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  footerActions: {
    display: "flex",
    gap: 10,
  } satisfies CSSProperties,
} as const;
