/* SkillsTab — one checklist over the entire skill library, seeded with the
   agent's current links. Order matters (earlier = earlier in assembled prompt).
   Reorder with up/down buttons (no dnd library in package.json). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Badge, Skeleton, ErrorState, Icon } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { useSkills, useAgentSkills, useSetAgentSkills } from "@/hooks/skills";
import { useToast } from "@/providers/toast";
import { TYPE_BADGE_COLOR } from "./constants";
import { s } from "./styles";

interface RowState {
  skill_id: string;
  name: string;
  type: string;
  enabled: boolean;
  order: number;
}

/** Sort rows: enabled first (by order), then disabled (by name). */
function buildRows(
  allSkills: { id: string; name: string; type: string }[],
  links: { skill_id: string; order: number; enabled: boolean }[],
): RowState[] {
  const linkMap = new Map(links.map((l) => [l.skill_id, l]));
  return allSkills
    .map((sk, i) => {
      const link = linkMap.get(sk.id);
      return {
        skill_id: sk.id,
        name: sk.name,
        type: sk.type,
        enabled: link?.enabled ?? false,
        order: link?.order ?? i + 1000,
      };
    })
    .sort((a, b) => {
      // enabled rows first, ordered; disabled rows last, alphabetical
      if (a.enabled && !b.enabled) return -1;
      if (!a.enabled && b.enabled) return 1;
      if (a.enabled && b.enabled) return a.order - b.order;
      return a.name.localeCompare(b.name);
    });
}

export function SkillsTab({ agent }: { agent: Agent }) {
  const t = useTranslations("agents");
  const toast = useToast();
  const setSkills = useSetAgentSkills();

  const { data: allSkills, isLoading: loadingSkills, isError: skillsError, refetch: refetchSkills } = useSkills();
  const { data: links, isLoading: loadingLinks, isError: linksError, refetch: refetchLinks } = useAgentSkills(agent.id);

  const [search, setSearch] = React.useState("");
  const [rows, setRows] = React.useState<RowState[]>([]);
  const [dirty, setDirty] = React.useState(false);

  // Seed rows whenever server data arrives or changes
  React.useEffect(() => {
    if (!allSkills || !links) return;
    setRows(buildRows(allSkills, links));
    setDirty(false);
  }, [allSkills, links]);

  const isLoading = loadingSkills || loadingLinks;
  const isError = skillsError || linksError;

  const filtered = search.trim()
    ? rows.filter((r) => r.name.toLowerCase().includes(search.trim().toLowerCase()))
    : rows;

  const enabledCount = rows.filter((r) => r.enabled).length;
  const totalCount = rows.length;

  const toggle = (skillId: string) => {
    setRows((prev) =>
      prev.map((r) => (r.skill_id === skillId ? { ...r, enabled: !r.enabled } : r)),
    );
    setDirty(true);
  };

  const move = (skillId: string, dir: -1 | 1) => {
    setRows((prev) => {
      const idx = prev.findIndex((r) => r.skill_id === skillId);
      if (idx < 0) return prev;
      const swapIdx = idx + dir;
      if (swapIdx < 0 || swapIdx >= prev.length) return prev;
      const next = [...prev];
      const a = next[idx]!;
      const b = next[swapIdx]!;
      next[idx] = b;
      next[swapIdx] = a;
      return next;
    });
    setDirty(true);
  };

  const save = () => {
    const skills = rows.map((r, i) => ({ skill_id: r.skill_id, order: i, enabled: r.enabled }));
    setSkills.mutate(
      { agentId: agent.id, skills },
      { onSuccess: () => { setDirty(false); toast.success("Skills saved."); } },
    );
  };

  if (isLoading) {
    return (
      <div style={s.wrap}>
        <Skeleton height={24} width={200} />
        <Skeleton height={44} />
        <Skeleton height={44} />
        <Skeleton height={44} />
      </div>
    );
  }

  if (isError) {
    return (
      <ErrorState
        body="Could not load skills."
        onRetry={() => { refetchSkills(); refetchLinks(); }}
      />
    );
  }

  return (
    <div style={s.wrap}>
      {/* Header */}
      <div style={s.header}>
        <h2 style={s.h2}>{t("skills.title")}</h2>
        <span style={s.count}>{t("skills.enabledCount", { linked: enabledCount, total: totalCount })}</span>
        {dirty && (
          <Button kind="primary" size="sm" icon="Check" onClick={save} disabled={setSkills.isPending}>
            Save
          </Button>
        )}
      </div>

      <p style={s.caption}>{t("skills.orderHint")}</p>

      {/* Search */}
      <div style={s.search}>
        <Icon.Search size={13} style={{ color: "var(--text-muted)" }} />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("skills.filterPlaceholder")}
          style={s.searchInput}
        />
      </div>

      {/* Checklist */}
      <ul style={s.list}>
        {filtered.map((row, visibleIdx) => {
          const realIdx = rows.findIndex((r) => r.skill_id === row.skill_id);
          const typeColor = TYPE_BADGE_COLOR[row.type] ?? "var(--text-secondary)";
          return (
            <li key={row.skill_id} style={s.row(row.enabled)}>
              {/* Up/down reorder (only for enabled rows where order matters) */}
              <div style={s.reorderBtns}>
                <button
                  style={s.reorderBtn}
                  onClick={() => move(row.skill_id, -1)}
                  disabled={realIdx === 0}
                  aria-label="Move up"
                  title="Move up"
                >
                  <Icon.ArrowUp size={12} />
                </button>
                <button
                  style={s.reorderBtn}
                  onClick={() => move(row.skill_id, 1)}
                  disabled={realIdx === rows.length - 1}
                  aria-label="Move down"
                  title="Move down"
                >
                  <Icon.ArrowDown size={12} />
                </button>
              </div>

              {/* Checkbox */}
              <input
                type="checkbox"
                checked={row.enabled}
                onChange={() => toggle(row.skill_id)}
                style={s.checkbox}
                aria-label={`Enable ${row.name}`}
              />

              {/* Name */}
              <span style={s.skillName}>{row.name}</span>

              {/* Type badge */}
              <Badge color={typeColor}>{row.type}</Badge>
            </li>
          );
        })}
      </ul>

      {filtered.length === 0 && (
        <p style={s.empty}>No skills match "{search}".</p>
      )}
    </div>
  );
}
