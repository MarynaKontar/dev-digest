/**
 * IntentCard — test coverage for all four states exposed by the component:
 *   populated | empty (null) | loading | error
 * plus the recompute flow (button click → mutate → card reflects refetched data).
 *
 * Network boundary: hooks are mocked via vi.mock so no real fetch / API /
 * QueryClient machinery fires.  This matches the repo convention used by
 * sibling tests (FindingCard, SkillCard, AgentCard, etc.).
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PrIntentRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";

// Mock the intent hooks before the component import so no real network calls
// are made.  Per-test state is set via vi.mocked().mockReturnValue().
vi.mock("@/hooks/intent", () => ({
  usePrIntent: vi.fn(),
  useRecomputeIntent: vi.fn(),
}));

import { IntentCard } from "./IntentCard";
import { usePrIntent, useRecomputeIntent } from "@/hooks/intent";

afterEach(cleanup);

// ---------------------------------------------------------------------------
// Fixtures — realistic domain values; no "id: 1" / "name: test" placeholder
// ---------------------------------------------------------------------------

const PR_ID = "pr-1108";

const INTENT: PrIntentRecord = {
  pr_id: PR_ID,
  intent:
    "Introduce rate-limiting middleware to protect the public API from abuse.",
  in_scope: [
    "Apply sliding-window rate limiting to all /api/* routes",
    "Return HTTP 429 with Retry-After header on threshold breach",
  ],
  out_of_scope: [
    "Authentication or authorisation overhaul",
    "Database-level throttling or usage quotas",
  ],
  risk_areas: [
    "Threshold values are env-driven — verify staging limits match production before deploying",
  ],
};

// ---------------------------------------------------------------------------
// Render helper (shared by most tests)
// ---------------------------------------------------------------------------

function renderCard(prId: string = PR_ID) {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
        <IntentCard prId={prId} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("IntentCard", () => {
  it("populated — renders summary quote, In Scope, Out of Scope, and Risk Areas", () => {
    vi.mocked(usePrIntent).mockReturnValue({
      data: INTENT,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as any);
    vi.mocked(useRecomputeIntent).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as any);

    renderCard();

    // Summary quote (intent field rendered as a pull-quote paragraph)
    expect(
      screen.getByText(
        "Introduce rate-limiting middleware to protect the public API from abuse.",
      ),
    ).toBeInTheDocument();

    // Section headings — one per required section
    expect(screen.getByText("In Scope")).toBeInTheDocument();
    expect(screen.getByText("Out of Scope")).toBeInTheDocument();
    expect(screen.getByText("Risk Areas")).toBeInTheDocument();

    // Representative item from each scope list
    expect(
      screen.getByText("Apply sliding-window rate limiting to all /api/* routes"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Authentication or authorisation overhaul"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Threshold values are env-driven — verify staging limits match production before deploying",
      ),
    ).toBeInTheDocument();
  });

  it("populated — Risk Areas section is omitted when risk_areas is empty", () => {
    vi.mocked(usePrIntent).mockReturnValue({
      data: { ...INTENT, risk_areas: [] },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as any);
    vi.mocked(useRecomputeIntent).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as any);

    renderCard();

    // Scope sections still appear; risk areas block is conditionally rendered
    expect(screen.getByText("In Scope")).toBeInTheDocument();
    expect(screen.getByText("Out of Scope")).toBeInTheDocument();
    expect(screen.queryByText("Risk Areas")).not.toBeInTheDocument();
  });

  it("empty — shows 'not yet computed' state when GET resolves null", () => {
    vi.mocked(usePrIntent).mockReturnValue({
      data: null,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as any);
    vi.mocked(useRecomputeIntent).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as any);

    renderCard();

    // Empty-state copy (U+2019 apostrophe matches the source JSON)
    expect(screen.getByText("Intent not yet computed")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Click Recompute to classify this PR’s intent.",
      ),
    ).toBeInTheDocument();

    // No populated-section headings visible
    expect(screen.queryByText("In Scope")).not.toBeInTheDocument();
    expect(screen.queryByText("Out of Scope")).not.toBeInTheDocument();
  });

  it("loading — renders without section content while the query is in-flight", () => {
    vi.mocked(usePrIntent).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      refetch: vi.fn(),
    } as any);
    vi.mocked(useRecomputeIntent).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as any);

    renderCard();

    // Neither populated sections nor the empty-state copy should appear while
    // the skeleton placeholders are shown.
    expect(screen.queryByText("In Scope")).not.toBeInTheDocument();
    expect(screen.queryByText("Out of Scope")).not.toBeInTheDocument();
    expect(screen.queryByText("Intent not yet computed")).not.toBeInTheDocument();
  });

  it("error — renders the error alert when GET fails", () => {
    vi.mocked(usePrIntent).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: vi.fn(),
    } as any);
    vi.mocked(useRecomputeIntent).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as any);

    renderCard();

    // ErrorState renders with role="alert"; assert via role then text
    expect(screen.getByRole("alert")).toBeInTheDocument();
    // U+2019 apostrophe in "Couldn't"
    expect(
      screen.getByText("Couldn’t load intent"),
    ).toBeInTheDocument();

    // Populated and empty-state content must not appear alongside the error
    expect(screen.queryByText("In Scope")).not.toBeInTheDocument();
    expect(screen.queryByText("Intent not yet computed")).not.toBeInTheDocument();
  });

  it("recompute — clicking the button fires mutate() for the correct PR and the card reflects refetched data", () => {
    const mockMutate = vi.fn();

    vi.mocked(usePrIntent).mockReturnValue({
      data: null,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as any);
    vi.mocked(useRecomputeIntent).mockReturnValue({
      mutate: mockMutate,
      isPending: false,
    } as any);

    const qc = new QueryClient();
    const { rerender } = render(
      <QueryClientProvider client={qc}>
        <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
          <IntentCard prId={PR_ID} />
        </NextIntlClientProvider>
      </QueryClientProvider>,
    );

    // The component passes prId to useRecomputeIntent, which internally
    // targets POST /pulls/${prId}/intent/recompute.  Asserting the hook was
    // called with the right id verifies the URL mapping is wired correctly.
    expect(vi.mocked(useRecomputeIntent)).toHaveBeenCalledWith(PR_ID);

    // Empty state is shown before the first recompute
    expect(screen.getByText("Intent not yet computed")).toBeInTheDocument();

    // Click the icon-only button (accessible via its aria-label)
    fireEvent.click(
      screen.getByRole("button", { name: "Recompute PR intent" }),
    );

    // mutate() fired — the POST to recompute was triggered
    expect(mockMutate).toHaveBeenCalledTimes(1);

    // Simulate successful query invalidation + refetch: update the mock to
    // return populated data and force a re-render (mirrors what TanStack Query
    // does automatically when the query is invalidated on mutation success).
    vi.mocked(usePrIntent).mockReturnValue({
      data: INTENT,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as any);

    rerender(
      <QueryClientProvider client={qc}>
        <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
          <IntentCard prId={PR_ID} />
        </NextIntlClientProvider>
      </QueryClientProvider>,
    );

    // Card now shows the computed intent returned by the refetch
    expect(
      screen.getByText(
        "Introduce rate-limiting middleware to protect the public API from abuse.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("In Scope")).toBeInTheDocument();
  });
});
