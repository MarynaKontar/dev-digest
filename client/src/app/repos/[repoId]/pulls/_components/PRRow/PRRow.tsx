/* PRRow — one clickable row in the PR list table. Ported from screen_dashboard.jsx. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Icon, Avatar, Badge, CircularScore, SeverityBadge } from "@devdigest/ui";
import type { PrMeta } from "@/types";
import { RunCostBadge } from "@/components/RunCostBadge";
import { SIZE_COLOR, STATUS_META } from "../../constants";
import { relativeTime, sizeOf } from "../../helpers";
import { s } from "../../styles";
import { PRSeverityFindings } from "../PRSeverityFindings/PRSeverityFindings";

const SEVERITIES = ["CRITICAL", "WARNING", "SUGGESTION"] as const;

export function PRRow({
  pr,
  repoId,
  isExpanded,
  onToggle,
}: {
  pr: PrMeta;
  repoId: string;
  isExpanded: boolean;
  onToggle: (prId: string) => void;
}) {
  const t = useTranslations("prReview");
  const router = useRouter();
  const [h, setH] = React.useState(false);
  const st = STATUS_META[pr.status] ?? STATUS_META.needs_review!;
  const { size, lines } = sizeOf(pr);
  const reviewed = pr.score != null;
  const fbs = pr.findings_by_severity;
  const prId = pr.id ?? "";

  return (
    <div
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      onClick={() => router.push(`/repos/${repoId}/pulls/${pr.number}`)}
      style={s.row(h)}
    >
      <div style={s.rowTitleCell}>
        <Icon.GitPullRequest size={15} style={s.rowIcon(st.c)} />
        <div style={s.rowTitleWrap}>
          <div style={s.rowTitle(h)}>{pr.title}</div>
          <span className="mono" style={s.rowNumber}>
            #{pr.number}
          </span>
        </div>
      </div>
      <div style={s.authorCell}>
        <Avatar name={pr.author} size={18} />
        {pr.author}
      </div>
      <div>
        <Badge
          color={SIZE_COLOR[size]}
          bg="transparent"
          style={s.sizeBadgeBorder(SIZE_COLOR[size]!)}
        >
          {size} · {lines}
        </Badge>
      </div>
      <div style={s.scoreCell}>
        {reviewed ? (
          <CircularScore score={pr.score!} size={34} stroke={3} />
        ) : (
          <span style={s.muted}>—</span>
        )}
      </div>
      {/* Findings column: severity badges + dropdown panel anchored to this cell */}
      <div style={{ ...s.findingsCell, position: "relative" }}>
        {fbs &&
          SEVERITIES.filter((sev) => (fbs[sev] ?? 0) > 0).map((sev) => (
            <button
              key={sev}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (prId) onToggle(prId);
              }}
              style={{
                background: "none",
                border: "none",
                padding: 0,
                cursor: "pointer",
                outline: isExpanded ? "2px solid var(--accent)" : "none",
                outlineOffset: 2,
                borderRadius: 5,
              }}
              aria-pressed={isExpanded}
              aria-label={`${sev} findings: ${fbs[sev]}`}
            >
              <SeverityBadge severity={sev} count={fbs[sev]} compact />
            </button>
          ))}
        {/* Dropdown panel — floats below the findings cell, overlays rows beneath */}
        {isExpanded && prId && (
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "absolute",
              top: "calc(100% + 6px)",
              left: 0,
              width: 400,
              zIndex: 50,
              background: "var(--bg-elevated)",
              border: "1px solid var(--border)",
              borderRadius: 10,
              boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
              overflow: "hidden",
            }}
          >
            <PRSeverityFindings prId={prId} />
          </div>
        )}
      </div>
      <div>
        <Badge dot color={st.c} bg="transparent">
          {t(`list.status.${st.labelKey}`)}
        </Badge>
      </div>
      <div style={s.costCell}>
        <RunCostBadge variant="compact" cost={pr.cost_usd} />
      </div>
      <div style={s.updatedCell}>{relativeTime(pr.updated_at)}</div>
    </div>
  );
}
