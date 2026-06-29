import type { CSSProperties } from "react";

export const s = {
  page: { padding: "24px 32px 44px", maxWidth: 1100, margin: "0 auto" } satisfies CSSProperties,

  header: {
    display: "flex",
    alignItems: "flex-start",
    gap: 14,
    marginBottom: 20,
  } satisfies CSSProperties,
  headerText: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  h1: { fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em" } satisfies CSSProperties,
  subtitle: { fontSize: 14, color: "var(--text-secondary)", marginTop: 4 } satisfies CSSProperties,
  headerActions: { display: "flex", alignItems: "center", gap: 10, flexShrink: 0 } satisfies CSSProperties,

  selectionBar: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "10px 16px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    marginBottom: 16,
  } satisfies CSSProperties,
  selectionText: {
    flex: 1,
    fontSize: 13,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,

  list: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  } satisfies CSSProperties,
} as const;
