"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Skeleton, ErrorState, Badge, Button, Markdown } from "@devdigest/ui";
import type { Skill, SkillVersion } from "@devdigest/shared";
import { useSkillVersions, useRestoreSkillVersion } from "@/hooks/skills";
import { useToast } from "@/providers/toast";
import { s } from "./styles";

/** VersionsTab — immutable body history, diff, restore. */
export function VersionsTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const { data: versions, isLoading, isError, refetch } = useSkillVersions(skill.id);
  const restore = useRestoreSkillVersion();
  const [diffPair, setDiffPair] = React.useState<{ old: SkillVersion; current: SkillVersion } | null>(null);

  if (isLoading) {
    return (
      <div style={{ maxWidth: 760, display: "flex", flexDirection: "column", gap: 10 }}>
        <Skeleton height={60} />
        <Skeleton height={60} />
        <Skeleton height={60} />
      </div>
    );
  }
  if (isError || !versions) {
    return <ErrorState body="Could not load version history." onRetry={() => refetch()} />;
  }

  const sorted = [...versions].sort((a, b) => b.version - a.version);
  const currentVersion = sorted[0];

  const handleRestore = (v: SkillVersion) => {
    restore.mutate(
      { skillId: skill.id, version: v.version },
      {
        onSuccess: (data) => toast.success(t("versions.restored", { version: data.version })),
      },
    );
  };

  return (
    <div style={{ maxWidth: 760 }}>
      <div style={s.header}>
        <h2 style={s.h2}>
          {t("versions.title")}
          {" · "}
          <span style={s.count}>{t("versions.versionCount", { count: versions.length })}</span>
        </h2>
        <p style={s.caption}>{t("versions.caption")}</p>
      </div>

      {/* Diff modal */}
      {diffPair && (
        <div style={s.diffOverlay}>
          <div style={s.diffPanel}>
            <div style={s.diffHeader}>
              <strong>
                {t("versions.diffTitle", { old: diffPair.old.version, current: diffPair.current.version })}
              </strong>
              <Button kind="ghost" size="sm" onClick={() => setDiffPair(null)}>
                {t("versions.closeDiff")}
              </Button>
            </div>
            <div style={s.diffCols}>
              <div style={s.diffCol}>
                <div style={s.diffColLabel}>{t("versions.vBadge", { version: diffPair.old.version })}</div>
                <div style={s.diffBody}>
                  <pre style={s.pre}>{diffPair.old.body}</pre>
                </div>
              </div>
              <div style={s.diffCol}>
                <div style={s.diffColLabel}>
                  {t("versions.vBadge", { version: diffPair.current.version })}
                </div>
                <div style={s.diffBody}>
                  <pre style={s.pre}>{diffPair.current.body}</pre>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <ul style={s.list}>
        {sorted.map((v, idx) => {
          const isCurrent = idx === 0;
          const isRestoring = restore.isPending && restore.variables?.version === v.version;
          return (
            <li key={v.version} style={s.row}>
              <Badge color={isCurrent ? "var(--accent)" : "var(--text-secondary)"} mono>
                {t("versions.vBadge", { version: v.version })}
              </Badge>
              {isCurrent && (
                <Badge color="var(--ok)">{t("versions.currentBadge")}</Badge>
              )}
              <span style={s.note}>{v.note || t("versions.noNote")}</span>
              <span style={s.date}>{new Date(v.created_at).toLocaleDateString()}</span>
              {!isCurrent && currentVersion && (
                <>
                  <Button
                    kind="ghost"
                    size="sm"
                    onClick={() => setDiffPair({ old: v, current: currentVersion })}
                  >
                    {t("versions.diff")}
                  </Button>
                  <Button
                    kind="secondary"
                    size="sm"
                    onClick={() => handleRestore(v)}
                    disabled={isRestoring}
                  >
                    {isRestoring ? t("versions.restoring") : t("versions.restore")}
                  </Button>
                </>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
