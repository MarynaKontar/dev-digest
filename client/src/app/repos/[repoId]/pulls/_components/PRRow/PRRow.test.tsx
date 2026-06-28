/**
 * PRRow — RTL tests for the Findings column and inline panel.
 *
 * Counters render only for count > 0; clicking a counter does NOT navigate;
 * second click collapses; any badge click toggles the same unified panel;
 * opening another row closes the first (tested via lifted state in a wrapper).
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrMeta } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/prReview.json";
import { PRRow } from "./PRRow";
import React from "react";

afterEach(cleanup);

// ---- Mocks ----
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

// Mock the reviews hook so the panel never actually fetches
vi.mock("@/hooks/reviews", () => ({
  usePrReviews: () => ({ data: [], isLoading: false }),
}));

// ---- Helpers ----
function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

const BASE_PR: PrMeta = {
  id: "pr-1",
  number: 42,
  title: "Add rate limiting",
  author: "alice",
  branch: "feat/rl",
  base: "main",
  head_sha: "abc123",
  additions: 10,
  deletions: 5,
  files_count: 3,
  status: "needs_review",
  opened_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-02T00:00:00Z",
  score: null,
  cost_usd: null,
  findings_by_severity: null,
};

/** Wrapper that simulates the lifted expansion state from page.tsx. */
function RowHarness({ pr, repoId = "repo-1" }: { pr: PrMeta; repoId?: string }) {
  const [expandedPrId, setExpandedPrId] = React.useState<string | null>(null);
  const handleToggle = (prId: string) =>
    setExpandedPrId((prev) => (prev === prId ? null : prId));
  return (
    <PRRow
      pr={pr}
      repoId={repoId}
      isExpanded={expandedPrId === pr.id}
      onToggle={handleToggle}
    />
  );
}

/** Wrapper simulating two rows for cross-row panel exclusion. */
function TwoRowsHarness({ pr1, pr2 }: { pr1: PrMeta; pr2: PrMeta }) {
  const [expandedPrId, setExpandedPrId] = React.useState<string | null>(null);
  const handleToggle = (prId: string) =>
    setExpandedPrId((prev) => (prev === prId ? null : prId));
  return (
    <>
      <PRRow pr={pr1} repoId="repo-1" isExpanded={expandedPrId === pr1.id} onToggle={handleToggle} />
      <PRRow pr={pr2} repoId="repo-1" isExpanded={expandedPrId === pr2.id} onToggle={handleToggle} />
    </>
  );
}

// ---- Tests ----

describe("PRRow – Findings column", () => {
  it("renders no counters when findings_by_severity is null (unreviewed)", () => {
    renderWithIntl(<RowHarness pr={BASE_PR} />);
    expect(screen.queryByRole("button", { name: /CRITICAL findings/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /WARNING findings/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /SUGGESTION findings/i })).toBeNull();
  });

  it("renders no counter for a severity with count 0", () => {
    const pr: PrMeta = {
      ...BASE_PR,
      findings_by_severity: { CRITICAL: 2, WARNING: 0, SUGGESTION: 1 },
    };
    renderWithIntl(<RowHarness pr={pr} />);
    expect(screen.getByRole("button", { name: /CRITICAL findings: 2/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /SUGGESTION findings: 1/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /WARNING findings/i })).toBeNull();
  });

  it("clicking a counter does NOT navigate (stopPropagation)", () => {
    const pr: PrMeta = {
      ...BASE_PR,
      findings_by_severity: { CRITICAL: 3, WARNING: 2, SUGGESTION: 0 },
    };
    renderWithIntl(<RowHarness pr={pr} />);
    const btn = screen.getByRole("button", { name: /CRITICAL findings: 3/i });
    fireEvent.click(btn);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("first click opens the panel; second click collapses it", () => {
    const pr: PrMeta = {
      ...BASE_PR,
      findings_by_severity: { CRITICAL: 2, WARNING: 0, SUGGESTION: 0 },
    };
    renderWithIntl(<RowHarness pr={pr} />);
    const btn = screen.getByRole("button", { name: /CRITICAL findings: 2/i });

    expect(screen.queryByText(/no open findings/i)).toBeNull();

    fireEvent.click(btn);
    expect(screen.getByText(/no open findings/i)).toBeInTheDocument();

    fireEvent.click(btn);
    expect(screen.queryByText(/no open findings/i)).toBeNull();
  });

  it("all severity badges share the same panel toggle (any badge opens/closes it)", () => {
    const pr: PrMeta = {
      ...BASE_PR,
      findings_by_severity: { CRITICAL: 1, WARNING: 1, SUGGESTION: 0 },
    };
    renderWithIntl(<RowHarness pr={pr} />);

    const critBtn = screen.getByRole("button", { name: /CRITICAL findings: 1/i });
    const warnBtn = screen.getByRole("button", { name: /WARNING findings: 1/i });

    // Open with CRITICAL
    fireEvent.click(critBtn);
    expect(critBtn).toHaveAttribute("aria-pressed", "true");
    expect(warnBtn).toHaveAttribute("aria-pressed", "true");

    // Click WARNING: closes the same panel
    fireEvent.click(warnBtn);
    expect(critBtn).toHaveAttribute("aria-pressed", "false");
    expect(warnBtn).toHaveAttribute("aria-pressed", "false");
  });

  it("opening another row's counter closes the first", () => {
    const pr1: PrMeta = {
      ...BASE_PR,
      id: "pr-1",
      number: 1,
      title: "PR One",
      findings_by_severity: { CRITICAL: 2, WARNING: 0, SUGGESTION: 0 },
    };
    const pr2: PrMeta = {
      ...BASE_PR,
      id: "pr-2",
      number: 2,
      title: "PR Two",
      findings_by_severity: { CRITICAL: 1, WARNING: 0, SUGGESTION: 0 },
    };

    renderWithIntl(
      <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
        <TwoRowsHarness pr1={pr1} pr2={pr2} />
      </NextIntlClientProvider>,
    );

    const btn1 = screen.getByRole("button", { name: /CRITICAL findings: 2/i });
    const btn2 = screen.getByRole("button", { name: /CRITICAL findings: 1/i });

    fireEvent.click(btn1);
    expect(btn1).toHaveAttribute("aria-pressed", "true");
    expect(btn2).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(btn2);
    expect(btn2).toHaveAttribute("aria-pressed", "true");
    expect(btn1).toHaveAttribute("aria-pressed", "false");
  });
});
