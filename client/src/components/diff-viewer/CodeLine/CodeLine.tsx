/* CodeLine — one rendered diff line: gutter number, +/- sign, text, plus the
   hover "+" affordance, any anchored comment threads, and an inline composer. */
"use client";

import React from "react";
import type { Severity } from "@devdigest/shared";
import { commentTargetFor, type CommentThread, type DiffCommentApi, cs } from "../comments";
import { type Line } from "../helpers";
import { s, lineRowFor, lineSignFor } from "../styles";
import { CommentThreadView } from "../CommentThreadView";
import { InlineComposer } from "../InlineComposer";

/** Review severity → in-diff label + color (design: suggestion/warning/blocker). */
const SEV_STYLE: Record<Severity, { label: string; color: string }> = {
  CRITICAL: { label: "blocker", color: "#f87171" },
  WARNING: { label: "warning", color: "#fbbf24" },
  SUGGESTION: { label: "suggestion", color: "#60a5fa" },
};

export function CodeLine({
  ln,
  path,
  threads,
  commenting,
  severity,
  badge,
  badgeFindingId,
  onBadgeClick,
  anchorId,
}: {
  ln: Line;
  path: string;
  threads: CommentThread[];
  commenting?: DiffCommentApi;
  /** When set, the row gets a severity-colored left highlight bar. */
  severity?: Severity | null;
  /** When set, an inline severity badge is rendered at the end of the row. */
  badge?: Severity | null;
  /** Finding id behind the badge — passed to onBadgeClick when the badge is clicked. */
  badgeFindingId?: string | null;
  /** When set (with badgeFindingId), the badge becomes a button that opens the finding. */
  onBadgeClick?: (findingId: string) => void;
  /** When set, becomes the row's DOM id so a findings badge can scroll to it. */
  anchorId?: string;
}) {
  const [hover, setHover] = React.useState(false);
  const [composing, setComposing] = React.useState(false);

  if (ln.kind === "hunk") {
    return (
      <div className="mono" style={s.hunk}>
        {ln.text}
      </div>
    );
  }

  const sign = ln.kind === "add" ? "+" : ln.kind === "del" ? "−" : "";
  const target = commenting?.canComment ? commentTargetFor(ln) : null;
  const showAdd = hover && !!target && !composing;

  // Severity-colored left bar (inset box-shadow avoids shifting the gutter).
  const rowStyle = severity
    ? { ...lineRowFor(ln.kind), boxShadow: `inset 3px 0 0 ${SEV_STYLE[severity].color}` }
    : lineRowFor(ln.kind);

  return (
    <div
      id={anchorId}
      style={cs.rowWrap}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div style={rowStyle}>
        <span className="mono tnum" style={{ ...s.lineNo, position: "relative" }}>
          {showAdd && target && (
            <button
              type="button"
              title="Add a comment on this line"
              aria-label="Add a comment on this line"
              onClick={() => setComposing(true)}
              style={cs.addBtn}
            >
              +
            </button>
          )}
          {ln.newNo ?? ln.oldNo ?? ""}
        </span>
        <span className="mono" style={lineSignFor(ln.kind)}>
          {sign}
        </span>
        <span className="mono" style={s.lineText}>
          {ln.text || " "}
        </span>
        {badge &&
          (() => {
            const clickable = !!onBadgeClick && !!badgeFindingId;
            const pillStyle: React.CSSProperties = {
              marginLeft: "auto",
              alignSelf: "center",
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              marginRight: 10,
              padding: "1px 8px",
              borderRadius: 999,
              border: `1px solid ${SEV_STYLE[badge].color}`,
              background: "transparent",
              color: SEV_STYLE[badge].color,
              fontSize: 11,
              lineHeight: "16px",
              fontWeight: 500,
              whiteSpace: "nowrap",
              flexShrink: 0,
              cursor: clickable ? "pointer" : "default",
            };
            const dot = (
              <span
                aria-hidden
                style={{ width: 6, height: 6, borderRadius: "50%", background: SEV_STYLE[badge].color }}
              />
            );
            return clickable ? (
              <button
                type="button"
                aria-label={`Open ${SEV_STYLE[badge].label} finding`}
                onClick={() => onBadgeClick!(badgeFindingId!)}
                style={pillStyle}
              >
                {dot}
                {SEV_STYLE[badge].label}
              </button>
            ) : (
              <span style={pillStyle}>
                {dot}
                {SEV_STYLE[badge].label}
              </span>
            );
          })()}
      </div>

      {commenting &&
        commenting.showComments &&
        threads.map((th) => (
          <CommentThreadView key={th.rootId} thread={th} commenting={commenting} path={path} />
        ))}

      {commenting && composing && target && (
        <InlineComposer
          commenting={commenting}
          path={path}
          line={target.line}
          side={target.side}
          onClose={() => setComposing(false)}
        />
      )}
    </div>
  );
}
