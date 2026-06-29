import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { SkillImportPreview } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/skills.json";
import { ImportSkillModal } from "./ImportSkillModal";

afterEach(cleanup);

const PREVIEW: SkillImportPreview = {
  name: "Test Quality Reviewer",
  description: "Flag any PR that introduces untested paths",
  type: "rubric",
  body: "# Test Coverage\n\nFlag all untested branches.",
  source: "imported_url",
  dropped_files: ["Makefile", "install.sh"],
  token_estimate: 42,
};

const mockMutateAsync = vi.fn().mockResolvedValue(PREVIEW);
const mockCreateAsync = vi.fn().mockResolvedValue({ id: "sk-imported" });
const mockPush = vi.fn();

vi.mock("@/hooks/skills", () => ({
  useImportSkill: () => ({ mutateAsync: mockMutateAsync, isPending: false }),
  useCreateSkill: () => ({ mutateAsync: mockCreateAsync, isPending: false }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

function renderWithIntl(ui: React.ReactElement) {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
        {ui}
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("ImportSkillModal", () => {
  it("renders the file picker initially", () => {
    renderWithIntl(<ImportSkillModal onClose={() => {}} />);
    expect(screen.getByText("Import skill")).toBeInTheDocument();
    expect(screen.getByLabelText(/Choose a .md or .zip file/i)).toBeInTheDocument();
  });

  it("shows the Cancel button on step 1", () => {
    renderWithIntl(<ImportSkillModal onClose={() => {}} />);
    expect(screen.getByText("Cancel")).toBeInTheDocument();
  });

  it("calls onClose when Cancel is clicked on step 1", () => {
    const onClose = vi.fn();
    renderWithIntl(<ImportSkillModal onClose={onClose} />);
    fireEvent.click(screen.getByText("Cancel"));
    expect(onClose).toHaveBeenCalled();
  });

  it("shows preview after selecting a file", async () => {
    renderWithIntl(<ImportSkillModal onClose={() => {}} />);
    const input = screen.getByLabelText(/Choose a .md or .zip file/i);
    const file = new File(["# Test\nBody"], "test.md", { type: "text/markdown" });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalled();
    });
    await waitFor(() => {
      // Trust warning should appear in step 2
      expect(screen.getByText(/trust warning/i)).toBeInTheDocument();
    });
  });

  it("shows dropped files list in preview step", async () => {
    renderWithIntl(<ImportSkillModal onClose={() => {}} />);
    const input = screen.getByLabelText(/Choose a .md or .zip file/i);
    const file = new File(["body"], "skill.zip", { type: "application/zip" });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText("Makefile")).toBeInTheDocument();
      expect(screen.getByText("install.sh")).toBeInTheDocument();
    });
  });

  it("renders Save skill button in preview step", async () => {
    renderWithIntl(<ImportSkillModal onClose={() => {}} />);
    const input = screen.getByLabelText(/Choose a .md or .zip file/i);
    const file = new File(["# Rule\nBody"], "rule.md", { type: "text/markdown" });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => screen.getByText("Save skill"));
    expect(screen.getByText("Save skill")).toBeInTheDocument();
  });

  it("calls createSkill with enabled:false on Save", async () => {
    renderWithIntl(<ImportSkillModal onClose={() => {}} />);
    const input = screen.getByLabelText(/Choose a .md or .zip file/i);
    const file = new File(["# Rule\nBody"], "rule.md", { type: "text/markdown" });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => screen.getByText("Save skill"));
    fireEvent.click(screen.getByText("Save skill"));

    await waitFor(() => {
      expect(mockCreateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          name: PREVIEW.name,
          body: PREVIEW.body,
          enabled: false,
        }),
      );
    });
  });
});
