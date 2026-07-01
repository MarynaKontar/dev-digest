/**
 * specfetch/index.ts — Spec/Plan resolver adapter.
 *
 * Exposes:
 *   - SpecRefKind, SpecReference, ResolvedSpec — public value/type contracts
 *   - SpecResolver — port interface (implemented here; mocked in Unit 4's mocks.ts)
 *   - SpecFetchResolver — real infrastructure implementation
 *   - parseGitHubBlobUrl, parseGitHubIssueOrPrUrl — shared URL parsers
 *
 * The resolver dispatches each reference extracted from a PR body to the
 * appropriate source:
 *   • inline     → already text; returned as-is
 *   • git-file   → git-source (local clone, no network)
 *   • github-blob pointing INTO this repo → git-source (preferred, no network)
 *   • github-blob pointing ELSEWHERE → web-source (SSRF-guarded)
 *   • github-issue / github-pr → github-source (octokit)
 *   • external   → web-source (allowlist + SSRF guard)
 *
 * Per-source failures are swallowed (best-effort); the caller receives whatever
 * could be resolved. All text is returned raw — the service layer wraps it as
 * untrusted before handing it to any model.
 *
 * Container wiring (Unit 4) and mocks.ts (Unit 4) are NOT touched here.
 */

import type { GitClient, GitHubClient, RepoRef } from '@devdigest/shared';
import type { AppConfig } from '../../platform/config.js';
import { approxTokens } from '../tokenizer/index.js';
import { extractReferences } from './extract-references.js';
import { resolveGitSource } from './git-source.js';
import { resolveGitHubSource } from './github-source.js';
import { resolveWebSource } from './web-source.js';

// ---------- Public types (port contract) ----------

/** Discriminator for how a spec reference was obtained. */
export type SpecRefKind =
  | 'inline'        // fenced code block / section in the PR body itself
  | 'git-file'      // in-repo file path read from the local clone
  | 'github-blob'   // github.com blob URL — dispatched to git-source if same repo
  | 'github-issue'  // https://github.com/<org>/<repo>/issues/<N>
  | 'github-pr'     // https://github.com/<org>/<repo>/pull/<N>
  | 'external';     // any other http/https URL (web-source + SSRF guard)

/** A spec/plan reference extracted from a PR body before resolution. */
export interface SpecReference {
  kind: SpecRefKind;
  /**
   * Raw reference value:
   *   - For `inline`: the extracted text itself.
   *   - For `git-file`: the relative file path (e.g. `docs/plans/x.md`).
   *   - For GitHub/external: the full URL.
   */
  ref: string;
  /** Parsed hostname, present for `github-blob`, `github-issue`, `github-pr`, `external`. */
  host?: string;
}

/** A resolved spec/plan source ready for the intent classifier. */
export interface ResolvedSpec {
  kind: SpecRefKind;
  /** Same as `SpecReference.ref`; used to label the source in the classifier prompt. */
  ref: string;
  /** Resolved text content (raw; the service layer wraps it as untrusted). */
  text: string;
  /** True when the text was truncated to fit `intentSpecMaxTokens`. */
  truncated: boolean;
}

/** Port interface — the composition root (Unit 4) wires the real implementation. */
export interface SpecResolver {
  resolve(prBody: string, repoRef: RepoRef, headSha: string): Promise<ResolvedSpec[]>;
}

// ---------- URL parsers (also used by extract-references.ts) ----------

export interface GitHubBlobRef {
  owner: string;
  name: string;
  sha: string;
  path: string;
}

/**
 * Parses a `github.com/<org>/<repo>/blob/<sha-or-branch>/path` URL.
 * Returns `null` when the URL does not match the expected shape.
 */
export function parseGitHubBlobUrl(url: string): GitHubBlobRef | null {
  try {
    const u = new URL(url);
    if (u.hostname !== 'github.com') return null;
    // Pathname: /owner/repo/blob/sha-or-branch/path/to/file
    const m = u.pathname.match(/^\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)$/);
    if (!m) return null;
    return { owner: m[1]!, name: m[2]!, sha: m[3]!, path: m[4]! };
  } catch {
    return null;
  }
}

export interface GitHubIssueOrPrRef {
  owner: string;
  name: string;
  number: number;
}

/**
 * Parses `github.com/<org>/<repo>/issues/<N>` or `.../pull/<N>` URLs.
 * Returns `null` when the URL does not match.
 */
