/**
 * DiffTab — component tests covering the Smart Diff toggle feature.
 *
 * Three real user flows:
 *   1. Default Smart order → grouped view with Core heading + FindingsBadge
 *   2. Toggling to Original order → flat DiffViewer
 *   3. Large PR (split_suggestion.too_big) → split banner visible
 *
 * Network boundary: all hooks are mocked via vi.mock; no fetch / API / browser.
 * Interaction: fireEvent (userEvent is NOT installed in the client package —
 * importing it silently skips the whole test file; see client/INSIGHTS.md).
 * noUncheckedIndexedAccess: all array element accesses use guards or .map().
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { SmartDiffResponse, PrFile } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";

// ---------------------------------------------------------------------------
// Module mocks — declared before component imports so Vitest hoists them.
// ---------------------------------------------------------------------------

vi.mock("@/hooks/smart-diff", () => ({
  useSmartDiff: vi.fn(),
}));

vi.mock("@/hooks/reviews", () => ({
  usePrComments: vi.fn().mockReturnValue({ data: [] }),
  useCreatePrComment: vi.fn().mockReturnValue({
    isPending: false,
    mutateAsync: vi.fn(),
  }),
}));

vi.mock("@/providers/toast", () => ({
  notify: { error: vi.fn() },
}));

// Mock DiffViewer so tests assert on data-testid instead of needing "shell" i18n.
vi.mock("@/components/diff-viewer", () => ({
  DiffViewer: ({ files }: { files: PrFile[] }) => (
    <div data-testid="original-diff-viewer">
      {files.map((f) => (
        <div key={f.path}>{f.path}</div>
      ))}
    </div>
  ),
}));

// Mock FileCard to avoid pulling in the "shell" i18n namespace. Surfaces the
// finding-marker count so we can assert severity markers are wired through.
vi.mock("@/components/diff-viewer/FileCard", () => ({
  FileCard: ({ file, findingMarkers }: { file: PrFile; findingMarkers?: unknown[] }) => (
    <div data-testid="file-card" data-path={file.path} data-markers={findingMarkers?.length ?? 0}>
      {file.path}
    </div>
  ),
}));

// Component under test — imported AFTER mocks so hoisting applies.
import { DiffTab } from "./DiffTab";
import { useSmartDiff } from "@/hooks/smart-diff";

afterEach(cleanup);

// ---------------------------------------------------------------------------
// Fixtures — realistic domain values
// ---------------------------------------------------------------------------

const PR_ID = "pr-a1b2c3";

/**
 * A PR with core + wiring + boilerplate groups. The core file has 2 flagged
 * finding-lines; wiring and boilerplate have none.
 */
const SMART_DIFF: SmartDiffResponse = {
  groups: [
    {
      role: "core",
      files: [
        {
          path: "src/auth/auth.service.ts",
          additions: 42,
          deletions: 8,
          finding_lines: [15, 23],
          finding_markers: [
            { id: "find-1", severity: "WARNING", start_line: 15, end_line: 15 },
            { id: "find-2", severity: "CRITICAL", start_line: 23, end_line: 23 },
          ],
          pseudocode_summary:
            "Adds JWT refresh-token rotation with configurable expiry TTL",
        },
      ],
    },
    {
      role: "wiring",
      files: [
        {
          path: "src/index.ts",
          additions: 3,
          deletions: 1,
          finding_lines: [],
          finding_markers: [],
          pseudocode_summary: null,
        },
      ],
    },
    {
      role: "boilerplate",
      files: [
        {
          path: "pnpm-lock.yaml",
          additions: 120,
          deletions: 35,
          finding_lines: [],
          finding_markers: [],
          pseudocode_summary: null,
        },
      ],
    },
  ],
  split_suggestion: {
    too_big: false,
    total_lines: 209,
    proposed_splits: [],
  },
};

/**
 * Same PR but large enough to trigger the split banner.
 * noUncheckedIndexedAccess guard: we use the spread operator, not index access.
 */
