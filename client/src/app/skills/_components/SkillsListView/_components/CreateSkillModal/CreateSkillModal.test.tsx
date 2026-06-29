import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import messages from "../../../../../../../messages/en/skills.json";
import { CreateSkillModal } from "./CreateSkillModal";

afterEach(cleanup);

const mockMutateAsync = vi.fn().mockResolvedValue({ id: "sk-new", name: "New Skill" });
vi.mock("@/hooks/skills", () => ({
  useCreateSkill: () => ({
    mutateAsync: mockMutateAsync,
    isPending: false,
  }),
}));

// next/navigation mock
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
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

describe("CreateSkillModal", () => {
  it("renders title and form fields", () => {
    renderWithIntl(<CreateSkillModal onClose={() => {}} />);
    // "Create skill" appears in both the modal title and the submit button
    expect(screen.getAllByText("Create skill").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText(/Description/)).toBeInTheDocument();
    expect(screen.getByText("Type")).toBeInTheDocument();
    expect(screen.getByText("Body (Markdown)")).toBeInTheDocument();
  });

  it("renders Create skill submit button", () => {
    renderWithIntl(<CreateSkillModal onClose={() => {}} />);
    const buttons = screen.getAllByRole("button");
    const submitBtn = buttons.find((b) => b.textContent?.includes("Create skill"));
    expect(submitBtn).toBeDefined();
  });

  it("calls onClose when Cancel is clicked", () => {
    const onClose = vi.fn();
    renderWithIntl(<CreateSkillModal onClose={onClose} />);
    fireEvent.click(screen.getByText("Cancel"));
    expect(onClose).toHaveBeenCalled();
  });
});
