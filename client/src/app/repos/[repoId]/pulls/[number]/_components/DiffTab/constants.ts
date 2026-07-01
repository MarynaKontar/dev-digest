/* DiffTab/constants.ts — role ordering and anchor-id helper for Smart Diff. */

import type { SmartDiffRole } from "@devdigest/shared";

/**
 * Fixed display order for smart-diff role groups (core → wiring → boilerplate).
 * Used by SmartDiffView to sort incoming groups into a stable, canonical order
 * independent of what the server returns.
 */
export const ROLE_ORDER: SmartDiffRole[] = ["core", "wiring", "boilerplate"];

/**
 * Deterministic DOM id for a file's wrapper anchor in SmartDiffView.
 * FindingsBadge uses this to scroll-to the file when clicked.
 *
 * Security note: the path is sanitised — only word chars, hyphens, and dots are
 * kept; we NEVER evaluate or execute path strings (they're just label text).
 */
export function fileAnchorId(path: string): string {
  return `smart-diff-file-${path.replace(/[^a-zA-Z0-9_.-]/g, "-")}`;
}

/**
 * Deterministic DOM id for a single flagged diff LINE, so the "N findings" badge
 * can scroll straight to the offending line. Same sanitisation as fileAnchorId.
 */
export function lineAnchorId(path: string, line: number): string {
  return `smart-diff-line-${path.replace(/[^a-zA-Z0-9_.-]/g, "-")}-${line}`;
}
