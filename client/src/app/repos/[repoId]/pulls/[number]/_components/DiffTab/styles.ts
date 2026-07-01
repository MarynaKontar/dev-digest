/* DiffTab/styles.ts — style objects for SmartDiffView group headings,
   file wrappers, the split banner, and the findings badge.
   Uses inline CSSProperties to stay consistent with the rest of the DiffViewer. */

import type { CSSProperties } from "react";

export const s = {
  // ── Split-suggestion banner ──────────────────────────────────────────────
  splitBanner: {
    border: "1px solid var(--warn, #f59e0b)",
    borderRadius: 7,
    padding: "12px 16px",
    marginBottom: 12,
    background: "var(--warn-bg, rgba(245,158,11,0.08))",
  } satisfies CSSProperties,

  splitTitle: {
    fontWeight: 600,
    fontSize: 14,
    margin: "0 0 4px 0",
    color: "var(--warn-text, #b45309)",
  } satisfies CSSProperties,

  splitBody: {
    fontSize: 13,
    margin: "0 0 8px 0",
    color: "var(--text-secondary, var(--text-muted))",
  } satisfies CSSProperties,

  splitList: {
    margin: 0,
    paddingLeft: 18,
    fontSize: 13,
    color: "var(--text-primary)",
  } satisfies CSSProperties,

  splitItem: {
    marginBottom: 2,
  } satisfies CSSProperties,

  // ── Role group ───────────────────────────────────────────────────────────
  group: {
    marginBottom: 16,
  } satisfies CSSProperties,

  /** Heading row; boilerplate gets `cursor: pointer` via groupHeadingClickable. */
  groupHeading: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 12px",
    borderRadius: 6,
    background: "var(--bg-elevated)",
    border: "1px solid var(--border)",
    marginBottom: 8,
    fontSize: 13,
    fontWeight: 600,
    color: "var(--text-primary)",
    cursor: "default",
    userSelect: "none" as const,
  } satisfies CSSProperties,

  groupHeadingClickable: {
    cursor: "pointer",
  } satisfies CSSProperties,

  groupChevron: {
    color: "var(--text-muted)",
    fontSize: 11,
    transition: "transform .12s",
    display: "inline-block",
  } satisfies CSSProperties,

  fileCount: {
    fontSize: 12,
    fontWeight: 400,
    color: "var(--text-muted)",
    marginLeft: "auto",
  } satisfies CSSProperties,

  groupFiles: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  } satisfies CSSProperties,

  // ── Per-file wrapper (carries anchor id) ─────────────────────────────────
  fileWrapper: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
  } satisfies CSSProperties,

  /** Right-aligned row holding the "N findings" badge above the file summary. */
  badgeRow: {
    display: "flex",
    justifyContent: "flex-end",
  } satisfies CSSProperties,

  // ── "What this does" per-file summary ────────────────────────────────────
  whatThisDoes: {
    fontSize: 12.5,
    lineHeight: "18px",
    color: "var(--text-secondary, var(--text-muted))",
    padding: "2px 4px",
  } satisfies CSSProperties,

  whatThisDoesLabel: {
    fontWeight: 600,
    color: "var(--text-primary)",
  } satisfies CSSProperties,

  // ── Toggle controls wrapper ────────────────────────────────────────────
  toggleGroup: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
  } satisfies CSSProperties,
} as const;
