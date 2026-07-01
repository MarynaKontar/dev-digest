/**
 * extract-references.ts — pure PR-body parser.
 *
 * Parses a PR body string into an ordered list of SpecReference objects.
 * No I/O; entirely deterministic. Classification:
 *
 *   inline       — fenced code block tagged plan/spec, or a named section heading
 *   git-file     — relative path to an in-repo file (e.g. docs/plans/x.md)
 *   github-blob  — github.com/<org>/<repo>/blob/<sha>/path URL (may be this repo)
 *   github-issue — full https://github.com/<org>/<repo>/issues/<N> URL, or #N ref
 *   github-pr    — full https://github.com/<org>/<repo>/pull/<N> URL
 *   external     — any other http/https URL
 *
 * Ordering follows the plan's source precedence:
 *   inline/git-file blocks first (highest authority), then GitHub URLs, then external.
 *
 * Duplicates (same ref string) are removed, keeping the first occurrence.
 */

import type { RepoRef } from '@devdigest/shared';
import type { SpecReference, SpecRefKind } from './index.js';

// ---------- Patterns ----------

/** Fenced code blocks whose language tag indicates a plan or spec. */
const FENCED_SPEC_RE = /```(plan|spec|specification|markdown)\n([\s\S]*?)```/gi;

/**
 * Named section headings (## Plan, ## Spec, ## Implementation, etc.).
 * The section body runs to the next same-or-higher-level heading or end of string.
 */
const SPEC_HEADING_RE =
  /^(#{1,3})\s+(plan|spec(?:ification)?|implementation\s+plan|technical\s+(?:spec|design|plan))\s*$/im;

/** Markdown link with a relative (in-repo) path: [text](docs/plans/x.md). */
const MARKDOWN_LINK_RE = /\[([^\]]*)\]\(([^)]+)\)/g;

/**
 * Bare in-repo file paths that look like spec/plan documents.
 * Matches paths with at least one slash and a common doc extension.
 * Does NOT match http/https URLs (those are handled separately).
 */
const BARE_FILE_PATH_RE =
  /(?<![(\[/])(?:docs?|specs?|plans?|design|rfcs?|adr)\/[^\s<>"'`)\]]{2,}\.(?:md|txt|rst|adoc)/gi;

/** Full GitHub URLs (blob, issues, pull). */
const GITHUB_URL_RE =
  /https?:\/\/github\.com\/([^/\s]+)\/([^/\s]+)\/(blob|issues|pull)\/([^/\s)>"\]]+(?:\/[^\s)>"\]]+)*)/g;

/** Shorthand issue references: closes/fixes/resolves #N (or bare #N). */
const ISSUE_SHORTHAND_RE = /(?:closes?|fixes?|resolves?)?\s*#(\d+)/gi;

