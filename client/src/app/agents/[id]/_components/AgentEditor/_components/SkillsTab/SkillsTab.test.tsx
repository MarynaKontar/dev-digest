import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent } from "@devdigest/shared";
import agentMessages from "../../../../../../../../messages/en/agents.json";
import { SkillsTab } from "./SkillsTab";

afterEach(cleanup);

const SKILLS = [
  { id: "sk1", name: "Security Gate", type: "security", description: "", source: "manual", body: "", enabled: true, version: 1, evidence_files: null },
  { id: "sk2", name: "Test Coverage", type: "rubric", description: "", source: "manual", body: "", enabled: true, version: 1, evidence_files: null },
  { id: "sk3", name: "API Contract", type: "convention", description: "", source: "manual", body: "", enabled: true, version: 1, evidence_files: null },
];

const LINKS = [
  { agent_id: "ag1", skill_id: "sk1", order: 0, enabled: true },
  { agent_id: "ag1", skill_id: "sk2", order: 1, enabled: false },
];

const mockMutate = vi.fn();

vi.mock("@/hooks/skills", () => ({
  useSkills: () => ({ data: SKILLS, isLoading: false, isError: false, refetch: vi.fn() }),
  useAgentSkills: () => ({ data: LINKS, isLoading: false, isError: false, refetch: vi.fn() }),
  useSetAgentSkills: () => ({ mutate: mockMutate, isPending: false }),
}));

vi.mock("@/providers/toast", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));

const AGENT: Agent = {
  id: "ag1",
  name: "Security Reviewer",
  description: "Flags secrets",
  provider: "openai",
  model: "gpt-4.1",
  system_prompt: "Review code.",
  output_schema: null,
  strategy: "single-pass",
  ci_fail_on: "critical",
  repo_intel: true,
  enabled: true,
  version: 1,
};

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ agents: agentMessages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("SkillsTab", () => {
  it("renders all skills from the library", () => {
    renderWithIntl(<SkillsTab agent={AGENT} />);
    expect(screen.getByText("Security Gate")).toBeInTheDocument();
    expect(screen.getByText("Test Coverage")).toBeInTheDocument();
    expect(screen.getByText("API Contract")).toBeInTheDocument();
  });

  it("shows enabled count header", () => {
    renderWithIntl(<SkillsTab agent={AGENT} />);
    // "1 of 3 enabled" (sk1 is enabled, sk2 disabled, sk3 not linked so disabled)
    expect(screen.getByText(/of \d+ enabled/)).toBeInTheDocument();
  });

  it("renders checkboxes with correct checked state", () => {
    renderWithIntl(<SkillsTab agent={AGENT} />);
    const checkboxes = screen.getAllByRole("checkbox");
    // sk1 is enabled (checked), sk2 and sk3 are not
    const checkedCount = checkboxes.filter((cb) => (cb as HTMLInputElement).checked).length;
    expect(checkedCount).toBe(1);
  });

  it("marks dirty and shows Save button when a checkbox is toggled", () => {
    renderWithIntl(<SkillsTab agent={AGENT} />);
    const checkboxes = screen.getAllByRole("checkbox");
    const unchecked = checkboxes.find((cb) => !(cb as HTMLInputElement).checked);
    expect(unchecked).toBeDefined();
    fireEvent.click(unchecked!);
    expect(screen.getByText("Save")).toBeInTheDocument();
  });

  it("filters skills by search input", () => {
    renderWithIntl(<SkillsTab agent={AGENT} />);
    const input = screen.getByPlaceholderText(/Filter skills/i);
    fireEvent.change(input, { target: { value: "Security" } });
    expect(screen.getByText("Security Gate")).toBeInTheDocument();
    expect(screen.queryByText("Test Coverage")).not.toBeInTheDocument();
  });

  it("calls useSetAgentSkills when Save is clicked", () => {
    renderWithIntl(<SkillsTab agent={AGENT} />);
    // Toggle a skill to make dirty
    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[0]!);
    const saveBtn = screen.getByText("Save");
    fireEvent.click(saveBtn);
    expect(mockMutate).toHaveBeenCalledWith(
      expect.objectContaining({ agentId: "ag1" }),
      expect.any(Object),
    );
  });
});
