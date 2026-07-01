/* hooks/intent.ts — React Query hooks for PR intent (GET + POST recompute).
   Mirror the structure of hooks/core.ts usePullDetail / hooks/conventions.ts. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { PrIntentRecord } from "@devdigest/shared";

// ---- Query: GET /pulls/:id/intent ----

/** Fetch the stored intent for a PR. Returns null when intent has not yet been computed. */
export function usePrIntent(prId: string | number | null | undefined) {
  return useQuery({
    queryKey: ["pr-intent", prId],
    queryFn: () => api.get<PrIntentRecord | null>(`/pulls/${prId}/intent`),
    enabled: prId != null,
  });
}

// ---- Mutation: POST /pulls/:id/intent/recompute ----

/** Recompute intent for a PR (calls the cheap LLM classifier) and invalidates the cached query. */
export function useRecomputeIntent(prId: string | number | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<PrIntentRecord>(`/pulls/${prId}/intent/recompute`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pr-intent", prId] }),
  });
}
