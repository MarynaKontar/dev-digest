"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Markdown } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";

/** Preview tab — renders the skill body as the reviewing agent receives it. */
export function PreviewTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  return (
    <div style={{ maxWidth: 760 }}>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700 }}>{t("preview.title")}</h2>
        <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>
          {t("preview.caption")}
        </p>
      </div>
      <div
        style={{
          padding: "20px 24px",
          borderRadius: 8,
          border: "1px solid var(--border)",
          background: "var(--bg-surface)",
          fontSize: 14,
          lineHeight: 1.65,
        }}
      >
        <Markdown>{skill.body}</Markdown>
      </div>
    </div>
  );
}
