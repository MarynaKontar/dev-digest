import type { z } from 'zod';
import type { Container } from '../../platform/container.js';
import type { UnifiedDiff, ChatMessage, IssueMeta } from '@devdigest/shared';
import { Intent, PrIntentRecord } from '@devdigest/shared';
import { wrapUntrusted } from '@devdigest/reviewer-core';
import { NotFoundError } from '../../platform/errors.js';
import { resolveFeatureModel } from '../settings/feature-models.js';
import { loadDiff } from '../_shared/diff-loader.js';
import type { ResolvedSpec } from '../../adapters/specfetch/index.js';
import type { Tokenizer } from '../../adapters/tokenizer/index.js';
import { INTENT_SYSTEM } from './constants.js';

/** Minimal structured logger (pino-compatible: (obj, msg)) for runtime logs. */
export interface Logger {
  info(obj: unknown, msg?: string): void;
  warn(obj: unknown, msg?: string): void;
}

// ---- Private helpers --------------------------------------------------------

/**
 * Synthesize `@@ -oldStart,oldLines +newStart,newLines @@` header lines from
 * a UnifiedDiff. NO patch bodies — only file paths and hunk position headers.
 */
function buildHunkHeaders(diff: UnifiedDiff): string {
  const lines: string[] = [];
  for (const file of diff.files) {
    lines.push(`--- ${file.path}`);
    for (const hunk of file.hunks) {
      lines.push(`@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`);
    }
  }
  return lines.join('\n');
}

/**
 * Assemble the classifier user message from available signals, ordered by
 * source precedence (most authoritative first).
 *
 * All external/user-controlled content is wrapped with `wrapUntrusted` so the
 * INJECTION_GUARD sentinel blocks hold even in the intent classifier path.
 *
 * Total length is capped to `maxTokens` (chars / 4 heuristic when the real
 * tokenizer would be too slow) — the "cheap input" promise.
 */
function assembleClassifierInput(opts: {
  title: string;
  resolvedSpecs: ResolvedSpec[];
  linkedIssue: IssueMeta | null;
  hunkHeaders: string;
  maxTokens: number;
  tokenizer: Tokenizer;
}): string {
  const sections: string[] = [];

  // PR title is a short trusted label — not wrapped but clearly headed.
  sections.push(`## PR Title\n${opts.title}`);

  // 1. Resolved plan/spec — authoritative; listed first so the model knows it.
  for (const spec of opts.resolvedSpecs) {
    const truncNote = spec.truncated ? ' — truncated to token budget' : '';
    sections.push(
      `## Plan/Spec [authoritative] (source: ${spec.ref}${truncNote})\n` +
        wrapUntrusted(`spec-${spec.kind}`, spec.text),
    );
  }

  // 2. Linked issue — secondary context.
  if (opts.linkedIssue) {
    const body = opts.linkedIssue.body ?? '(no body)';
    sections.push(
      `## Linked Issue #${opts.linkedIssue.number}: ${opts.linkedIssue.title}\n` +
        wrapUntrusted('linked-issue', body),
    );
  }

  // 3. Implicit signals — hunk headers (no patch bodies); always present.
  sections.push(
    `## Changed Files and Hunk Headers\n` +
      wrapUntrusted('diff-headers', opts.hunkHeaders || '(no changed files)'),
  );

  const text = sections.join('\n\n');

  // Soft cap: truncate the assembled text if it exceeds the token budget.
  const tokens = opts.tokenizer.count(text);
  if (tokens <= opts.maxTokens) return text;
  const charBudget = opts.maxTokens * 4;
  return text.slice(0, charBudget);
}

// ---- DTO converter ----------------------------------------------------------

/** Map a pr_intent DB row → the PrIntentRecord transport shape. */
function rowToRecord(row: {
  prId: string;
  intent: string;
  inScope: string[];
  outOfScope: string[];
  riskAreas: string[];
}): PrIntentRecord {
  return {
    pr_id: row.prId,
    intent: row.intent,
    in_scope: row.inScope,
    out_of_scope: row.outOfScope,
    risk_areas: row.riskAreas,
  };
}

// ---- Service ----------------------------------------------------------------

/**
 * Application-layer service for PR intent classification.
 *
 * Implements a head-SHA cache: if a stored intent exists for the PR and its
 * `head_sha` matches the current PR head, no LLM call is made. This makes
 * re-running a review on an unchanged PR (or clicking Recompute with no new
 * push) a cheap DB read.
 *
 * Token savings are logged on every LLM call: `diff.raw` tokens vs the compact
 * classifier input tokens (file list + hunk headers only, no patch bodies).
 */
export class IntentService {
  constructor(private container: Container) {}