export function parseGitHubIssueOrPrUrl(url: string): GitHubIssueOrPrRef | null {
  try {
    const u = new URL(url);
    if (u.hostname !== 'github.com') return null;
    const m = u.pathname.match(/^\/([^/]+)\/([^/]+)\/(?:issues|pull)\/(\d+)/);
    if (!m) return null;
    return { owner: m[1]!, name: m[2]!, number: Number(m[3]) };
  } catch {
    return null;
  }
}

// ---------- Token-budget truncation ----------

/**
 * Truncates `text` to approximately `maxTokens` tokens (chars / 4 heuristic).
 * Never throws.
 */
function truncateToTokenBudget(
  text: string,
  maxTokens: number,
): { text: string; truncated: boolean } {
  if (approxTokens(text) <= maxTokens) return { text, truncated: false };
  const charBudget = maxTokens * 4;
  return { text: text.slice(0, charBudget), truncated: true };
}

// ---------- Real implementation ----------

/** Minimal logger interface accepted by SpecFetchResolver. */
export interface SpecResolverLogger {
  warn(msg: string, ctx?: Record<string, unknown>): void;
}

/**
 * Infrastructure implementation of SpecResolver.
 *
 * Constructed by the DI container (Unit 4) with the real git/github clients
 * and the loaded AppConfig. Tests inject MockGitClient / MockGitHubClient
 * and a custom config with a test allowlist.
 */
export class SpecFetchResolver implements SpecResolver {
  constructor(
    private readonly git: GitClient,
    private readonly github: GitHubClient,
    private readonly config: AppConfig,
    private readonly log?: SpecResolverLogger,
  ) {}

  async resolve(
    prBody: string,
    repoRef: RepoRef,
    headSha: string,
  ): Promise<ResolvedSpec[]> {
    if (!prBody || prBody.trim() === '') return [];

    const maxTokens = this.config.intentSpecMaxTokens;
    const allowlist = this.config.intentSpecAllowlist;

    const refs = extractReferences(prBody, repoRef);
    const results: ResolvedSpec[] = [];

    for (const ref of refs) {
      try {
        const raw = await this.fetchOne(ref, repoRef, headSha, allowlist);
        if (raw == null || raw.trim() === '') continue;
        const { text, truncated } = truncateToTokenBudget(raw, maxTokens);
        results.push({ kind: ref.kind, ref: ref.ref, text, truncated });
      } catch (err) {
        // Best-effort: one broken reference must never abort the whole resolve.
        this.log?.warn('specfetch: failed to resolve reference', {
          kind: ref.kind,
          ref: ref.ref,
          err: String(err),
        });
      }
    }

    return results;
  }

  private async fetchOne(
    ref: SpecReference,
    repoRef: RepoRef,
    _headSha: string,
    allowlist: string[],
  ): Promise<string | null> {
    switch (ref.kind) {
      case 'inline':
        // Already resolved — the text IS the ref content.
        return ref.ref;

      case 'git-file':
        return resolveGitSource(this.git, repoRef, ref.ref);

      case 'github-blob': {
        // A blob URL that points into THIS repo → prefer git-source (no network).
        const parsed = parseGitHubBlobUrl(ref.ref);
        if (
          parsed &&
          parsed.owner.toLowerCase() === repoRef.owner.toLowerCase() &&
          parsed.name.toLowerCase() === repoRef.name.toLowerCase()
        ) {
          return resolveGitSource(this.git, repoRef, parsed.path);
        }
        // Blob points into a different repo → treat as external (SSRF-guarded).
        return resolveWebSource(ref.ref, allowlist);
      }

      case 'github-issue': {
        const parsed = parseGitHubIssueOrPrUrl(ref.ref);
        if (!parsed) return null;
        return resolveGitHubSource(this.github, parsed, 'issue');
      }

      case 'github-pr': {
        const parsed = parseGitHubIssueOrPrUrl(ref.ref);
        if (!parsed) return null;
        return resolveGitHubSource(this.github, parsed, 'pull');
      }

      case 'external':
        return resolveWebSource(ref.ref, allowlist);

      default: {
        // Exhaustiveness check — TypeScript will error if a new kind is added
        // to SpecRefKind without a corresponding case here.
        const _exhaustive: never = ref.kind;
        void _exhaustive;
        return null;
      }
    }
  }
}
