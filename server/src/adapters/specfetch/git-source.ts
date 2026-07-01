/**
 * git-source.ts — in-repo file resolution via the existing GitClient.
 *
 * Reads a file from the already-cloned repository at its current working tree
 * state (which should be the PR head SHA after `fetchPullHead` + `sync`).
 *
 * NO network calls: `git.readFile` reads the local clone from disk.
 * This is the preferred resolution path for any reference that points into
 * the current repo — it is deterministic, fast, and has zero SSRF risk.
 */

import type { GitClient, RepoRef } from '@devdigest/shared';

/**
 * Reads an in-repo file and returns its content, or `null` when the file is
 * absent or unreadable (best-effort — never throws).
 *
 * @param git      The GitClient bound to this server instance.
 * @param repoRef  The repo whose local clone to read from.
 * @param filePath Relative path within the repo (e.g. `docs/plans/x.md`).
 */
export async function resolveGitSource(
  git: GitClient,
  repoRef: RepoRef,
  filePath: string,
): Promise<string | null> {
  // Sanitise: reject obviously dangerous paths (absolute, parent traversal).
  const normalised = filePath.trim();
  if (
    normalised.startsWith('/') ||
    normalised.startsWith('..') ||
    normalised.includes('/../') ||
    normalised.includes('\\')
  ) {
    return null;
  }

  try {
    const text = await git.readFile(repoRef, normalised);
    return text.trim() === '' ? null : text;
  } catch {
    // File does not exist in the clone, or clone is missing entirely.
    return null;
  }
}