  /**
   * Return the cached intent if the PR head SHA matches, otherwise classify,
   * persist, and return the new `PrIntentRecord`.
   *
   * @param workspaceId - Workspace used for PR + feature-model scope.
   * @param prId        - UUID of the pull request row.
   * @param logger      - Optional pino-compatible logger for token-savings output.
   */
  async ensureIntent(
    workspaceId: string,
    prId: string,
    logger?: Logger,
  ): Promise<PrIntentRecord> {
    // 1. Load pull row (title, body, headSha, repoId, number).
    const pull = await this.container.reviewRepo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');

    // 2. Load repo for owner/name → RepoRef (needed for git + github calls).
    const repoRow = await this.container.reviewRepo.getRepo(pull.repoId);
    if (!repoRow) throw new NotFoundError('Repo not found');
    const repoRef = { owner: repoRow.owner, name: repoRow.name };

    // 3. Cache check: stored head_sha === current head_sha → return immediately.
    const cached = await this.container.intentRepo.getByPrId(prId);
    if (cached !== null && cached.headSha === pull.headSha) {
      return rowToRecord(cached);
    }

    // 4. Load diff via the shared helper (same one run-executor uses).
    //    We only need file list + hunk headers — no patch bodies.
    const diff = await loadDiff(
      this.container,
      this.container.reviewRepo,
      workspaceId,
      pull,
      repoRow,
    );
    const hunkHeaders = buildHunkHeaders(diff);

    // 5. Resolve plan/spec references from the PR body (best-effort; swallow errors).
    let resolvedSpecs: ResolvedSpec[] = [];
    try {
      resolvedSpecs = await this.container.specResolver.resolve(
        pull.body ?? '',
        repoRef,
        pull.headSha,
      );
    } catch {
      // Best-effort: a broken spec reference must not abort intent classification.
    }

    // 6. Resolve linked issue via GitHub API (best-effort; swallow errors).
    //    The linked_issue comes from the PR detail, which extends PrMeta with
    //    body, files, commits, and linked_issue (IssueMeta | null).
    let linkedIssue: IssueMeta | null = null;
    try {
      const github = await this.container.github();
      const prDetail = await github.getPullRequest(repoRef, pull.number);
      linkedIssue = prDetail.linked_issue ?? null;
    } catch {
      // Best-effort: no GitHub token or network — continue without issue body.
    }

    // 7. Assemble classifier input by source precedence, capped to token budget.
    const classifierInput = assembleClassifierInput({
      title: pull.title,
      resolvedSpecs,
      linkedIssue,
      hunkHeaders,
      maxTokens: this.container.config.intentSpecMaxTokens,
      tokenizer: this.container.tokenizer,
    });

    // 8. Log token savings: full diff vs compact classifier input.
    const tokensFull = this.container.tokenizer.count(diff.raw);
    const tokensIntent = this.container.tokenizer.count(classifierInput);
    const saved = tokensFull - tokensIntent;
    logger?.info({ tokensFull, tokensIntent, saved }, 'intent token savings');

    // 9. Resolve the feature model (workspace override → registry default).
    const { provider, model } = await resolveFeatureModel(
      this.container,
      workspaceId,
      'review_intent',
    );
    const llm = await this.container.llm(provider);

    // INSIGHTS: completeStructured takes messages: ChatMessage[] — NOT separate
    // system/prompt. Always annotate the generic explicitly so TypeScript infers
    // T correctly and does not fall back to `unknown`.
    const messages: ChatMessage[] = [
      { role: 'system', content: INTENT_SYSTEM },
      { role: 'user', content: classifierInput },
    ];

    // INSIGHTS: annotate the generic explicitly. `Intent.risk_areas` has `.default([])`,
    // which makes the _input_ type have `risk_areas?: string[] | undefined` while the
    // _output_ type has `risk_areas: string[]`. `ZodType<T>` requires both to be T,
    // so we cast with `as z.ZodType<Intent>` to satisfy the constraint without losing
    // the validated output type. This is the standard Zod v3 workaround for schemas
    // that use .default() on any field.
    const result = await llm.completeStructured<Intent>({
      model,
      schema: Intent as z.ZodType<Intent>,
      schemaName: 'Intent',
      messages,
      maxRetries: 2,
      // OpenRouter: only route to providers that natively enforce json_schema
      // so we get real structured output, not degraded text-mode parsing.
      ...(provider === 'openrouter' ? { requireParameters: true } : {}),
    });

    // 10. Persist (upsert on prId) and return the PrIntentRecord.
    //     head_sha is stored for cache invalidation but NOT included in the
    //     PrIntentRecord transport shape (it is internal cache state).
    const row = await this.container.intentRepo.upsert({
      prId,
      intent: result.data.intent,
      inScope: result.data.in_scope,
      outOfScope: result.data.out_of_scope,
      riskAreas: result.data.risk_areas,
      headSha: pull.headSha,
    });

    return rowToRecord(row);
  }
}
