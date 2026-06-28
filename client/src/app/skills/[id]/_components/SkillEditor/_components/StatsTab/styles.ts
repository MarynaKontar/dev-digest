import type { CSSProperties } from "react";

export const s = {
  h2: { fontSize: 18, fontWeight: 700, marginBottom: 20 } satisfies CSSProperties,
  kpiRow: { display: "flex", gap: 14, marginBottom: 8, flexWrap: "wrap" } satisfies CSSProperties,
  kpiCard: {
    flex: "1 1 140px",
    padding: "16px 20px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  kpiValue: { fontSize: 28, fontWeight: 700, letterSpacing: "-0.02em" } satisfies CSSProperties,
  kpiLabel: { fontSize: 12, color: "var(--text-muted)", marginTop: 4 } satisfies CSSProperties,
  kpiUnit: { color: "var(--text-muted)" } satisfies CSSProperties,
  demoNote: { fontSize: 12, color: "var(--text-muted)", marginBottom: 20, fontStyle: "italic" } satisfies CSSProperties,
  section: { marginTop: 28 } satisfies CSSProperties,
  sectionTitle: { fontSize: 14, fontWeight: 600, marginBottom: 12, color: "var(--text-secondary)" } satisfies CSSProperties,
  empty: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  agentList: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 } satisfies CSSProperties,
  agentItem: {
    display: "flex",
    alignItems: "center",
    padding: "10px 14px",
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    cursor: "pointer",
    fontSize: 14,
  } satisfies CSSProperties,
  agentName: { flex: 1 } satisfies CSSProperties,
  agentArrow: { color: "var(--text-muted)", fontSize: 13 } satisfies CSSProperties,
} as const;
