/* hooks/smart-diff.ts — React Query hook for the Smart Diff endpoint.
   Mirrors the pattern in hooks/intent.ts / hooks/core.ts usePullDetail:
   GET /pulls/:id/smart-diff returns SmartDiffResponse (= SmartDiff from brief.ts). */
"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { SmartDiffResponse } from "@devdigest/shared";

/**
 * Fetch the smart-diff classification for a PR.
 *
 * Disabled when `prId` is null (e.g. before the PR row has resolved).
 * With `enabled: false`, TanStack Query v5 keeps `isLoading: false` and
 * `data: undefined` — callers use `data ?? null` rather than gating on
 * `isLoading` alone (see INSIGHTS.md § TanStack Query v5).
 */
export function useSmartDiff(prId: string | null) {
  return useQuery({
    queryKey: ["smart-diff", prId],
    queryFn: () => api.get<SmartDiffResponse>(`/pulls/${prId}/smart-diff`),
    enabled: !!prId,
  });
}
