/**
 * github-source.ts — GitHub issue / PR resolution via the existing GitHubClient.
 *
 * Extends the pre-existing `closes/fixes/resolves #N` pattern to full
 * `github.com/<org>/<repo>/issues/<N>` and `/pull/<N>` URLs extracted by
 * `extract-references.ts`.
 *
 * Returns a plain-text representation of the issue / PR body so the intent
 * classifier gets the spec/acceptance criteria without API JSON structure.
 */

import type { GitHubClient, RepoRef } from '@devdigest/shared';
import type { GitHubIssueOrPrRef } from './index.js';

/**
 * Fetches a GitHub issue or PR and returns a formatted string suitable for
 * feeding to the intent classifier.
 *
 * @param github  The GitHubClient instance (uses the workspace's GitHub token).
 * @param ref     Parsed `{ owner, name, number }` from the URL.
 * @param type    `'issue'` or `'pull'` — controls which API call to make.
 * @returns       Formatted text, or `null` when the resource is unreachable.
 */
export async function resolveGitHubSource(
  github: GitHubClient,
  ref: GitHubIssueOrPrRef,
  type: 'issue' | 'pull',
): Promise<string | null> {
  const repoRef: RepoRef = { owner: ref.owner, name: ref.name };

  if (type === 'issue') {
    const issue = await github.getIssue(repoRef, ref.number);
    return formatGitHubItem(
      'Issue',
      `${ref.owner}/${ref.name}#${ref.number}`,
      issue.title,
      issue.body ?? null,
    );
  }

  // type === 'pull'
  const pr = await github.getPullRequest(repoRef, ref.number);
  return formatGitHubItem(
    'PR',
    `${ref.owner}/${ref.name}#${ref.number}`,
    pr.title,
    pr.body ?? null,
  );
}

function formatGitHubItem(
  resourceType: 'Issue' | 'PR',
  identifier: string,
  title: string,
  body: string | null,
): string {
  const parts: string[] = [`${resourceType} ${identifier}: ${title}`];
  if (body && body.trim().length > 0) {
    parts.push('');
    parts.push(body.trim());
  }
  return parts.join('\n');
}
