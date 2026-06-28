"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Skeleton, ErrorState, Donut } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useSkillStats } from "@/hooks/skills";
import { CATEGORY_COLORS } from "./constants";
import { s } from "./styles";

/** Stats tab — KPI cards, agents list, findings-by-category donut. */
export function StatsTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const router = useRouter();
  const { data: stats, isLoading, isError, refetch } = useSkillStats(skill.id);

  if (isLoading) {
    return (
      <div style={{ maxWidth: 760, display: "flex", flexDirection: "column", gap: 12 }}>
        <Skeleton height={80} />
        <Skeleton height={160} />
        <Skeleton height={180} />
      </div>
    );
  }

  if (isError || !stats) {
    return <ErrorState body="Could not load stats." onRetry={() => refetch()} />;
  }

  const kpis = [
    { label: t("stats.usedBy"), value: `${stats.used_by}`, unit: t("stats.usedByUnit") },
    { label: t("stats.pullRate"), value: `${Math.round(stats.pull_rate * 100)}%`, unit: "" },
    { label: t("stats.acceptRate"), value: `${Math.round(stats.accept_rate * 100)}%`, unit: "" },
    { label: t("stats.findings30d"), value: `${stats.findings_30d}`, unit: "" },
  ];

  const donutSegments = stats.by_category.map((c, i) => ({
    label: c.category,
    value: c.count,
    color: CATEGORY_COLORS[i % CATEGORY_COLORS.length] ?? "#6b7280",
  }));

  return (
    <div style={{ maxWidth: 760 }}>
      <h2 style={s.h2}>{t("stats.title")}</h2>

      {/* KPI row */}
      <div style={s.kpiRow}>
        {kpis.map((kpi) => (
          <div key={kpi.label} style={s.kpiCard}>
            <div style={s.kpiValue}>{kpi.value}</div>
            <div style={s.kpiLabel}>
              {kpi.label}
              {kpi.unit && <span style={s.kpiUnit}> {kpi.unit}</span>}
            </div>
          </div>
        ))}
      </div>

      <p style={s.demoNote}>{t("stats.demoNote")}</p>

      {/* Agents using this skill */}
      <div style={s.section}>
        <h3 style={s.sectionTitle}>{t("stats.agentsTitle")}</h3>
        {stats.agents.length === 0 ? (
          <p style={s.empty}>{t("stats.agentsEmpty")}</p>
        ) : (
          <ul style={s.agentList}>
            {stats.agents.map((ag) => (
              <li
                key={ag.id}
                style={s.agentItem}
                onClick={() => router.push(`/agents/${ag.id}?tab=skills`)}
              >
                <span style={s.agentName}>{ag.name}</span>
                <span style={s.agentArrow}>→</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Findings by category donut */}
      <div style={s.section}>
        <h3 style={s.sectionTitle}>{t("stats.categoryTitle")}</h3>
        {donutSegments.length === 0 ? (
          <p style={s.empty}>{t("stats.categoryEmpty")}</p>
        ) : (
          <Donut segments={donutSegments} valuePrefix="" />
        )}
      </div>
    </div>
  );
}