/** Any http/https URL (broad catch-all for non-GitHub external URLs). */
const EXTERNAL_URL_RE = /https?:\/\/(?!github\.com)[^\s<>"'`)\]]+/gi;

// ---------- Helpers ----------

const IN_REPO_EXTENSIONS = new Set(['md', 'txt', 'rst', 'adoc']);

function isInRepoPath(path: string): boolean {
  if (path.startsWith('http://') || path.startsWith('https://')) return false;
  if (path.startsWith('#') || path.startsWith('mailto:')) return false;
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  return IN_REPO_EXTENSIONS.has(ext);
}

function dedupeRefs(refs: SpecReference[]): SpecReference[] {
  const seen = new Set<string>();
  return refs.filter((r) => {
    const key = `${r.kind}:${r.ref}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function extractSectionText(body: string, headingMatch: RegExpMatchArray): string {
  const level = headingMatch[1]!.length; // # = 1, ## = 2, ### = 3
  const start = (headingMatch.index ?? 0) + headingMatch[0].length;
  // The section ends at the next heading of the same or lesser depth, or end of string.
  const restOfBody = body.slice(start);
  const nextHeadingRe = new RegExp(`^#{1,${level}}\\s`, 'm');
  const nextMatch = nextHeadingRe.exec(restOfBody);
  const end = nextMatch?.index ?? restOfBody.length;
  return restOfBody.slice(0, end).trim();
}

function classifyGitHubUrl(
  org: string,
  repo: string,
  segment: string,
  rest: string,
  fullUrl: string,
): SpecReference {
  const host = 'github.com';
  if (segment === 'blob') {
    return { kind: 'github-blob', ref: fullUrl, host };
  }
  if (segment === 'issues') {
    return { kind: 'github-issue', ref: fullUrl, host };
  }
  if (segment === 'pull') {
    return { kind: 'github-pr', ref: fullUrl, host };
  }
  // Fallback: treat as external
  return { kind: 'external', ref: fullUrl, host };
}

// ---------- Main export ----------

/**
 * Extracts spec/plan references from a PR body.
 *
 * @param prBody  The raw PR description text.
 * @param repoRef The current repository (used to resolve `#N` issue refs).
 * @returns       Ordered, deduplicated SpecReference list.
 */
export function extractReferences(prBody: string, repoRef: RepoRef): SpecReference[] {
  const inline: SpecReference[] = [];
  const gitFiles: SpecReference[] = [];
  const gitHubRefs: SpecReference[] = [];
  const external: SpecReference[] = [];

  // 1. Fenced code blocks tagged as plan/spec.
  let m: RegExpExecArray | null;
  FENCED_SPEC_RE.lastIndex = 0;
  while ((m = FENCED_SPEC_RE.exec(prBody)) !== null) {
    const text = m[2]?.trim() ?? '';
    if (text.length > 0) {
      inline.push({ kind: 'inline', ref: text });
    }
  }

  // 2. Named section headings (## Plan, ## Spec, etc.).
  const headingMatch = SPEC_HEADING_RE.exec(prBody);
  if (headingMatch) {
    const sectionText = extractSectionText(prBody, headingMatch);
    if (sectionText.length > 0) {
      inline.push({ kind: 'inline', ref: sectionText });
    }
  }

  // 3. Markdown links — pick up in-repo file references.
  //    Also collect GitHub and external URLs embedded in link targets.
  MARKDOWN_LINK_RE.lastIndex = 0;
  while ((m = MARKDOWN_LINK_RE.exec(prBody)) !== null) {
    const href = m[2]?.trim() ?? '';
    if (isInRepoPath(href)) {
      gitFiles.push({ kind: 'git-file', ref: href });
    }
    // GitHub and external URLs in markdown links are caught by the URL passes below.
  }

  // 4. Bare in-repo file paths.
  BARE_FILE_PATH_RE.lastIndex = 0;
  while ((m = BARE_FILE_PATH_RE.exec(prBody)) !== null) {
    const path = m[0].trim();
    gitFiles.push({ kind: 'git-file', ref: path });
  }

  // 5. GitHub URLs (blob, issues, pull).
  GITHUB_URL_RE.lastIndex = 0;
  while ((m = GITHUB_URL_RE.exec(prBody)) !== null) {
    const org = m[1] ?? '';
    const repo = m[2] ?? '';
    const segment = m[3] ?? '';
    const rest = m[4] ?? '';
    const fullUrl = m[0];
    gitHubRefs.push(classifyGitHubUrl(org, repo, segment, rest, fullUrl));
  }

  // 6. Shorthand issue refs (#N, closes #N, etc.) → resolve to this repo.
  ISSUE_SHORTHAND_RE.lastIndex = 0;
  while ((m = ISSUE_SHORTHAND_RE.exec(prBody)) !== null) {
    const n = m[1];
    if (n) {
      const url = `https://github.com/${repoRef.owner}/${repoRef.name}/issues/${n}`;
      gitHubRefs.push({ kind: 'github-issue', ref: url, host: 'github.com' });
    }
  }

  // 7. External URLs (non-GitHub http/https).
  EXTERNAL_URL_RE.lastIndex = 0;
  while ((m = EXTERNAL_URL_RE.exec(prBody)) !== null) {
    const url = m[0].replace(/[.,;:)]+$/, ''); // strip trailing punctuation
    try {
      const parsed = new URL(url);
      const host = parsed.hostname.toLowerCase();
      external.push({ kind: 'external', ref: url, host });
    } catch {
      // Not a valid URL; skip.
    }
  }

  // Combine in precedence order, then deduplicate.
  const all = [...inline, ...gitFiles, ...gitHubRefs, ...external];
  return dedupeRefs(all);
}
