/* FindingsBadge — "N findings" pill on a flagged file. Clicking scrolls the diff
   straight to the first offending line (targetId is a CodeLine row id set by the
   Smart Diff view). Renders nothing when the file has no findings. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";

export function FindingsBadge({ count, targetId }: { count: number; targetId: string }) {
  const t = useTranslations("prReview");
  if (count <= 0) return null;

  const label = t("smartDiff.findingsBadge", { count });
  const onClick = () => {
    // Scroll to the flagged line; no-op if the file card happens to be collapsed.
    document.getElementById(targetId)?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  return (
    <Button kind="ghost" size="sm" icon="AlertTriangle" aria-label={label} onClick={onClick}>
      {label}
    </Button>
  );
}
