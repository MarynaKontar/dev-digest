"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon, CircularScore, SeverityBadge, type IconName, type Severity } from "@devdigest/ui";
import type { RunSummary, PrCommit, ReviewRecord } from "@devdigest/shared";
import { RunCostBadge } from "@/components/RunCostBadge";
import { FindingMiniCard } from "../../../_components/FindingMiniCard/FindingMiniCard";

/**
 * PR timeline — every agent run interleaved with the PR's commits, newest-first
 * and DB-backed so it survives reload. Showing commits between runs makes it
 * clear which commit each review ran against. Failed runs show their error
 * inline; clicking a run row opens its trace.
 *
 * The badge reflects the review OUTCOME, not just the run lifecycle: a finished
 * run that found blockers reads "rejected" (red), never a green "done". Outcome
 * is derived from the denormalized blocker/finding counts on the run row, so it
 * matches the CI gate (deterministic) rather than the model's verdict.
 */

const SEVERITIES: Severity[] = ["CRITICAL", "WARNING", "SUGGESTION"];
const SEV_ORDER: Record<string, number> = { CRITICAL: 0, WARNING: 1, SUGGESTION: 2 };

type Outcome = { key: string; color: string; bg: string; icon: IconName };

function outcomeOf(run: RunSummary): Outcome {
  const status = run.status ?? "";
  if (status === "running")
    return { key: "running", color: "var(--accent)", bg: "var(--accent-bg)", icon: "RefreshCw" };
  if (status === "failed")
    return { key: "error", color: "var(--crit)", bg: "var(--crit-bg)", icon: "XCircle" };
  if (status === "cancelled")
    return { key: "cancelled", color: "var(--text-muted)", bg: "var(--bg-hover)", icon: "X" };
  if ((run.blockers ?? 0) > 0)
    return { key: "rejected", color: "var(--crit)", bg: "var(--crit-bg)", icon: "XCircle" };
  if ((run.findings_count ?? 0) > 0)
    return { key: "reviewed", color: "var(--warn)", bg: "var(--warn-bg)", icon: "MessageSquare" };
  return { key: "approved", color: "var(--ok)", bg: "var(--ok-bg)", icon: "CheckCircle" };
}

function countBySeverity(findings: ReviewRecord["findings"]): Record<Severity, number> {
  const counts = { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 } as Record<Severity, number>;
  for (const f of findings) {
    if (!f.dismissed_at && (f.severity as string) in counts) {
      counts[f.severity as Severity] = (counts[f.severity as Severity] ?? 0) + 1;
    }
  }
  return counts;
}

const rowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  width: "100%",
  padding: "10px 14px",
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "var(--bg-elevated)",
  textAlign: "left",
};

const iconBtnStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 4,
  borderRadius: 5,
  border: "1px solid var(--border)",
  background: "var(--bg-surface)",
  color: "var(--text-muted)",
  cursor: "pointer",
  flexShrink: 0,
};

const commitRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  width: "100%",
  padding: "8px 14px",
  borderRadius: 8,
  border: "1px dashed var(--border)",
  background: "transparent",
};

type TimelineItem =
  | { kind: "run"; ts: number; run: RunSummary }
  | { kind: "commit"; ts: number; commit: PrCommit };

function tsOf(s: string | null | undefined): number {
  if (!s) return 0;
  const n = Date.parse(s);
  return Number.isNaN(n) ? 0 : n;
}

