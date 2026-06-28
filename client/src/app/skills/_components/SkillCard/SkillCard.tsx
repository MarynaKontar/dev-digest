/* SkillCard — name, type badge, source badge, description, enabled toggle,
   stats line (N agents · pull% · accept%). Mirror AgentCard style. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Badge, Toggle } from "@devdigest/ui";
import type { Skill, SkillStats } from "@devdigest/shared";
import { useDeleteSkill } from "@/hooks/skills";
import { TYPE_COLOR } from "./constants";
import { s } from "./styles";

export function SkillCard({
  skill,
  active,
  stats,
  onClick,
  onToggle,
}: {
  skill: Skill;
  active?: boolean;
  stats?: SkillStats;
  onClick?: () => void;
  onToggle?: (enabled: boolean) => void;
}) {
  const t = useTranslations("skills");
  const del = useDeleteSkill();
  const typeColor = TYPE_COLOR[skill.type] ?? "var(--text-secondary)";

  return (
    <div onClick={onClick} style={s.card(!!active, skill.enabled)}>
      <div style={s.headerRow}>
        <div style={s.iconBox}>
          <Icon.Sparkles size={14} />
        </div>
        <span style={s.name}>{skill.name}</span>
        {onToggle && (
          <div onClick={(e) => e.stopPropagation()}>
            <Toggle on={skill.enabled} onChange={onToggle} size={14} />
          </div>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (window.confirm(`Delete skill "${skill.name}"? This cannot be undone.`)) {
              del.mutate(skill.id);
            }
          }}
          disabled={del.isPending}
          title="Delete skill"
          aria-label="Delete skill"
          style={{
            background: "none",
            border: "none",
            cursor: del.isPending ? "not-allowed" : "pointer",
            color: "var(--text-muted)",
            display: "inline-flex",
            padding: 4,
          }}
        >
          <Icon.Trash size={14} />
        </button>
      </div>

      <div style={s.description}>{skill.description || t("card.noDescription")}</div>

      <div style={s.metaRow}>
        <Badge color={typeColor}>{t(`card.type.${skill.type}`)}</Badge>
        <Badge color="var(--text-muted)">{t(`card.source.${skill.source}`)}</Badge>
        {stats != null && (
          <span style={s.statsLine}>
            {t("card.agents", { count: stats.used_by })}
            {" · "}
            {t("card.pullRate", { pct: Math.round(stats.pull_rate * 100) })}
            {" · "}
            {t("card.acceptRate", { pct: Math.round(stats.accept_rate * 100) })}
          </span>
        )}
      </div>
    </div>
  );
}
