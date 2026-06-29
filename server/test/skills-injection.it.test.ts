import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns } from './helpers/runs.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockEmbedder, MockGitClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import type { Review } from '@devdigest/shared';

/**
 * L02 — proves the skills wiring end-to-end through the REAL run-executor:
 * only links that are enabled at BOTH levels (agent_skills.enabled && skills.enabled)
 * are injected into the prompt, in `order`, and surface in the run trace's
 * `prompt_assembly.skills`. A disabled skill produces no block at all.
 *
 * Uses a MockLLMProvider (no keys / no network) so the assertion is on the
 * assembled prompt, not the model output.
 *
 * MANUAL-ONLY: this control-experiment proof is excluded from the default test
 * suite (`pnpm test` / `vitest run`). Run it explicitly with:
 *   RUN_SKILLS_IT=1 pnpm exec vitest run test/skills-injection.it.test.ts
 */

const manual = process.env.RUN_SKILLS_IT === '1';
const hasDocker = manual && (await dockerAvailable());
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  stripeKey: "sk_live_xxx",
   redisUrl: x,`;

// A minimal valid Review so the run completes 'done' (we only care about the
// assembled prompt, not the findings).
const REVIEW_FIXTURE: Review = {
  verdict: 'comment',
  summary: 'ok',
  score: 100,
  findings: [],
};

// Distinctive sentinels so we can assert exactly which body made it into the prompt.
const ALPHA = 'ALPHA_SENTINEL: always validate untrusted input.';
const BETA = 'BETA_SENTINEL: never hardcode secrets.';

let repoSeq = 0;
async function setupRepoAndPr(db: PgFixture['handle']['db'], workspaceId: string) {
  const name = `skills-api-${repoSeq++}`;
  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
    .returning();
  const [pr] = await db
    .insert(t.pullRequests)
    .values({
      workspaceId,
      repoId: repo!.id,
      number: 1,
      title: 'change',
      author: 'dev',
      branch: 'feat/x',
      base: 'main',
      headSha: 'a1b2c3d4',
      additions: 1,
      deletions: 0,
      filesCount: 1,
      status: 'needs_review',
    })
    .returning();
  await db.insert(t.prFiles).values({
    prId: pr!.id,
    path: 'src/config.ts',
    additions: 1,
    deletions: 0,
    patch: '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,',
  });
  return pr!;
}

d('L02 skills injection through run-executor (Testcontainers pg)', () => {
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

  function app() {
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: DIFF }),
        llm: { openai: new MockLLMProvider('openai', { structured: REVIEW_FIXTURE }) },
      },
    });
  }

  /** Run a review on a fresh PR and return the completed run's trace. */
  async function runAndGetTrace(a: Awaited<ReturnType<typeof buildApp>>, agentId: string) {
    const pr = await setupRepoAndPr(pg.handle.db, workspaceId);
    const body = (
      await a.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId } })
    ).json();
    const runId = body.runs[0].run_id;
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });
    return (await a.inject({ method: 'GET', url: `/runs/${runId}/trace` })).json();
  }

  async function makeSkill(a: Awaited<ReturnType<typeof buildApp>>, name: string, bodyText: string) {
    return (
      await a.inject({
        method: 'POST',
        url: '/skills',
        payload: { name, description: `d-${name}`, type: 'custom', source: 'manual', body: bodyText },
      })
    ).json();
  }

  it('injects only enabled skills, in order; disabled link → no block', async () => {
    const a = await app();
    const skillA = await makeSkill(a, 'alpha', ALPHA);
    const skillB = await makeSkill(a, 'beta', BETA);
    const agent = (
      await a.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Reviewer', provider: 'openai', model: 'gpt-4.1', system_prompt: 's' },
      })
    ).json();

    // A enabled @0, B linked but DISABLED @1
    await a.inject({
      method: 'POST',
      url: `/agents/${agent.id}/skills`,
      payload: {
        skills: [
          { skill_id: skillA.id, order: 0, enabled: true },
          { skill_id: skillB.id, order: 1, enabled: false },
        ],
      },
    });

    const trace = await runAndGetTrace(a, agent.id);
    expect(trace.prompt_assembly.skills).toContain('ALPHA_SENTINEL');
    expect(trace.prompt_assembly.skills).not.toContain('BETA_SENTINEL');

    await a.close();
  });

  it('respects order and toggling which link is enabled', async () => {
    const a = await app();
    const skillA = await makeSkill(a, 'alpha2', ALPHA);
    const skillB = await makeSkill(a, 'beta2', BETA);
    const agent = (
      await a.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Reviewer2', provider: 'openai', model: 'gpt-4.1', system_prompt: 's' },
      })
    ).json();

    // Both enabled: A @0, B @1 → ALPHA appears before BETA.
    await a.inject({
      method: 'POST',
      url: `/agents/${agent.id}/skills`,
      payload: {
        skills: [
          { skill_id: skillA.id, order: 0, enabled: true },
          { skill_id: skillB.id, order: 1, enabled: true },
        ],
      },
    });
    let trace = await runAndGetTrace(a, agent.id);
    const block = trace.prompt_assembly.skills as string;
    expect(block.indexOf('ALPHA_SENTINEL')).toBeLessThan(block.indexOf('BETA_SENTINEL'));

    // Flip the single A link off via PATCH → only BETA remains.
    await a.inject({
      method: 'PATCH',
      url: `/agents/${agent.id}/skills/${skillA.id}`,
      payload: { enabled: false },
    });
    trace = await runAndGetTrace(a, agent.id);
    expect(trace.prompt_assembly.skills).toContain('BETA_SENTINEL');
    expect(trace.prompt_assembly.skills).not.toContain('ALPHA_SENTINEL');

    await a.close();
  });

  it('library-level disable also drops the skill, and all-off → null block', async () => {
    const a = await app();
    const skillA = await makeSkill(a, 'alpha3', ALPHA);
    const agent = (
      await a.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Reviewer3', provider: 'openai', model: 'gpt-4.1', system_prompt: 's' },
      })
    ).json();
    await a.inject({
      method: 'POST',
      url: `/agents/${agent.id}/skills`,
      payload: { skills: [{ skill_id: skillA.id, order: 0, enabled: true }] },
    });

    // Link is enabled but disable the skill at the library level → not injected.
    await a.inject({ method: 'PUT', url: `/skills/${skillA.id}`, payload: { enabled: false } });
    const trace = await runAndGetTrace(a, agent.id);
    expect(trace.prompt_assembly.skills).toBeNull();

    await a.close();
  });
});
