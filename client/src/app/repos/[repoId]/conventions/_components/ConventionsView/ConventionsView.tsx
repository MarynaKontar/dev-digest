/* ConventionsView — /repos/:repoId/conventions main view.
   Header with Re-scan, candidate list with Accept/Reject, selection bar,
   and Create skill button that opens CreateConventionSkillModal. */
"use client";

import React from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { useActiveRepo } from "@/providers/repo-context";
import {
  useConventions,
  useExtract,
  useJudge,
} from "@/hooks/conventions";
import type { ConventionStatus } from "@devdigest/shared";
import { ConventionCandidateCard } from "../ConventionCandidateCard";
import { CreateConventionSkillModal } from "../CreateConventionSkillModal";
import { relativeTime } from "./helpers";
import { s } from "./styles";

export function ConventionsView() {
  const t = useTranslations("conventions");
  const params = useParams<{ repoId: string }>();
  const repoId = params.repoId;
  const { activeRepo } = useActiveRepo();

  // Display name: "owner/repo" for the heading; short name for the skill slug.
  const repoFullName =
    activeRepo?.full_name ?? activeRepo?.name ?? t("page.repoFallback");
  const repoShortName = activeRepo?.name ?? repoId;

  const {
    data,
    isLoading,
    isError,
    refetch,
  } = useConventions(repoId);

  const extract = useExtract(repoId);
  const judge = useJudge(repoId);

  const scan = data?.scan ?? null;
  const candidates = data?.candidates ?? [];

  // Selection model: accepted & unmaterialised candidates start selected.
  // Key changes in candidates (status/skill_id flips) re-seed the selection.
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [showCreate, setShowCreate] = React.useState(false);

  const selectableIds = candidates
    .filter((c) => c.status === "accepted" && c.skill_id === null)
    .map((c) => c.id);

  // Stable string that changes whenever the selectable pool changes.
  const selectableKey = selectableIds.join(",");
  React.useEffect(() => {
    setSelected(new Set(selectableIds));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectableKey]);

  const acceptedCount = candidates.filter((c) => c.status === "accepted").length;
  const selectedCount = selected.size;

  const handleToggleSelect = React.useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleDeselectAll = () => setSelected(new Set());

  const handleJudge = React.useCallback(
    (candidateId: string, status: ConventionStatus) => {
      judge.mutate({ candidateId, status });
    },
    [judge]
  );

  const crumb = [
    { label: t("page.crumbLab") },
    { label: repoFullName, mono: true },
    { label: t("page.crumbConventions") },
  ];

  return (
    <AppShell crumb={crumb}>
      {showCreate && (
        <CreateConventionSkillModal
          repoId={repoId}
          repoShortName={repoShortName}
          selectedIds={[...selected]}
          candidates={candidates}
          onClose={() => setShowCreate(false)}
          onSuccess={() => {
            setShowCreate(false);
            setSelected(new Set());
            void refetch();
          }}
        />
      )}

      <div style={s.page}>
        {/* ── Header ── */}
        <div style={s.header}>
          <div style={s.headerText}>
            <h1 style={s.h1}>
              {t("page.headingPrefix")}
              <span className="mono">{repoFullName}</span>
            </h1>
            <p style={s.subtitle}>
              {scan
                ? t("page.subtitleScan", {
                    count: scan.sample_count,
                    time: relativeTime(scan.created_at),
                  })
                : t("page.subtitle")}
            </p>
          </div>
          <div style={s.headerActions}>
            <Button
              kind="secondary"
              size="sm"
              icon="RefreshCw"
              loading={extract.isPending}
              onClick={() => extract.mutate()}
            >
              {extract.isPending ? t("page.scanning") : t("page.rescan")}
            </Button>
          </div>
        </div>

        {/* ── Selection bar (only when there are accepted+unmaterialised candidates) ── */}
        {selectableIds.length > 0 && (
          <div style={s.selectionBar}>
            <span style={s.selectionText}>
              {t("selection.counter", {
                selected: selectedCount,
                total: acceptedCount,
              })}
            </span>
            <Button kind="ghost" size="sm" onClick={handleDeselectAll}>
              {t("selection.deselectAll")}
            </Button>
            <Button
              kind="primary"
              size="sm"
              icon="Sparkles"
              disabled={selectedCount === 0}
              onClick={() => setShowCreate(true)}
            >
              {t("selection.createSkill")}
            </Button>
          </div>
        )}

        {/* ── Content ── */}
        {isLoading ? (
          <>
            <Skeleton height={140} />
            <Skeleton height={140} />
            <Skeleton height={140} />
          </>
        ) : isError ? (
          <ErrorState body={t("page.loadError")} onRetry={() => void refetch()} />
        ) : !scan ? (
          <EmptyState
            icon="ListChecks"
            title={t("page.empty.title")}
            body={t("page.empty.body")}
            cta={t("page.empty.cta")}
            onCta={() => extract.mutate()}
          />
        ) : candidates.length === 0 ? (
          <EmptyState
            icon="ListChecks"
            title={t("page.empty.title")}
            body={t("page.empty.body")}
            cta={t("page.rescan")}
            onCta={() => extract.mutate()}
          />
        ) : (
          <div style={s.list}>
            {candidates.map((candidate) => (
              <ConventionCandidateCard
                key={candidate.id}
                candidate={candidate}
                selected={selected.has(candidate.id)}
                onSelect={handleToggleSelect}
                onJudge={handleJudge}
                isPending={judge.isPending}
              />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
