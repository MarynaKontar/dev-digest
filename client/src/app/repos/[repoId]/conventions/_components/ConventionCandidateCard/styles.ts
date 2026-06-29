import type { CSSProperties } from "react";

/** Threshold for "green" confidence bar — matches server MIN_CONFIDENCE. */
export const MIN_CONFIDENCE = 0.6;

export function confidenceColor(value: number): string {
  return value >= MIN_CONFIDENCE ? "var(--success, #22c55e)" : "var(--warn, #f59e0b)";
}

export const s = {
  card: {
    padding: 16,
    borderRadius: 10,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,

  headerRow: {
    display: "flex",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 10,
  } satisfies CSSProperties,
  checkboxWrap: { flexShrink: 0, marginTop: 2 } satisfies CSSProperties,
  ruleTitle: {
    flex: 1,
    fontSize: 14,
    fontStyle: "italic",
    fontWeight: 600,
    lineHeight: 1.4,
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  inSkillBadge: {
    fontSize: 12,
    color: "var(--text-muted)",
    fontWeight: 500,
    whiteSpace: "nowrap",
  } satisfies CSSProperties,

  pathRow: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    marginBottom: 10,
  } satisfies CSSProperties,
  pathLink: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "3px 8px",
    borderRadius: 5,
    fontSize: 12,
    fontFamily: "var(--font-mono, monospace)",
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
    color: "var(--text-secondary)",
    cursor: "pointer",
    textDecoration: "none",
  } satisfies CSSProperties,
  copyBtn: {
    background: "none",
    border: "none",
    cursor: "pointer",
    padding: "2px 4px",
    borderRadius: 4,
    fontSize: 12,
    lineHeight: 1,
  } satisfies CSSProperties,

  snippet: {
    margin: 0,
    padding: "10px 12px",
    borderRadius: 7,
    background: "var(--bg-surface)",
    border: "1px solid var(--border)",
    fontSize: 12,
    fontFamily: "var(--font-mono, monospace)",
    lineHeight: 1.6,
    overflowX: "auto",
    whiteSpace: "pre",
    marginBottom: 10,
  } satisfies CSSProperties,

  footer: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  } satisfies CSSProperties,
  confidenceLabel: {
    fontSize: 12,
    color: "var(--text-muted)",
    flexShrink: 0,
  } satisfies CSSProperties,
  confidenceWrap: { flex: 1, display: "flex", alignItems: "center", gap: 6 } satisfies CSSProperties,
  confidencePct: { fontSize: 12, color: "var(--text-muted)", flexShrink: 0 } satisfies CSSProperties,
  judgeRow: { display: "flex", gap: 6, flexShrink: 0 } satisfies CSSProperties,
} as const;
