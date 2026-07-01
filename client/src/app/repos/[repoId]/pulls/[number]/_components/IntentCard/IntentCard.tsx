/* IntentCard — PR intent classification card for the Overview tab.
   Container + presentation in one file (data is local to this card; no parent
   fetches it). Container handles loading / empty (null) / error states;
   inner content renders the four sections and the recompute button. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Skeleton, ErrorState, SectionLabel, Button } from "@devdigest/ui";
import type { PrIntentRecord } from "@devdigest/shared";
import { usePrIntent, useRecomputeIntent } from "@/hooks/intent";
import { s } from "./styles";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface IntentCardProps {
  prId: string | number | null | undefined;
}

// ---------------------------------------------------------------------------
// Helper: scope / risk-areas list (purely presentational, extracted per
// react-best-practices: "Helper functions extracted OUTSIDE the component body")
// ---------------------------------------------------------------------------

function ScopeList({
  items,
  indicator,
  color,
  emptyLabel,
}: {
  items: string[];
  indicator: string;
  color: string;
  emptyLabel: string;
}) {
  if (items.length === 0) {
    return <p style={s.emptyList}>{emptyLabel}</p>;
  }
  return (
    <ul style={s.list}>
      {items.map((item, i) => (
        // Stable content-based keys are not possible here (items are plain strings
        // with no id), so index is acceptable for a static, non-reorderable list.
        <li key={i} style={s.listItem}>
          <span style={s.indicator(color)} aria-hidden="true">
            {indicator}
          </span>
          {item}
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Container + presentation
// ---------------------------------------------------------------------------

export function IntentCard({ prId }: IntentCardProps) {
  const t = useTranslations("prReview");

  // All hooks called unconditionally, before any conditional returns (Rules of
  // Hooks). The query is disabled when prId is null/undefined.
  const { data, isLoading, isError, refetch } = usePrIntent(prId);
  const recompute = useRecomputeIntent(prId);

  // ---- Loading ----
  if (isLoading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <Skeleton height={18} width={110} />
        <Skeleton height={42} />
        <Skeleton height={68} />
      </div>
    );
  }

  // ---- Error ----
  if (isError) {
    return (
      <ErrorState
        title={t("intent.errorTitle")}
        body={t("intent.errorBody")}
        onRetry={() => void refetch()}
      />
    );
  }

  // `data` is `PrIntentRecord | null | undefined` at this point.
  // undefined → query was disabled (prId == null) or not yet resolved; treat as null.
  const intent: PrIntentRecord | null = data ?? null;

  // Guard array access required by noUncheckedIndexedAccess: all three fields
  // are string[] in the Zod schema, but optional-chain + fallback is defensive.
  const inScope = intent?.in_scope ?? [];
  const outOfScope = intent?.out_of_scope ?? [];
  const riskAreas = intent?.risk_areas ?? [];

  // ---- Success: empty or populated ----
  return (
    <div style={s.card}>
      {/* ── Header: section label + icon-only recompute button ── */}
      <SectionLabel
        icon="Brain"
        right={
          <Button
            kind="ghost"
            size="sm"
            icon="RefreshCw"
            loading={recompute.isPending}
            disabled={recompute.isPending}
            aria-label={t("intent.ariaRecompute")}
            title={t("intent.recompute")}
            onClick={() => recompute.mutate()}
          />
        }
      >
        {t("intent.title")}
      </SectionLabel>

      {/* aria-live="polite" so screen readers announce content changes after a
          recompute without interrupting the user. */}
      <div aria-live="polite">
        {intent == null ? (
          /* ── Empty state: intent not yet computed ── */
          <div style={s.emptySection}>
            <p style={s.emptyTitle}>{t("intent.emptyTitle")}</p>
            <p style={s.emptyBody}>{t("intent.emptyBody")}</p>
          </div>
        ) : (
          /* ── Populated: summary + In/Out scope + Risk areas ── */
          <>
            {/* One-line intent summary as a pull-quote */}
            <p style={s.summaryQuote}>{intent.intent}</p>

            {/* ✓ In Scope */}
            <h4 style={s.sectionTitle}>{t("intent.inScope")}</h4>
            <ScopeList
              items={inScope}
              indicator="✓"
              color="var(--ok, #22c55e)"
              emptyLabel={t("intent.none")}
            />

            {/* ✕ Out of Scope */}
            <h4 style={s.sectionTitle}>{t("intent.outOfScope")}</h4>
            <ScopeList
              items={outOfScope}
              indicator="✕"
              color="var(--text-muted)"
              emptyLabel={t("intent.none")}
            />

            {/* ⚠ Risk Areas — only rendered when the LLM flagged at least one */}
            {riskAreas.length > 0 && (
              <>
                <h4 style={s.sectionTitle}>{t("intent.riskAreas")}</h4>
                <ScopeList
                  items={riskAreas}
                  indicator="⚠"
                  color="var(--warn, #f59e0b)"
                  emptyLabel={t("intent.none")}
                />
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
