/* hooks/skills.ts — React Query hooks for the Skills page, Skill editor, and
   Agent → Skills tab. Mirror the structure of hooks/agents.ts. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, apiFetch, API_BASE } from "@/lib/api";
import type { Skill, SkillType, SkillSource, SkillVersion, SkillImportPreview, SkillStats, AgentSkillLink } from "@devdigest/shared";

// ---------------------------------------------------------------------------
// Skill CRUD
// ---------------------------------------------------------------------------

export function useSkills() {
  return useQuery({
    queryKey: ["skills"],
    queryFn: () => api.get<Skill[]>("/skills"),
  });
}

export function useSkill(id: string | null | undefined) {
  return useQuery({
    queryKey: ["skill", id],
    queryFn: () => api.get<Skill>(`/skills/${id}`),
    enabled: !!id,
  });
}

export interface CreateSkillInput {
  name: string;
  description: string;
  type: SkillType;
  source?: SkillSource;
  body: string;
  enabled?: boolean;
}

export function useCreateSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSkillInput) => api.post<Skill>("/skills", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["skills"] }),
  });
}

export interface UpdateSkillInput {
  id: string;
  patch: Partial<Pick<Skill, "name" | "description" | "type" | "body" | "enabled">> & { note?: string };
}

export function useUpdateSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: UpdateSkillInput) => api.put<Skill>(`/skills/${id}`, patch),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["skills"] });
      qc.setQueryData(["skill", data.id], data);
    },
  });
}

export function useDeleteSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<{ ok: boolean }>(`/skills/${id}`),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: ["skills"] });
      qc.removeQueries({ queryKey: ["skill", id] });
    },
  });
}

// ---------------------------------------------------------------------------
// Versions
// ---------------------------------------------------------------------------

export function useSkillVersions(skillId: string | null | undefined) {
  return useQuery({
    queryKey: ["skill-versions", skillId],
    queryFn: () => api.get<SkillVersion[]>(`/skills/${skillId}/versions`),
    enabled: !!skillId,
  });
}

export interface RestoreSkillVersionInput {
  skillId: string;
  version: number;
}

export function useRestoreSkillVersion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ skillId, version }: RestoreSkillVersionInput) =>
      api.post<Skill>(`/skills/${skillId}/versions/${version}/restore`),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["skills"] });
      qc.invalidateQueries({ queryKey: ["skill-versions", data.id] });
      qc.setQueryData(["skill", data.id], data);
    },
  });
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

export function useSkillStats(skillId: string | null | undefined) {
  return useQuery({
    queryKey: ["skill-stats", skillId],
    queryFn: () => api.get<SkillStats>(`/skills/${skillId}/stats`),
    enabled: !!skillId,
  });
}

// ---------------------------------------------------------------------------
// Import — multipart POST; browser sets multipart/form-data boundary automatically.
// Cannot use api.post() here because it injects application/json content-type.
// ---------------------------------------------------------------------------

export function useImportSkill() {
  return useMutation({
    mutationFn: async (file: File): Promise<SkillImportPreview> => {
      const form = new FormData();
      form.append("file", file);
      let res: Response;
      try {
        res = await fetch(`${API_BASE}/skills/import`, { method: "POST", body: form });
      } catch (e) {
        throw new Error(`Cannot reach the DevDigest engine at ${API_BASE}.`);
      }
      if (!res.ok) {
        let msg = `${res.status} ${res.statusText}`;
        try {
          const body = await res.json();
          if (body?.error?.message) msg = body.error.message;
        } catch { /* non-JSON */ }
        throw new Error(msg);
      }
      return res.json() as Promise<SkillImportPreview>;
    },
  });
}

// ---------------------------------------------------------------------------
// Agent ↔ skill links
// ---------------------------------------------------------------------------

export function useAgentSkills(agentId: string | null | undefined) {
  return useQuery({
    queryKey: ["agent-skills", agentId],
    queryFn: () => api.get<AgentSkillLink[]>(`/agents/${agentId}/skills`),
    enabled: !!agentId,
  });
}

export interface SetAgentSkillsInput {
  agentId: string;
  skills: Array<{ skill_id: string; order: number; enabled: boolean }>;
}

export function useSetAgentSkills() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ agentId, skills }: SetAgentSkillsInput) =>
      api.post<AgentSkillLink[]>(`/agents/${agentId}/skills`, { skills }),
    onSuccess: (_data, { agentId }) => {
      qc.invalidateQueries({ queryKey: ["agent-skills", agentId] });
    },
  });
}

export interface ToggleAgentSkillInput {
  agentId: string;
  skillId: string;
  enabled: boolean;
}

export function useToggleAgentSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ agentId, skillId, enabled }: ToggleAgentSkillInput) =>
      api.patch<AgentSkillLink>(`/agents/${agentId}/skills/${skillId}`, { enabled }),
    onSuccess: (_data, { agentId }) => {
      qc.invalidateQueries({ queryKey: ["agent-skills", agentId] });
    },
  });
}
