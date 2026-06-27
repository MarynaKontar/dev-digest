/* FindingMiniCard — compact inline finding card used in the PR list and
   Agent Runs panels. Always shows rationale (3-line clamp); no expand/collapse. */
"use client";

import React from "react";
import {
  SeverityBadge,
  CategoryTag,
  MonoLink,
  ConfidenceNum,
  type Severity,
  type Category,
} from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";

function lineLabel(f: Pick<FindingRecord, "start_line" | "end_line">): string {
  return f.start_line === f.end_line ? `${f.start_line}` : `${f.start_line}-${f.end_line}`;
}

const SEV_BORDER: Record<string, string> = {
  CRITICAL: "var(--crit)",
  WARNING: "var(--warn)",
  SUGGESTION: "var(--ok)",
};

export function FindingMiniCard({ f }: { f: FindingRecord }) {
  const borderColor = SEV_BORDER[f.severity] ?? "var(--border)";

  return (
    <div
      style={{
        borderLeft: `3px solid ${borderColor}`,
        paddingLeft: 10,
        paddingTop: 6,
        paddingBottom: 6,
      }}
    >
      {/* Title row: severity icon + title + category */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <SeverityBadge severity={f.severity as Severity} compact />
        <span
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: "var(--text-primary)",
            flex: 1,
            minWidth: 0,
          }}
        >
          {f.title}
        </span>
        <CategoryTag category={f.category as Category} />
      </div>

      {/* Meta row: file:line + confidence */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 3 }}>
        <MonoLink>
          {f.file}:{lineLabel(f)}
        </MonoLink>
        <ConfidenceNum value={f.confidence} />
      </div>

      {/* Rationale — always visible, clamped to 3 lines */}
      {f.rationale && (
        <div
          style={{
            fontSize: 12,
            color: "var(--text-secondary)",
            marginTop: 4,
            lineHeight: 1.55,
            display: "-webkit-box",
            WebkitLineClamp: 3,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {f.rationale}
        </div>
      )}
    </div>
  );
}
