/* hooks/conventions.ts — React Query hooks for the Conventions page.
   Mirror the structure of hooks/skills.ts. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type {
  ConventionsView,
  ConventionCandidate,
  ConventionStatus,
  Skill,
  SkillType,
} from "@devdigest/shared";

// ---------------------------------------------------------------------------
// Conventions view (GET /repos/:id/conventions)
// ---------------------------------------------------------------------------

export function useConventions(repoId: string | null | undefined) {
  return useQuery({
    queryKey: ["conventions", repoId],
    queryFn: () => api.get<ConventionsView>(`/repos/${repoId}/conventions`),
    enabled: !!repoId,
  });
}

// ---------------------------------------------------------------------------
// Extract / Re-scan (POST /repos/:id/conventions/extract)
// ---------------------------------------------------------------------------

export function useExtract(repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api.post<ConventionsView>(`/repos/${repoId}/conventions/extract`),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["conventions", repoId] }),
  });
}

// ---------------------------------------------------------------------------
// Judge one candidate (PATCH /repos/:id/conventions/:candidateId)
// ---------------------------------------------------------------------------

export function useJudge(repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      candidateId,
      status,
    }: {
      candidateId: string;
      status: ConventionStatus;
    }) =>
      api.patch<ConventionCandidate>(
        `/repos/${repoId}/conventions/${candidateId}`,
        { status }
      ),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["conventions", repoId] }),
  });
}

// ---------------------------------------------------------------------------
// Bulk judge (POST /repos/:id/conventions/judge)
// ---------------------------------------------------------------------------

export function useJudgeBulk(repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      ids,
      status,
    }: {
      ids: string[];
      status: ConventionStatus;
    }) =>
      api.post<ConventionCandidate[]>(`/repos/${repoId}/conventions/judge`, {
        ids,
        status,
      }),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["conventions", repoId] }),
  });
}

// ---------------------------------------------------------------------------
// Create convention skill (POST /repos/:id/conventions/skill)
// ---------------------------------------------------------------------------

export interface CreateConventionSkillInput {
  candidate_ids: string[];
  name: string;
  description: string;
  type: SkillType;
  enabled: boolean;
  body: string;
}

export function useCreateConventionSkill(repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateConventionSkillInput) =>
      api.post<Skill>(`/repos/${repoId}/conventions/skill`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["conventions", repoId] });
      qc.invalidateQueries({ queryKey: ["skills"] });
    },
  });
}
