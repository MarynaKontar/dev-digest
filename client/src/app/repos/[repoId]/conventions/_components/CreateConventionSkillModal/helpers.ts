import type { ConventionCandidate } from "@devdigest/shared";

/** Derive a markdown heading slug from a rule text.
 *  "Always use const for declarations" → "always-use-const-for-declarations" */
export function slugRule(rule: string): string {
  return rule
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

/**
 * Merge selected candidates into the skill-body markdown shape defined in §5:
 *
 * # {repo}-conventions
 * House conventions for `{repo}`. Flag changes that violate any rule below …
 *
 * ## {slug(rule)}
 * {rule}
 *
 * Detected in `{evidence_path}:{evidence_line}`:
 * ```
 * {evidence_snippet}
 * ```
 */
export function mergeCandidatesToMarkdown(
  repoName: string,
  candidates: ConventionCandidate[]
): string {
  const header = [
    `# ${repoName}-conventions`,
    "",
    `House conventions for \`${repoName}\`. Flag changes that violate any rule below and`,
    "cite the offending `file:line`.",
    "",
  ].join("\n");

  const sections = candidates
    .map((c) =>
      [
        `## ${slugRule(c.rule)}`,
        c.rule,
        "",
        `Detected in \`${c.evidence_path}:${c.evidence_line}\`:`,
        "```",
        c.evidence_snippet,
        "```",
        "",
      ].join("\n")
    )
    .join("\n");

  return header + sections;
}
