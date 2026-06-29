import { PER_FILE_CHAR_CAP } from './constants.js';

/**
 * Pure helpers for the conventions module — evidence verification, URL building,
 * rule slugging, skill-body merge, and user-message construction.
 * No DB or network calls — fully testable in isolation.
 */

// ---- Evidence verification --------------------------------------------------

/**
 * Verify that the first non-empty line of `snippet` literally exists in
 * `fileContent`. Returns its 1-based line index, or null if not found.
 *
 * Algorithm:
 *  1. Take the first non-empty trimmed line of `snippet` as the target.
 *  2. For each line of `fileContent`, check if trimming that line yields a
 *     string that contains the target as a substring.
 *  3. Return the 1-based index of the first match, or null.
 *
 * Used as the evidence grounding gate: candidates without locatable evidence
 * are dropped before reaching the UI.
 */
export function verifyEvidence(
  fileContent: string,
  snippet: string,
): { line: number } | null {
  const snippetLines = snippet.split('\n');
  const target = snippetLines.find((l) => l.trim() !== '')?.trim();
  if (!target) return null;

  const fileLines = fileContent.split('\n');
  for (let i = 0; i < fileLines.length; i++) {
    if (fileLines[i]!.trim().includes(target)) {
      return { line: i + 1 };
    }
  }
  return null;
}

// ---- GitHub deep-link -------------------------------------------------------

/**
 * Build the GitHub blob URL pointing to the evidence line.
 * Format: `https://github.com/{fullName}/blob/{defaultBranch}/{path}#L{line}`
 */
export function buildEvidenceUrl(
  fullName: string,
  defaultBranch: string,
  path: string,
  line: number,
): string {
  return `https://github.com/${fullName}/blob/${defaultBranch}/${path}#L${line}`;
}

// ---- Rule slug --------------------------------------------------------------

/**
 * Convert a rule string to a kebab-case slug for use as a `##` heading in the
 * merged skill body.
 *
 * Example: "Always use TypeScript strict mode" → "always-use-typescript-strict-mode"
 */
export function slugRule(rule: string): string {
  return rule
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// ---- Skill body merge -------------------------------------------------------

/**
 * Produce the merged skill-body markdown for a set of accepted candidates.
 * Output shape (§5 of the spec):
 *
 * ```
 * # {repoName}-conventions
 *
 * House conventions for `{repoName}`. Flag changes that violate any rule below and
 * cite the offending `file:line`.
 *
 * ## {slugRule(rule)}
 * {rule}
 *
 * Detected in `{evidence_path}:{evidence_line}`:
 * ```
 * {evidence_snippet}
 * ```
 * ```
 *
 * The body is fully user-editable before save; this is the seeded default.
 */
export function mergeCandidatesToMarkdown(
  repoName: string,
  candidates: {
    rule: string;
    evidence_path: string;
    evidence_line: number;
    evidence_snippet: string;
  }[],
): string {
  const sections = candidates
    .map(
      (c) =>
        `## ${slugRule(c.rule)}\n${c.rule}\n\nDetected in \`${c.evidence_path}:${c.evidence_line}\`:\n\`\`\`\n${c.evidence_snippet}\n\`\`\``,
    )
    .join('\n\n');

  const header = `# ${repoName}-conventions\n\nHouse conventions for \`${repoName}\`. Flag changes that violate any rule below and\ncite the offending \`file:line\`.`;

  if (candidates.length === 0) return header;
  return `${header}\n\n${sections}`;
}

// ---- User message construction ----------------------------------------------

/**
 * Build the LLM user message for convention extraction (§3.6 of the spec).
 *
 * Each file is rendered as:
 * ```
 * ### {path}
 * ```
 * {content (truncated to perFileCharCap)}
 * ```
 * ```
 *
 * The `perFileCharCap` parameter defaults to `PER_FILE_CHAR_CAP` from constants
 * and is exposed as a parameter for unit-test control.
 */
export function buildUserMessage(
  repoName: string,
  files: { path: string; content: string }[],
  perFileCharCap: number = PER_FILE_CHAR_CAP,
): string {
  const fileContents = files
    .map(({ path, content }) => {
      const truncated =
        content.length > perFileCharCap ? content.slice(0, perFileCharCap) : content;
      return `### ${path}\n\`\`\`\n${truncated}\n\`\`\``;
    })
    .join('\n\n');

  return (
    `Repository: ${repoName}\n` +
    `Analyze these files and extract coding conventions:\n` +
    `${fileContents}\n` +
    `Return JSON with candidates array: rule (imperative form), evidence_path\n` +
    `(relative path), evidence_snippet (2-5 lines of exact code), confidence\n` +
    `(0.0-1.0). Only include conventions with confidence > 0.6.`
  );
}
