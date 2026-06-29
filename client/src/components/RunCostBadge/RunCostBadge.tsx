/**
 * RunCostBadge — displays a run's cost (and optionally token count).
 *
 * Two variants via discriminated-union props:
 *   compact    — just the formatted cost; used in the PR list COST column.
 *   withTokens — "{N tok · $cost}"; used in the agent-runs timeline.
 */
import React from "react";
import { formatCost } from "@/utils/cost";

const mutedStyle: React.CSSProperties = { color: "var(--text-muted)" };

type CompactProps = {
  variant: "compact";
  cost: number | null | undefined;
};

type WithTokensProps = {
  variant: "withTokens";
  cost: number | null | undefined;
  tokensIn?: number | null;
  tokensOut?: number | null;
};

type RunCostBadgeProps = CompactProps | WithTokensProps;

export function RunCostBadge(props: RunCostBadgeProps) {
  if (props.variant === "compact") {
    const formatted = formatCost(props.cost);
    return (
      <span style={props.cost == null ? mutedStyle : undefined}>{formatted}</span>
    );
  }

  // withTokens variant
  const { cost, tokensIn, tokensOut } = props;
  const totalTokens = (tokensIn ?? 0) + (tokensOut ?? 0);

  // Render "—" when there are no tokens AND no cost data.
  if (totalTokens === 0 && cost == null) {
    return <span style={mutedStyle}>—</span>;
  }

  const costStr = formatCost(cost);
  return (
    <span style={mutedStyle}>
      {totalTokens.toLocaleString()} tok · {costStr}
    </span>
  );
}
