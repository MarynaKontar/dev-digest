import { describe, it, expect } from "vitest";
import { formatCost } from "./cost";

describe("formatCost", () => {
  it("null → —", () => {
    expect(formatCost(null)).toBe("—");
  });

  it("undefined → —", () => {
    expect(formatCost(undefined)).toBe("—");
  });

  it("0 → $0.00 (genuine free run, distinct from null)", () => {
    expect(formatCost(0)).toBe("$0.00");
  });

  it("sub-cent value 0.0013 → $0.0013 (4 decimals, ~2 sig figs)", () => {
    expect(formatCost(0.0013)).toBe("$0.0013");
  });

  it("dollar+ value → 2 decimals", () => {
    expect(formatCost(1.5)).toBe("$1.50");
  });

  it("6-cent value → $0.06 (2 decimals)", () => {
    expect(formatCost(0.06)).toBe("$0.06");
  });
});
