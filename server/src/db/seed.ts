import 'dotenv/config';
import { createDb, type Db } from './client.js';
import * as t from './schema.js';
import { eq, and } from 'drizzle-orm';
import {
  GENERAL_REVIEWER_PROMPT,
  SECURITY_REVIEWER_PROMPT,
  PERFORMANCE_REVIEWER_PROMPT,
  TEST_QUALITY_REVIEWER_PROMPT,
  API_CONTRACT_REVIEWER_PROMPT,
  TEST_COVERAGE_NUDGE_BODY,
  TEST_QUALITY_PATTERNS_BODY,
  API_CONTRACT_GATE_BODY,
} from './seed-prompts.js';

/** Default provider/model for the built-in reviewer agents. */
const DEFAULT_PROVIDER = 'openrouter' as const;
const DEFAULT_MODEL = 'deepseek/deepseek-v4-flash';

/**
 * Seed the starter's demo data. Idempotent: re-running upserts the default
 * workspace/user and the demo fixtures.
 *
 * Seeds: default workspace + system user + membership, default settings,
 * demo repo (acme/payments-api), PR #482 with files/commits, a sample review
 * with a few findings, and the three built-in agents (General + Security +
 * Performance), all on the default openrouter/deepseek-v4-flash provider+model.
 *
 * Course lessons populate the other tables (skills, conventions, memory, eval,
 * …) once their features are built — they start empty here.
 */

export const DEFAULT_WORKSPACE_NAME = 'default';
export const SYSTEM_USER_EMAIL = 'you@local';

