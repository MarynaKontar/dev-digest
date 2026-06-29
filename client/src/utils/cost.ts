/**
 * formatCost — format a nullable USD cost value for display.
 *
 * Rules:
 *   null | undefined  → "—"  (no data: failed/cancelled/un-priced run)
 *   0                 → "$0.00"  (genuinely free run — visually distinct from "—")
 *   < $0.01           → enough decimal places for ~2 significant figures
 *                        (floor: 2 decimals). E.g. $0.0013, $0.0060.
 *   ≥ $0.01           → 2 decimal places. E.g. $0.06, $1.50.
 */
export function formatCost(usd: number | null | undefined): string {
  if (usd == null) return "—";
  if (usd === 0) return "$0.00";

  if (usd < 0.01) {
    // Determine decimal places needed to show ~2 significant figures.
    // E.g. 0.0013 → log10 ≈ -2.89 → magnitude = -3 → decimals = max(2, 3+1) = 4
    //      0.000056 → log10 ≈ -4.25 → magnitude = -5 → decimals = max(2, 5+1) = 6
    const magnitude = Math.floor(Math.log10(usd)); // e.g. -3 for 0.0013
    const decimals = Math.max(2, -magnitude + 1);
    return "$" + usd.toFixed(decimals);
  }

  return "$" + usd.toFixed(2);
}
