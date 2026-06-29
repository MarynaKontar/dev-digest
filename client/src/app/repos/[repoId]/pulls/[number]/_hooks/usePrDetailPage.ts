"use client";

import React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { usePulls, usePullDetail } from "@/hooks";
import {
  usePrReviews,
  usePrActiveRuns,
  usePrRuns,
  useDeleteRun,
  useCancelRun,
} from "@/hooks/reviews";
import { useActiveRepo, useRepoNotFound } from "@/providers/repo-context";
import type { FindingRecord } from "@devdigest/shared";

export function usePrDetailPage(repoId: string, number: string) {
  const { activeRepo } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);

  // Resolve PR number → uuid: every PR API is keyed by row id, not number.
  const { data: pulls, isLoading: pullsLoading } = usePulls(repoId);
  const prId = pulls?.find((p) => p.number === Number(number))?.id ?? null;
  const { data: pr, isLoading: detailLoading, isError, error, refetch } = usePullDetail(prId);
  const isLoading = pullsLoading || (prId != null && detailLoading);

  const { data: reviews, refetch: refetchReviews } = usePrReviews(prId);

  const qc = useQueryClient();
  const { data: activeRuns } = usePrActiveRuns(prId);
  const { data: prRuns } = usePrRuns(prId);
  const deleteRun = useDeleteRun(prId);
  const cancel = useCancelRun();

  const liveRunIds = (activeRuns ?? []).map((r) => r.run_id);
  const reviewRunning = liveRunIds.length > 0;

  const invalidateActiveRuns = () => {
    if (prId) qc.invalidateQueries({ queryKey: ["pr-active-runs", prId] });
  };
  // When a run settles (done OR failed) refresh the full run history too, so a
  // just-failed run shows up in "Run history" immediately — no page reload.
  const invalidateRunHistory = () => {
    if (prId) qc.invalidateQueries({ queryKey: ["pr-runs", prId] });
  };

  const runs = reviews ?? [];
  const allFindings: FindingRecord[] = React.useMemo(
    () => runs.flatMap((r) => r.findings),
    [reviews],
  );
  const lethalTrifecta = allFindings.filter((f) => f.kind === "lethal_trifecta");
  const findingsCount = allFindings.length;

  const repoName = activeRepo?.full_name ?? repoId;
  const repoFullName = activeRepo?.full_name ?? null;

  return {
    prId,
    pr,
    isLoading,
    isError,
    error,
    refetch,
    reviews,
    refetchReviews,
    runs,
    allFindings,
    lethalTrifecta,
    findingsCount,
    prRuns,
    deleteRun,
    cancel,
    liveRunIds,
    reviewRunning,
    invalidateActiveRuns,
    invalidateRunHistory,
    repoName,
    repoFullName,
    repoNotFound,
  };
}