export async function seed(db: Db): Promise<{ workspaceId: string; userId: string }> {
  // ---- workspace + user (no-auth defaults) ----
  let [ws] = await db
    .select()
    .from(t.workspaces)
    .where(eq(t.workspaces.name, DEFAULT_WORKSPACE_NAME));
  if (!ws) {
    [ws] = await db
      .insert(t.workspaces)
      .values({ name: DEFAULT_WORKSPACE_NAME })
      .returning();
  }
  const workspaceId = ws!.id;

  let [user] = await db.select().from(t.users).where(eq(t.users.email, SYSTEM_USER_EMAIL));
  if (!user) {
    [user] = await db
      .insert(t.users)
      .values({ email: SYSTEM_USER_EMAIL, name: 'You' })
      .returning();
  }
  const userId = user!.id;

  await db
    .insert(t.workspaceMembers)
    .values({ workspaceId, userId, role: 'owner' })
    .onConflictDoNothing();

  // ---- default settings ----
  const defaultSettings: Record<string, unknown> = {
    polling_interval_min: 5,
    theme: 'dark',
    density: 'regular',
    sync_to_folder: true,
  };
  for (const [key, value] of Object.entries(defaultSettings)) {
    await db
      .insert(t.settings)
      .values({ workspaceId, userId, key, value })
      .onConflictDoNothing();
  }

  // ---- demo repo (acme/payments-api) ----
  let [repo] = await db
    .select()
    .from(t.repos)
    .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.fullName, 'acme/payments-api')));
  if (!repo) {
    [repo] = await db
      .insert(t.repos)
      .values({
        workspaceId,
        owner: 'acme',
        name: 'payments-api',
        fullName: 'acme/payments-api',
        defaultBranch: 'main',
        clonePath: null,
        createdBy: userId,
      })
      .returning();
  }
  const repoId = repo!.id;

  // ---- PR #482 (rate limiting) ----
  let [pr] = await db
    .select()
    .from(t.pullRequests)
    .where(and(eq(t.pullRequests.repoId, repoId), eq(t.pullRequests.number, 482)));
  if (!pr) {
    [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId,
        number: 482,
        title: 'Add rate limiting to public API endpoints',
        author: 'marisa.koch',
        branch: 'feat/rate-limit-public',
        base: 'main',
        headSha: 'a1b2c3d4e5f6',
        additions: 247,
        deletions: 38,
        filesCount: 9,
        status: 'needs_review',
        body: 'Add rate limiting to public API endpoints to prevent abuse from unauthenticated clients.',
      })
      .returning();

    // pr_files (subset)
    await db.insert(t.prFiles).values([
      { prId: pr!.id, path: 'src/middleware/ratelimit.ts', additions: 84, deletions: 0 },
      { prId: pr!.id, path: 'src/api/public/webhooks.ts', additions: 31, deletions: 6 },
      { prId: pr!.id, path: 'src/config.ts', additions: 4, deletions: 0 },
      { prId: pr!.id, path: 'src/api/users.ts', additions: 7, deletions: 2 },
    ]);

    // pr_commits
    await db.insert(t.prCommits).values({
      prId: pr!.id,
      sha: 'a1b2c3d4e5f6',
      message: 'Add token-bucket rate limiter',
      author: 'marisa.koch',
    });

    // a sample review + findings so the PR shows results before the first run
    const [review] = await db
      .insert(t.reviews)
      .values({
        workspaceId,
        prId: pr!.id,
        kind: 'review',
        verdict: 'request_changes',
        summary:
          'Solid middleware approach, but a Stripe secret key is committed in plaintext and the user-list endpoint introduces an N+1 query under the new limiter.',
        score: 61,
        model: 'seed',
      })
      .returning();

    await db.insert(t.findings).values([
      {
        reviewId: review!.id,
        file: 'src/config.ts',
        startLine: 12,
        endLine: 12,
        severity: 'CRITICAL',
        category: 'security',
        title: 'Hardcoded Stripe secret key in commit',
        rationale: 'Line 12 contains a literal `sk_live_` Stripe secret key.',
        suggestion: 'Move to env var and rotate the key immediately.',
        confidence: 0.98,
      },
      {
        reviewId: review!.id,
        file: 'src/api/users.ts',
        startLine: 45,
        endLine: 52,
        severity: 'WARNING',
        category: 'perf',
        title: 'N+1 query in user list endpoint',
        rationale: 'Loop issues one query per user → N+1.',
        suggestion: 'Use a single IN query and group in memory.',
        confidence: 0.86,
      },
    ]);
  }

  // ---- built-in agents (the three starter presets) ----
  // Prompt bodies live in ./seed-prompts.ts (mirrored in docs/agent-prompts/*.md).
  const seedAgents: Array<typeof t.agents.$inferInsert> = [
    {
      workspaceId,
      name: 'General Reviewer',
      description: 'Reviews a PR diff for bugs, correctness, and clarity.',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      systemPrompt: GENERAL_REVIEWER_PROMPT,
      enabled: true,
      version: 1,
      createdBy: userId,
    },
    {
      workspaceId,
      name: 'Security Reviewer',
      description: 'Flags secrets, injection, SSRF and the lethal trifecta before merge.',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      systemPrompt: SECURITY_REVIEWER_PROMPT,
      enabled: true,
      version: 1,
      createdBy: userId,
    },
    {
      workspaceId,
      name: 'Performance Reviewer',
      description: 'Catches N+1 queries, missing indexes, and hot-path allocations.',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      systemPrompt: PERFORMANCE_REVIEWER_PROMPT,
      enabled: true,
      version: 1,
      createdBy: userId,
    },
  ];
  for (const a of seedAgents) {
    const [existing] = await db
      .select()
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.name, a.name)));
    if (!existing) await db.insert(t.agents).values(a);
  }

  // ---- L02: skills (idempotent: upsert by name+workspace) ----
  // Each skill gets a v1 skill_versions snapshot on first insert (note: "Initial").
  const seedSkills: Array<{
    name: string;
    description: string;
    type: (typeof t.skills.$inferInsert)['type'];
    source: (typeof t.skills.$inferInsert)['source'];
    body: string;
  }> = [
    {
      name: 'Test Coverage Nudge',
      description:
        'Require every new conditional branch and error path to have a corresponding test — flag missing coverage as a CRITICAL gap.',
      type: 'rubric',
      source: 'manual',
      body: TEST_COVERAGE_NUDGE_BODY,
    },
    {
      name: 'Test Quality Patterns',
      description:
        'Flag over-mocking antipatterns, flaky test signals, and weak assertions — community-imported standards for TypeScript/Node.js projects.',
      type: 'custom',
      source: 'community',
      body: TEST_QUALITY_PATTERNS_BODY,
    },
    {
      name: 'API Contract Gate',
      description:
        'Enforce that no route signature, response field, or error code changes without a versioning strategy — escalate violations to CRITICAL.',
      type: 'rubric',
      source: 'manual',
      body: API_CONTRACT_GATE_BODY,
    },
  ];

  const skillIds: Record<string, string> = {};
  for (const s of seedSkills) {
    let [existingSkill] = await db
      .select({ id: t.skills.id })
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.name, s.name)));
    if (!existingSkill) {
      const [inserted] = await db
        .insert(t.skills)
        .values({ workspaceId, ...s, enabled: true, version: 1 })
        .returning({ id: t.skills.id });
      // Snapshot v1 with change note "Initial"
      await db
        .insert(t.skillVersions)
        .values({ skillId: inserted!.id, version: 1, body: s.body, note: 'Initial' });
      existingSkill = inserted!;
    }
    skillIds[s.name] = existingSkill!.id;
  }

  // ---- L02: demo agents (Test Quality + API Contract) ----
  // Seeded with enabled=true so the control experiment works out of the box.
  // No agentVersions snapshot — the existing starter agents are not snapshotted either.
  const l02Agents: Array<typeof t.agents.$inferInsert> = [
    {
      workspaceId,
      name: 'Test Quality Reviewer',
      description:
        'Flags untested branches, missing corner cases, over-mocking antipatterns, and flaky test patterns.',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      systemPrompt: TEST_QUALITY_REVIEWER_PROMPT,
      enabled: true,
      version: 1,
      createdBy: userId,
    },
    {
      workspaceId,
      name: 'API Contract Reviewer',
      description: 'Detects breaking route/signature changes before they reach deployed callers.',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      systemPrompt: API_CONTRACT_REVIEWER_PROMPT,
      enabled: true,
      version: 1,
      createdBy: userId,
    },
  ];

  const agentIds: Record<string, string> = {};
  for (const a of l02Agents) {
    let [existingAgent] = await db
      .select({ id: t.agents.id })
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.name, a.name!)));
    if (!existingAgent) {
      const [inserted] = await db.insert(t.agents).values(a).returning({ id: t.agents.id });
      existingAgent = inserted!;
    }
    agentIds[a.name!] = existingAgent!.id;
  }

  // ---- L02: agent_skills links ----
  // enabled=true on every link so the "with skills" path is the default.
  // The operator disables a link to get the "without skills" baseline
  // (control experiment per §7 of skills-feature-spec.md).
  // onConflictDoNothing makes re-runs safe (PK = agentId + skillId).
  const agentSkillLinks: Array<{ agentName: string; skillName: string; order: number }> = [
    { agentName: 'Test Quality Reviewer', skillName: 'Test Coverage Nudge', order: 0 },
    { agentName: 'Test Quality Reviewer', skillName: 'Test Quality Patterns', order: 1 },
    { agentName: 'API Contract Reviewer', skillName: 'API Contract Gate', order: 0 },
  ];
  for (const link of agentSkillLinks) {
    const agentId = agentIds[link.agentName];
    const skillId = skillIds[link.skillName];
    if (agentId && skillId) {
      await db
        .insert(t.agentSkills)
        .values({ agentId, skillId, order: link.order, enabled: true })
        .onConflictDoNothing();
    }
  }

  // ---- Lxx: conventions seed (idempotent: guard on existing scan for the repo) ----
  // Seeds one convention_scans row + three candidates (one per status) for the
  // demo repo so the Conventions page renders without a live model call.
  const [existingConventionScan] = await db
    .select({ id: t.conventionScans.id })
    .from(t.conventionScans)
    .where(eq(t.conventionScans.repoId, repoId))
    .limit(1);

  if (!existingConventionScan) {
    const [conventionScan] = await db
      .insert(t.conventionScans)
      .values({
        workspaceId,
        repoId,
        sampleCount: 6,
        provider: DEFAULT_PROVIDER,
        model: DEFAULT_MODEL,
      })
      .returning();

    await db.insert(t.conventions).values([
      {
        workspaceId,
        repoId,
        rule: 'Always use Zod schemas for request body validation in Fastify routes',
        evidencePath: 'src/api/routes.ts',
        evidenceLine: 12,
        evidenceSnippet:
          'const CreateBodySchema = z.object({\n  name: z.string().min(1),\n  amount: z.number().positive(),\n});',
        evidenceUrl:
          'https://github.com/acme/payments-api/blob/main/src/api/routes.ts#L12',
        confidence: 0.92,
        status: 'accepted',
        scanId: conventionScan!.id,
      },
      {
        workspaceId,
        repoId,
        rule: 'Use async/await consistently — never mix .then() callbacks with await in the same function',
        evidencePath: 'src/services/payment.ts',
        evidenceLine: 28,
        evidenceSnippet:
          'async function processPayment(id: string): Promise<Receipt> {\n  const payment = await repo.getById(id);\n  const receipt = await stripe.confirm(payment.intentId);\n  return receipt;\n}',
        evidenceUrl:
          'https://github.com/acme/payments-api/blob/main/src/services/payment.ts#L28',
        confidence: 0.87,
        status: 'suggested',
        scanId: conventionScan!.id,
      },
      {
        workspaceId,
        repoId,
        rule: 'Use implicit return types in short arrow functions',
        evidencePath: 'src/utils/format.ts',
        evidenceLine: 5,
        evidenceSnippet:
          'export const formatAmount = (cents: number) => (cents / 100).toFixed(2);',
        evidenceUrl:
          'https://github.com/acme/payments-api/blob/main/src/utils/format.ts#L5',
        confidence: 0.64,
        status: 'rejected',
        scanId: conventionScan!.id,
      },
    ]);
  }

  return { workspaceId, userId };
}

// CLI entrypoint
if (import.meta.url === `file://${process.argv[1]}`) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }
  const handle = createDb(url);
  seed(handle.db)
    .then(async (r) => {
      console.log('✓ seeded', r);
      await handle.close();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('✗ seed failed:', err);
      await handle.close();
      process.exit(1);
    });
}
