/* PRSeverityFindings — inline panel shown below a PR row when the user clicks
   any severity counter. Shows ALL non-dismissed findings from the latest batch
   session (CRITICAL → WARNING → SUGGESTION order). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Skeleton, Icon } from "@devdigest/ui";
import { usePrReviews } from "@/hooks";
import { FindingMiniCard } from "../FindingMiniCard/FindingMiniCard";

const SEV_ORDER: Record<string, number> = { CRITICAL: 0, WARNING: 1, SUGGESTION: 2 };

interface PRSeverityFindingsProps {
  prId: string;
}

export function PRSeverityFindings({ prId }: PRSeverityFindingsProps) {
  const t = useTranslations("prReview");
  const { data: reviews, isLoading } = usePrReviews(prId, { enabled: true });

  if (isLoading) {
    return (
      <div style={{ padding: "12px 20px", display: "flex", flexDirection: "column", gap: 8 }}>
        <Skeleton height={56} />
        <Skeleton height={56} />
      </div>
    );
  }

  // Cluster all reviews in the same batch session (within BATCH_GAP_MS of the
  // newest). Multiple agents run concurrently — the single "latest" review may
  // have 0 findings while another agent in the same session has all of them.
  const BATCH_GAP_MS = 90_000;
  const sorted = [...(reviews ?? [])]
    .filter((r) => r.kind === "review")
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const latestMs = sorted[0] ? new Date(sorted[0].created_at).getTime() : 0;
  const findings = sorted
    .filter((r) => latestMs - new Date(r.created_at).getTime() <= BATCH_GAP_MS)
    .flatMap((r) => r.findings)
    .filter((f) => !f.dismissed_at)
    .sort((a, b) => (SEV_ORDER[a.severity] ?? 9) - (SEV_ORDER[b.severity] ?? 9));

  if (findings.length === 0) {
    return (
      <div style={{ padding: "14px 20px", fontSize: 13, color: "var(--text-muted)" }}>
        {t("list.panel.noFindings")}
      </div>
    );
  }

  return (
    <div style={{ padding: "8px 20px 14px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 8 }}>
        <Icon.AlertTriangle size={13} />
        {findings.length} finding{findings.length !== 1 ? "s" : ""}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {findings.map((f) => (
          <FindingMiniCard key={f.id} f={f} />
        ))}
      </div>
    </div>
  );
}