export function RunHistory({
  runs,
  commits = [],
  reviews,
  onOpenTrace,
  onGoToReview,
  onDelete,
}: {
  runs: RunSummary[];
  commits?: PrCommit[];
  /** Full review records — used to derive per-run findings for the inline panel. */
  reviews?: ReviewRecord[];
  onOpenTrace: (runId: string) => void;
  onGoToReview?: (runId: string) => void;
  onDelete?: (runId: string) => void;
}) {
  const t = useTranslations("prReview");
  // Which run's findings panel is open (one at a time; any badge click toggles it).
  const [expandedRunId, setExpandedRunId] = React.useState<string | null>(null);

  const toggleRun = React.useCallback((runId: string) => {
    setExpandedRunId((prev) => (prev === runId ? null : runId));
  }, []);

  if (runs.length === 0 && commits.length === 0) return null;

  const items: TimelineItem[] = [
    ...runs.map((run) => ({ kind: "run" as const, ts: tsOf(run.ran_at), run })),
    ...commits.map((commit) => ({
      kind: "commit" as const,
      ts: tsOf(commit.committed_at),
      commit,
    })),
  ].sort((a, b) => b.ts - a.ts);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {items.map((item) => {
        if (item.kind === "commit") {
          const c = item.commit;
          return (
            <div key={`commit:${c.sha}`} style={commitRowStyle}>
              <Icon.GitCommit size={15} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
              <span className="mono" style={{ fontSize: 12, color: "var(--text-secondary)", flexShrink: 0 }}>
                {c.sha.slice(0, 7)}
              </span>
              <span
                style={{
                  fontSize: 12.5,
                  color: "var(--text-secondary)",
                  flex: 1,
                  minWidth: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                title={c.message}
              >
                {c.message.split("\n")[0]}
              </span>
              <span style={{ fontSize: 11, color: "var(--text-muted)", flexShrink: 0 }}>{c.author}</span>
              {c.committed_at && (
                <span style={{ fontSize: 11, color: "var(--text-muted)", flexShrink: 0 }}>
                  {new Date(c.committed_at).toLocaleTimeString()}
                </span>
              )}
            </div>
          );
        }

        const r = item.run;
        const o = outcomeOf(r);
        const settled = r.status === "done";
        const review = reviews?.find((rv) => rv.run_id === r.run_id);
        const fbs = review ? countBySeverity(review.findings) : null;
        const panelOpen = expandedRunId === r.run_id;
        const openFindings = review
          ? [...review.findings]
              .filter((f) => !f.dismissed_at)
              .sort((a, b) => (SEV_ORDER[a.severity] ?? 9) - (SEV_ORDER[b.severity] ?? 9))
          : [];

        return (
          <div key={`run:${r.run_id}`} style={rowStyle}>
            <Badge color={o.color} bg={o.bg} icon={o.icon}>
              {t(`runStatus.${o.key}`)}
            </Badge>
            {settled && r.score != null && <CircularScore score={r.score} size={30} stroke={3} />}
            <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
                <button
                  type="button"
                  onClick={() => onGoToReview?.(r.run_id)}
                  title={t("timeline.goToReview")}
                  style={{
                    background: "none",
                    border: "none",
                    padding: 0,
                    font: "inherit",
                    fontWeight: 600,
                    color: "var(--text-primary)",
                    cursor: onGoToReview ? "pointer" : "default",
                    textDecoration: onGoToReview ? "underline" : "none",
                    textDecorationStyle: "dotted",
                    textUnderlineOffset: 3,
                  }}
                >
                  {r.agent_name ?? "Agent"}
                </button>{" "}
                <span className="mono" style={{ fontSize: 12, fontWeight: 400, color: "var(--text-muted)" }}>
                  {r.provider}/{r.model}
                </span>
              </div>
              {r.status === "failed" && r.error && (
                <div
                  style={{ fontSize: 12, color: "var(--crit)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                  title={r.error}
                >
                  {r.error}
                </div>
              )}
              {/* Severity badges — anchor the dropdown panel below this element */}
              {settled && fbs && SEVERITIES.some((s) => (fbs[s] ?? 0) > 0) ? (
                <div style={{ position: "relative", display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {SEVERITIES.filter((sev) => (fbs[sev] ?? 0) > 0).map((sev) => (
                    <button
                      key={sev}
                      type="button"
                      onClick={(e) => { e.stopPropagation(); toggleRun(r.run_id); }}
                      style={{
                        background: "none",
                        border: "none",
                        padding: 0,
                        cursor: "pointer",
                        outline: panelOpen ? "2px solid var(--accent)" : "none",
                        outlineOffset: 2,
                        borderRadius: 5,
                      }}
                      aria-pressed={panelOpen}
                      aria-label={`${sev} findings: ${fbs[sev]}`}
                    >
                      <SeverityBadge severity={sev} count={fbs[sev]} compact />
                    </button>
                  ))}
                  {/* Dropdown panel — floats below the badges, overlays items below */}
                  {panelOpen && openFindings.length > 0 && (
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
                      <div style={{ padding: "8px 14px", fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", color: "var(--text-muted)", textTransform: "uppercase", borderBottom: "1px solid var(--border)" }}>
                        {openFindings.length} finding{openFindings.length !== 1 ? "s" : ""} in this run
                      </div>
                      <div style={{ padding: "8px 14px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
                        {openFindings.map((f) => (
                          <FindingMiniCard key={f.id} f={f} />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : settled ? (
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                  {t("runStatus.findings", { count: r.findings_count ?? 0 })}
                  {(r.blockers ?? 0) > 0 ? t("runStatus.blockers", { count: r.blockers ?? 0 }) : ""}
                </div>
              ) : null}
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2, fontSize: 11, color: "var(--text-muted)", flexShrink: 0 }}>
              {r.ran_at && <span>{new Date(r.ran_at).toLocaleTimeString()}</span>}
              {settled && (
                <RunCostBadge
                  variant="withTokens"
                  tokensIn={r.tokens_in}
                  tokensOut={r.tokens_out}
                  cost={r.cost_usd}
                />
              )}
            </div>
            <button
              type="button"
              title={t("timeline.openTrace")}
              aria-label={t("timeline.openTrace")}
              onClick={() => onOpenTrace(r.run_id)}
              style={iconBtnStyle}
            >
              <Icon.FileText size={13} />
            </button>
            {onDelete && r.status !== "running" && (
              <span
                role="button"
                aria-label={t("timeline.deleteRun")}
                title={t("timeline.deleteRun")}
                onClick={() => onDelete(r.run_id)}
                style={{ display: "inline-flex", padding: 3, borderRadius: 5, color: "var(--text-muted)", flexShrink: 0, cursor: "pointer" }}
              >
                <Icon.Trash size={13} />
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
