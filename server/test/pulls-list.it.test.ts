/**
 * Integration test: findings_by_severity on the PR list endpoint.
 *
 * Verifies:
 *  - latest review SESSION only (a previous session's findings are excluded)
 *  - parallel reviews in one session are SUMMED (a single "Run Review" fans out
 *    multiple agents; the latest review by timestamp may have zero findings)
 *  - dismissed findings excluded
 *  - unreviewed PR returns null
 *
 * Self-skips when Docker is not available (same pattern as all *.it.test.ts).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  console.warn('[pulls-list] Docker not available — skipping.');
}

d('GET /repos/:id/pulls — findings_by_severity aggregate', () => {
  let pg: PgFixture;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  it('latest run only, dismissed excluded, null for unreviewed', async () => {
    const db = pg.handle.db;

    // Create a repo + two PRs
    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'findings-agg', fullName: 'acme/findings-agg' })
      .returning();

    const [reviewedPr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo!.id,
        number: 1,
        title: 'Reviewed PR',
        author: 'alice',
        branch: 'feat/a',
        base: 'main',
        headSha: 'abc1',
        additions: 1,
        deletions: 0,
        filesCount: 1,
        status: 'needs_review',
      })
      .returning();

    const [unreviewedPr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo!.id,
        number: 2,
        title: 'Unreviewed PR',
        author: 'bob',
        branch: 'feat/b',
        base: 'main',
        headSha: 'abc2',
        additions: 2,
        deletions: 0,
        filesCount: 1,
        status: 'needs_review',
      })
      .returning();

    // Seed two reviews for reviewedPr: older first, latest second.
    // The older review has findings that should NOT appear in the aggregate.
    const [olderReview] = await db
      .insert(t.reviews)
      .values({
        workspaceId,
        prId: reviewedPr!.id,
        kind: 'review',
        score: 70,
        createdAt: new Date('2024-01-01T10:00:00Z'),
      })
      .returning();

    await db.insert(t.findings).values([
      {
        reviewId: olderReview!.id,
        file: 'a.ts',
        startLine: 1,
        endLine: 1,
        severity: 'CRITICAL',
        category: 'security',
        title: 'Old critical',
        rationale: 'old',
        confidence: 0.9,
        kind: 'finding',
      },
      {
        reviewId: olderReview!.id,
        file: 'a.ts',
        startLine: 2,
        endLine: 2,
        severity: 'CRITICAL',
        category: 'security',
        title: 'Old critical 2',
        rationale: 'old',
        confidence: 0.9,
        kind: 'finding',
      },
    ]);

    const [latestReview] = await db
      .insert(t.reviews)
      .values({
        workspaceId,
        prId: reviewedPr!.id,
        kind: 'review',
        score: 55,
        createdAt: new Date('2024-06-01T10:00:00Z'),
      })
      .returning();

    const [dismissedFinding] = await db
      .insert(t.findings)
      .values({
        reviewId: latestReview!.id,
        file: 'b.ts',
        startLine: 5,
        endLine: 5,
        severity: 'CRITICAL',
        category: 'security',
        title: 'Dismissed critical',
        rationale: 'secret',
        confidence: 0.95,
        kind: 'finding',
        dismissedAt: new Date('2024-06-02T00:00:00Z'),
      })
      .returning();

    // Latest review: 3 open CRITICAL, 2 WARNING, 1 SUGGESTION; 1 dismissed CRITICAL
    await db.insert(t.findings).values([
      {
        reviewId: latestReview!.id,
        file: 'b.ts',
        startLine: 10,
        endLine: 10,
        severity: 'CRITICAL',
        category: 'security',
        title: 'Open critical 1',
        rationale: 'crit',
        confidence: 0.9,
        kind: 'finding',
      },
      {
        reviewId: latestReview!.id,
        file: 'b.ts',
        startLine: 11,
        endLine: 11,
        severity: 'CRITICAL',
        category: 'security',
        title: 'Open critical 2',
        rationale: 'crit',
        confidence: 0.9,
        kind: 'finding',
      },
      {
        reviewId: latestReview!.id,
        file: 'b.ts',
        startLine: 12,
        endLine: 12,
        severity: 'CRITICAL',
        category: 'security',
        title: 'Open critical 3',
        rationale: 'crit',
        confidence: 0.85,
        kind: 'finding',
      },
      {
        reviewId: latestReview!.id,
        file: 'c.ts',
        startLine: 1,
        endLine: 1,
        severity: 'WARNING',
        category: 'bug',
        title: 'Warning 1',
        rationale: 'warn',
        confidence: 0.7,
        kind: 'finding',
      },
      {
        reviewId: latestReview!.id,
        file: 'c.ts',
        startLine: 2,
        endLine: 2,
        severity: 'WARNING',
        category: 'bug',
        title: 'Warning 2',
        rationale: 'warn',
        confidence: 0.7,
        kind: 'finding',
      },
      {
        reviewId: latestReview!.id,
        file: 'd.ts',
        startLine: 3,
        endLine: 3,
        severity: 'SUGGESTION',
        category: 'style',
        title: 'Suggestion 1',
        rationale: 'suggest',
        confidence: 0.6,
        kind: 'finding',
      },
    ]);

    void dismissedFinding; // used above

    // Boot app with mock GitHub (serves zero PRs from API → serves only seeded rows)
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    const app = await buildApp({
      config,
      db: pg.handle.db,
      overrides: { git: new MockGitClient(), github: new MockGitHubClient() },
    });

    const res = await app.inject({
      method: 'GET',
      url: `/repos/${repo!.id}/pulls`,
    });

    expect(res.statusCode).toBe(200);
    const pulls = res.json() as Array<{
      id: string;
      number: number;
      findings_by_severity: { CRITICAL: number; WARNING: number; SUGGESTION: number } | null;
    }>;

    const rpr = pulls.find((p) => p.id === reviewedPr!.id);
    const upr = pulls.find((p) => p.id === unreviewedPr!.id);

    // Reviewed PR: latest run only (not the older 2 CRITICAL), dismissed excluded
    expect(rpr?.findings_by_severity).toEqual({
      CRITICAL: 3, // 3 open; 1 dismissed CRITICAL excluded
      WARNING: 2,
      SUGGESTION: 1,
    });

    // Unreviewed PR: null
    expect(upr?.findings_by_severity).toBeNull();

    await app.close();
  });

  it('sums findings across parallel reviews in the latest session', async () => {
    const db = pg.handle.db;

    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'session-agg', fullName: 'acme/session-agg' })
      .returning();

    const [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo!.id,
        number: 1,
        title: 'Multi-agent reviewed PR',
        author: 'alice',
        branch: 'feat/multi',
        base: 'main',
        headSha: 'sha-multi',
        additions: 1,
        deletions: 0,
        filesCount: 1,
        status: 'needs_review',
      })
      .returning();

    // A previous session (months earlier) whose findings must NOT be counted.
    const [oldReview] = await db
      .insert(t.reviews)
      .values({
        workspaceId,
        prId: pr!.id,
        kind: 'review',
        score: 40,
        createdAt: new Date('2024-01-01T10:00:00Z'),
      })
      .returning();
    await db.insert(t.findings).values(
      [1, 2, 3, 4, 5].map((i) => ({
        reviewId: oldReview!.id,
        file: 'old.ts',
        startLine: i,
        endLine: i,
        severity: 'CRITICAL' as const,
        category: 'security',
        title: `Old crit ${i}`,
        rationale: 'old session',
        confidence: 0.9,
        kind: 'finding',
      })),
    );

    // Latest session: one "Run Review" fanned out 3 agents within seconds.
    // General Reviewer (t0): findings. Performance (t0+10s): findings. Security
    // (t0+20s, the LATEST by timestamp): zero findings — must not zero the counter.
    const base = Date.parse('2024-07-01T10:00:00Z');
    const [general] = await db
      .insert(t.reviews)
      .values({
        workspaceId,
        prId: pr!.id,
        kind: 'review',
        score: 73,
        createdAt: new Date(base),
      })
      .returning();
    const [performance] = await db
      .insert(t.reviews)
      .values({
        workspaceId,
        prId: pr!.id,
        kind: 'review',
        score: 100,
        createdAt: new Date(base + 10_000),
      })
      .returning();
    await db
      .insert(t.reviews)
      .values({
        workspaceId,
        prId: pr!.id,
        kind: 'review',
        score: 100,
        createdAt: new Date(base + 20_000),
      });

    // General: 2 CRITICAL + 1 WARNING; Performance: 1 CRITICAL + 1 SUGGESTION.
    // CRITICAL must SUM across the two reviews (2 + 1 = 3).
    await db.insert(t.findings).values([
      {
        reviewId: general!.id,
        file: 'a.ts',
        startLine: 1,
        endLine: 1,
        severity: 'CRITICAL',
        category: 'security',
        title: 'Gen crit 1',
        rationale: 'x',
        confidence: 0.9,
        kind: 'finding',
      },
      {
        reviewId: general!.id,
        file: 'a.ts',
        startLine: 2,
        endLine: 2,
        severity: 'CRITICAL',
        category: 'security',
        title: 'Gen crit 2',
        rationale: 'x',
        confidence: 0.9,
        kind: 'finding',
      },
      {
        reviewId: general!.id,
        file: 'a.ts',
        startLine: 3,
        endLine: 3,
        severity: 'WARNING',
        category: 'bug',
        title: 'Gen warn',
        rationale: 'x',
        confidence: 0.7,
        kind: 'finding',
      },
      {
        reviewId: performance!.id,
        file: 'b.ts',
        startLine: 1,
        endLine: 1,
        severity: 'CRITICAL',
        category: 'perf',
        title: 'Perf crit',
        rationale: 'x',
        confidence: 0.8,
        kind: 'finding',
      },
      {
        reviewId: performance!.id,
        file: 'b.ts',
        startLine: 2,
        endLine: 2,
        severity: 'SUGGESTION',
        category: 'perf',
        title: 'Perf suggestion',
        rationale: 'x',
        confidence: 0.6,
        kind: 'finding',
      },
    ]);

    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    const app = await buildApp({
      config,
      db: pg.handle.db,
      overrides: { git: new MockGitClient(), github: new MockGitHubClient() },
    });

    const res = await app.inject({ method: 'GET', url: `/repos/${repo!.id}/pulls` });
    expect(res.statusCode).toBe(200);
    const pulls = res.json() as Array<{
      id: string;
      findings_by_severity: { CRITICAL: number; WARNING: number; SUGGESTION: number } | null;
    }>;

    const got = pulls.find((p) => p.id === pr!.id);
    // Latest session summed (2+1 CRITICAL, 1 WARNING, 1 SUGGESTION); old session's
    // 5 CRITICAL excluded; empty latest-by-timestamp review doesn't suppress it.
    expect(got?.findings_by_severity).toEqual({ CRITICAL: 3, WARNING: 1, SUGGESTION: 1 });

    await app.close();
  });
});