const LARGE_SMART_DIFF: SmartDiffResponse = {
  ...SMART_DIFF,
  split_suggestion: {
    too_big: true,
    total_lines: 650,
    proposed_splits: [
      { name: "server", files: ["src/auth/auth.service.ts"] },
      { name: "client", files: ["src/index.ts"] },
    ],
  },
};

/** PrFile[] that matches the paths in SMART_DIFF so SmartDiffView can render. */
const PR_FILES: PrFile[] = [
  {
    path: "src/auth/auth.service.ts",
    additions: 42,
    deletions: 8,
    patch: "@@ -1,5 +1,7 @@ export class AuthService {}",
  },
  {
    path: "src/index.ts",
    additions: 3,
    deletions: 1,
    patch: "@@ -1,3 +1,4 @@ import './app';",
  },
  {
    path: "pnpm-lock.yaml",
    additions: 120,
    deletions: 35,
    patch: null,
  },
];

// ---------------------------------------------------------------------------
// Render helper
// ---------------------------------------------------------------------------

function renderTab(files: PrFile[] = PR_FILES) {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
        <DiffTab prId={PR_ID} filesCount={files.length} files={files} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("DiffTab — Smart Diff toggle", () => {
  it("defaults to Smart order: shows Core heading, per-file summary, and wires severity markers to FileCard", () => {
    vi.mocked(useSmartDiff).mockReturnValue({
      data: SMART_DIFF,
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useSmartDiff>);

    renderTab();

    // Core group heading is visible (SmartDiffView renders role labels)
    expect(screen.getByText("Core")).toBeInTheDocument();

    // Wiring heading is also visible (both start expanded)
    expect(screen.getByText("Wiring")).toBeInTheDocument();

    // "What this does" renders under EVERY visible file (core + wiring; the
    // boilerplate group starts collapsed). The core one is the review summary.
    expect(screen.getAllByText("What this does:").length).toBe(2);
    expect(
      screen.getByText(/Adds JWT refresh-token rotation/),
    ).toBeInTheDocument();

    // "N findings" badge on the flagged core file (counts findings, not lines)
    expect(screen.getByRole("button", { name: "2 findings" })).toBeInTheDocument();

    // The core file's 2 severity markers are passed down to FileCard
    const coreCard = screen
      .getAllByTestId("file-card")
      .find((el) => el.getAttribute("data-path") === "src/auth/auth.service.ts");
    expect(coreCard?.getAttribute("data-markers")).toBe("2");

    // The flat DiffViewer must NOT be shown in Smart order
    expect(screen.queryByTestId("original-diff-viewer")).not.toBeInTheDocument();
  });

  it("toggling to Original order replaces the grouped view with the flat DiffViewer", () => {
    vi.mocked(useSmartDiff).mockReturnValue({
      data: SMART_DIFF,
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useSmartDiff>);

    renderTab();

    // Default: Smart order — Core heading visible, no original-diff-viewer
    expect(screen.getByText("Core")).toBeInTheDocument();
    expect(screen.queryByTestId("original-diff-viewer")).not.toBeInTheDocument();

    // Click the "Original order" toggle button
    fireEvent.click(screen.getByRole("button", { name: "Original order" }));

    // After toggle: flat DiffViewer renders; grouped headings, summary, and the
    // findings badge all disappear
    expect(screen.getByTestId("original-diff-viewer")).toBeInTheDocument();
    expect(screen.queryByText("Core")).not.toBeInTheDocument();
    expect(screen.queryByText("What this does:")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "2 findings" })).not.toBeInTheDocument();
  });

  it("shows the split banner when split_suggestion.too_big is true", () => {
    vi.mocked(useSmartDiff).mockReturnValue({
      data: LARGE_SMART_DIFF,
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useSmartDiff>);

    renderTab();

    // Banner title contains the line count
    expect(screen.getByText(/This PR is large/)).toBeInTheDocument();
    expect(screen.getByText(/650/)).toBeInTheDocument();

    // Banner body copy
    expect(
      screen.getByText(/Consider splitting it into smaller/),
    ).toBeInTheDocument();

    // Proposed split names are listed
    expect(screen.getByText("server")).toBeInTheDocument();
    expect(screen.getByText("client")).toBeInTheDocument();
  });
});
