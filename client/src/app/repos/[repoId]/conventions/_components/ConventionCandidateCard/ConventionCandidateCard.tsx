/* ConventionCandidateCard — one convention candidate:
   italic rule, path:line chip (copy + GitHub link), snippet, confidence bar,
   Accept/Reject toggles, and a selection checkbox for accepted+unmaterialised. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Checkbox, Icon, ProgressBar } from "@devdigest/ui";
import type { ConventionCandidate, ConventionStatus } from "@devdigest/shared";
import { confidenceColor, s } from "./styles";

export function ConventionCandidateCard({
  candidate,
  selected,
  onSelect,
  onJudge,
  isPending,
}: {
  candidate: ConventionCandidate;
  selected: boolean;
  onSelect: (id: string) => void;
  onJudge: (candidateId: string, status: ConventionStatus) => void;
  isPending?: boolean;
}) {
  const t = useTranslations("conventions");
  const [copied, setCopied] = React.useState(false);

  const pathLabel = `${candidate.evidence_path}:${candidate.evidence_line}`;
  const isMaterialised = candidate.skill_id !== null;
  const isAccepted = candidate.status === "accepted";
  const isRejected = candidate.status === "rejected";
  const isSelectable = isAccepted && !isMaterialised;

  const handleCopy = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(pathLabel);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard access denied */
    }
  };

  return (
    <div style={s.card}>
      {/* ── Rule title + optional checkbox + "in skill" badge ── */}
      <div style={s.headerRow}>
        {isSelectable && (
          <div style={s.checkboxWrap}>
            <Checkbox
              checked={selected}
              onChange={() => onSelect(candidate.id)}
            />
          </div>
        )}
        <span style={s.ruleTitle}>{candidate.rule}</span>
        {isMaterialised && (
          <span style={s.inSkillBadge}>{t("card.inSkill")}</span>
        )}
      </div>

      {/* ── path:line chip — click opens GitHub; copy button copies text ── */}
      <div style={s.pathRow}>
        <a
          href={candidate.evidence_url}
          target="_blank"
          rel="noopener noreferrer"
          style={s.pathLink}
          title={candidate.evidence_url}
        >
          <Icon.ExternalLink size={11} />
          {pathLabel}
        </a>
        <button
          onClick={handleCopy}
          style={{
            ...s.copyBtn,
            color: copied ? "var(--success, #22c55e)" : "var(--text-muted)",
          }}
          title={copied ? t("card.evidenceCopied") : t("card.copyPath")}
          aria-label={t("card.copyPath")}
        >
          {copied ? <Icon.Check size={12} /> : <Icon.Copy size={12} />}
        </button>
      </div>

      {/* ── Evidence snippet ── */}
      <pre style={s.snippet}>{candidate.evidence_snippet}</pre>

      {/* ── Footer: confidence bar + Accept / Reject toggles ── */}
      <div style={s.footer}>
        <span style={s.confidenceLabel}>{t("card.confidence")}</span>
        <div style={s.confidenceWrap}>
          <ProgressBar
            value={candidate.confidence * 100}
            color={confidenceColor(candidate.confidence)}
            height={5}
          />
          <span style={s.confidencePct}>
            {Math.round(candidate.confidence * 100)}%
          </span>
        </div>
        <div style={s.judgeRow}>
          <Button
            kind={isAccepted ? "primary" : "secondary"}
            size="sm"
            disabled={(isPending ?? false) || isMaterialised}
            onClick={() =>
              onJudge(candidate.id, isAccepted ? "suggested" : "accepted")
            }
          >
            {t("card.accept")}
          </Button>
          <Button
            kind={isRejected ? "danger" : "ghost"}
            size="sm"
            disabled={(isPending ?? false) || isMaterialised}
            onClick={() =>
              onJudge(candidate.id, isRejected ? "suggested" : "rejected")
            }
          >
            {t("card.reject")}
          </Button>
        </div>
      </div>
    </div>
  );
}
