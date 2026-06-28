import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Skill } from "@devdigest/shared";
import messages from "../../../../../messages/en/skills.json";
import { SkillCard } from "./SkillCard";

afterEach(cleanup);

// Mock the delete hook so card renders without a network layer.
vi.mock("@/hooks/skills", () => ({
  useDeleteSkill: () => ({ mutate: vi.fn(), isPending: false }),
}));

const SKILL: Skill = {
  id: "sk1",
  name: "Security Gate",
  description: "Flags secrets and injection risks",
  type: "security",
  source: "manual",
  body: "# Security\nNo secrets in code.",
  enabled: true,
  version: 1,
  evidence_files: null,
};

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

describe("SkillCard", () => {
  it("renders skill name and type badge", () => {
    renderWithIntl(<SkillCard skill={SKILL} />);
    expect(screen.getByText("Security Gate")).toBeInTheDocument();
    expect(screen.getByText("security")).toBeInTheDocument();
    expect(screen.getByText("manual")).toBeInTheDocument();
  });

  it("renders the description", () => {
    renderWithIntl(<SkillCard skill={SKILL} />);
    expect(screen.getByText("Flags secrets and injection risks")).toBeInTheDocument();
  });

  it("falls back to placeholder when description is empty", () => {
    renderWithIntl(<SkillCard skill={{ ...SKILL, description: "" }} />);
    expect(screen.getByText("No description")).toBeInTheDocument();
  });

  it("calls onToggle when the toggle changes", () => {
    const onToggle = vi.fn();
    renderWithIntl(<SkillCard skill={SKILL} onToggle={onToggle} />);
    // The Toggle is rendered; click the underlying input if it exists
    const toggleInput = document.querySelector("input[type='checkbox']") as HTMLInputElement | null;
    if (toggleInput) {
      fireEvent.click(toggleInput);
      expect(onToggle).toHaveBeenCalledWith(false);
    }
  });

  it("renders disabled opacity when skill.enabled is false", () => {
    const { container } = renderWithIntl(<SkillCard skill={{ ...SKILL, enabled: false }} />);
    const card = container.firstChild as HTMLElement;
    expect(card.style.opacity).toBe("0.6");
  });

  it("renders stats line when stats prop is provided", () => {
    renderWithIntl(
      <SkillCard
        skill={SKILL}
        stats={{
          used_by: 3,
          agents: [],
          pull_rate: 0.75,
          accept_rate: 0.9,
          findings_30d: 42,
          by_category: [],
        }}
      />,
    );
    expect(screen.getByText(/3 agents/)).toBeInTheDocument();
    expect(screen.getByText(/75% pull/)).toBeInTheDocument();
  });
});
