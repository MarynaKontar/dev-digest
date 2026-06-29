import type { IconName } from "@devdigest/ui";

export interface SkillEditorTab {
  key: string;
  labelKey: string;
  icon: IconName;
}

export const SKILL_TABS: readonly SkillEditorTab[] = [
  { key: "config", labelKey: "editor.tabs.config", icon: "Settings" },
  { key: "preview", labelKey: "editor.tabs.preview", icon: "Eye" },
  { key: "stats", labelKey: "editor.tabs.stats", icon: "BarChart" },
  { key: "versions", labelKey: "editor.tabs.versions", icon: "History" },
];
