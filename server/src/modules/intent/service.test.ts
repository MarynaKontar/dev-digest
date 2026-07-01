/**
 * service.test.ts — hermetic unit tests for IntentService.ensureIntent.
 *
 * No DB, no Docker, no real LLM calls. All external dependencies are replaced
 * via a mock Container shaped object:
 *
 *   - MockLLMProvider  — returns a canned Intent fixture, records calls.
 *   - MockSpecResolver — returns empty resolved specs by default.
 *   - MockGitHubClient — returns a PR detail with linked_issue: null.
 *   - MockGitClient    — returns the standard mock diff.
 *   - Mock intentRepo  — vi.fn() spies for getByPrId + upsert.
 *   - Mock reviewRepo  — vi.fn() stubs for getPull + getRepo + getPrFiles.
 *   - Mock db          — returns [] for any settings query so resolveFeatureModel
 *                        falls through to the registry default (openrouter).
 *   - Mock tokenizer   — simple chars/4 counter (no BPE init overhead).
 *
 * The Container class is bypassed entirely via `as unknown as Container` — we
 * test the service logic, not the DI composition root.
 */

import { describe, it, expect, vi } from 'vitest';
import { IntentService } from './service.js';
import type { Container } from '../../platform/container.js';
import type { PrIntentRow } from './repository.js';
import type { PullRow } from '../../db/rows.js';
import { PrIntentRecord } from '@devdigest/shared';
import type { StructuredRequest } from '@devdigest/shared';
import { MockLLMProvider, MockSpecResolver, MockGitHubClient, MockGitClient } from '../../adapters/mocks.js';

// ---------------------------------------------------------------------------
// Realistic fixture data (no id: 1 / name: 'test' anti-patterns)
// ---------------------------------------------------------------------------

const WORKSPACE_ID = 'ws-3f7a8c1d-2e4b-4a9f-8c3e-1d2b4a6c8e0f';
const PR_ID = 'pr-a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const REPO_ID = 'repo-9f8e7d6c-5b4a-3210-fedc-ba9876543210';
const PULL_HEAD_SHA = 'f3a8d1c2e4b97650';

/** A realistic PullRow matching the pr under test. */
const TEST_PULL: PullRow = {
  id: PR_ID,
  workspaceId: WORKSPACE_ID,
  repoId: REPO_ID,
  number: 47,
  title: 'Add per-IP rate limiting to authentication endpoints',
  author: 'elena.vasquez',
  branch: 'feat/auth-rate-limit',
  base: 'main',
  headSha: PULL_HEAD_SHA,
  lastReviewedSha: null,
  additions: 83,
  deletions: 12,
  filesCount: 4,
  status: 'open',
  body: '',
  openedAt: new Date('2026-06-15T09:00:00Z'),
  updatedAt: new Date('2026-06-15T14:30:00Z'),
};

/** A realistic repo row. */
const TEST_REPO = {
  id: REPO_ID,
  workspaceId: WORKSPACE_ID,
  owner: 'acme-corp',
  name: 'platform-api',
  fullName: 'acme-corp/platform-api',
  defaultBranch: 'main',
  clonePath: '/mock/clones/acme-corp/platform-api',
  lastPolledAt: null,
  createdBy: null,
  createdAt: new Date('2026-01-10T00:00:00Z'),
};

/** LLM response fixture — a plausible Intent for the test PR. */
const INTENT_FIXTURE = {
  intent: 'Add per-IP rate limiting to prevent brute-force attacks on login endpoints',
  in_scope: [
    'Rate limiting middleware for /auth/login and /auth/refresh',
    'Configurable per-IP request threshold via environment variables',
    'Return 429 Too Many Requests with Retry-After header',
  ],
  out_of_scope: [
    'Database-schema changes',
    'Frontend UI feedback for rate-limited requests',
    'Global (non-per-IP) rate limiting',
  ],
  risk_areas: [
    'Middleware insertion order — must sit before auth handler',
    'Redis availability — rate state is in-memory only without Redis',
  ],
};

// ---------------------------------------------------------------------------
// Mock container factory
// ---------------------------------------------------------------------------

/**
 * Builds a Container-shaped mock object with just the methods IntentService
 * needs. Uses `as unknown as Container` to bypass the class constraint.
 */
function buildMockContainer(opts: {
  /** Stored pr_intent row returned by intentRepo.getByPrId (null = cache miss). */
  cachedIntent?: PrIntentRow | null;
  /** PR body text (used to drive spec resolution). */
  pullBody?: string;
  /** Fixture returned by MockLLMProvider.completeStructured. */
  llmFixture?: unknown;
}): {
  container: Container;
  llm: MockLLMProvider;
  upsertSpy: ReturnType<typeof vi.fn>;
  specResolver: MockSpecResolver;
} {
  const llmFixture = opts.llmFixture ?? INTENT_FIXTURE;
  // MockLLMProvider id accepts 'openai' | 'anthropic'; the provider route is
  // irrelevant here — the mock returns the fixture regardless of which provider
  // the service resolves to (openrouter via the feature-model registry default).
  const mockLlm = new MockLLMProvider('openai', { structured: llmFixture });
  const specResolver = new MockSpecResolver([]);
  const mockGitHub = new MockGitHubClient({ detail: { linked_issue: null } });
  const mockGit = new MockGitClient();

  const pull: PullRow = { ...TEST_PULL, body: opts.pullBody ?? '' };

  const cachedValue = opts.cachedIntent !== undefined ? opts.cachedIntent : null;

  const upsertSpy = vi.fn().mockResolvedValue({
    prId: PR_ID,
    intent: (llmFixture as typeof INTENT_FIXTURE).intent,
    inScope: (llmFixture as typeof INTENT_FIXTURE).in_scope,
    outOfScope: (llmFixture as typeof INTENT_FIXTURE).out_of_scope,
    riskAreas: (llmFixture as typeof INTENT_FIXTURE).risk_areas,
    headSha: PULL_HEAD_SHA,
  } satisfies PrIntentRow);

  // Mock the Drizzle db chain used by resolveFeatureModel:
  // db.select({key,value}).from(t.settings).where(eq(ws, wsId)) → [] (use registry default)
  const mockDb = {
    select: (_fields?: unknown) => ({
      from: (_table: unknown) => ({
        where: async (_cond: unknown): Promise<{ key: string; value: string }[]> => [],
      }),
    }),
  };

  const container = {
    config: { intentSpecMaxTokens: 6000 },
    db: mockDb,
    reviewRepo: {
      getPull: vi.fn().mockResolvedValue(pull),
      getRepo: vi.fn().mockResolvedValue(TEST_REPO),
      getPrFiles: vi.fn().mockResolvedValue([]),
    },
    intentRepo: {
      getByPrId: vi.fn().mockResolvedValue(cachedValue),
      upsert: upsertSpy,
    },
    specResolver,
    github: vi.fn().mockResolvedValue(mockGitHub),
    git: mockGit,
    tokenizer: {
      count: (text: string): number => Math.ceil(text.length / 4),
    },
    llm: vi.fn().mockResolvedValue(mockLlm),
  } as unknown as Container;

  return { container, llm: mockLlm, upsertSpy, specResolver };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('IntentService.ensureIntent', () => {
  it('returns the cached PrIntentRecord without calling the LLM when headSha matches stored row', async () => {
    // Arrange: a stored intent row with the SAME headSha as the current pull.
    const cachedRow: PrIntentRow = {
      prId: PR_ID,
      intent: 'Previously computed intent — add per-IP throttling',
      inScope: ['Rate limiting middleware'],
      outOfScope: [],
      riskAreas: ['Redis availability'],
      headSha: PULL_HEAD_SHA, // matches TEST_PULL.headSha
    };
    const { container, llm } = buildMockContainer({ cachedIntent: cachedRow });
    const svc = new IntentService(container);

    // Act
    const result = await svc.ensureIntent(WORKSPACE_ID, PR_ID);

    // Assert: LLM was never called; cached data flows through.
    expect(llm.calls).toHaveLength(0);
    expect(result.intent).toBe(cachedRow.intent);
    expect(result.risk_areas).toEqual(cachedRow.riskAreas);
    // PrIntentRecord shape is valid per the shared contract.
    expect(PrIntentRecord.safeParse(result).success).toBe(true);
  });

  it('classifies intent without any linked docs, calling the LLM once and persisting the result', async () => {
    // Arrange: no cached row, empty PR body, no spec/issue resolved.
    const { container, llm, upsertSpy } = buildMockContainer({
      cachedIntent: null,
      pullBody: '',
    });
    const svc = new IntentService(container);

    // Act
    const result = await svc.ensureIntent(WORKSPACE_ID, PR_ID);

    // Assert: exactly one structured LLM call.
    const structuredCalls = llm.calls.filter((c) => c.method === 'completeStructured');
    expect(structuredCalls).toHaveLength(1);

    // Result is a valid PrIntentRecord with non-empty intent.
    expect(PrIntentRecord.safeParse(result).success).toBe(true);
    expect(result.intent.length).toBeGreaterThan(0);

    // Upsert was called (persist the classification).
    expect(upsertSpy).toHaveBeenCalledOnce();
  });

  it('writes risk_areas from the LLM fixture through upsert and surfaces them in the returned record', async () => {
    // Arrange: fixture with two concrete risk areas.
    const fixture = {
      intent: 'Refactor auth module to use token-bucket rate limiting',
      in_scope: ['Token-bucket rate limiting', 'Per-IP tracking'],
      out_of_scope: ['OAuth flow changes'],
      risk_areas: [
        'middleware insertion order — must sit before auth handler',
        'Redis availability — state is in-process only without Redis',
      ],
    };
    const { container, upsertSpy } = buildMockContainer({
      cachedIntent: null,
      llmFixture: fixture,
    });
    const svc = new IntentService(container);

    // Act
    const result = await svc.ensureIntent(WORKSPACE_ID, PR_ID);

    // Assert: upsert received the exact risk_areas from the fixture.
    expect(upsertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ riskAreas: fixture.risk_areas }),
    );

    // Assert: caller receives the same risk_areas in the returned record.
    expect(result.risk_areas).toEqual(fixture.risk_areas);
  });

  it('passes only hunk headers (no diff patch bodies) to the LLM and logs token-savings', async () => {
    // Arrange: mock logger with a spy.
    const { container, llm } = buildMockContainer({ cachedIntent: null });
    const logSpy = { info: vi.fn(), warn: vi.fn() };
    const svc = new IntentService(container);

    // Act
    await svc.ensureIntent(WORKSPACE_ID, PR_ID, logSpy);

    // --- Assert: classifier input excludes diff patch body content ---
    const structuredCall = llm.calls.find((c) => c.method === 'completeStructured');
    expect(structuredCall).toBeDefined();

    // The user message (index 1) is the classifier input assembled from hunk headers.
    const req = structuredCall!.req as StructuredRequest<unknown>;
    const userMessage = req.messages.find((m) => m.role === 'user');
    expect(userMessage).toBeDefined();

    const classifierInput = userMessage!.content;

    // MockGitClient default diff contains "stripeKey" as a patch body line.
    // That line MUST NOT appear in the classifier input (only hunk headers are included).
    expect(classifierInput).not.toContain('stripeKey');

    // Hunk headers (@@ lines) MUST be present.
    expect(classifierInput).toContain('@@ -');

    // --- Assert: logger received token-savings data ---
    expect(logSpy.info).toHaveBeenCalledWith(
      expect.objectContaining({
        tokensFull: expect.any(Number),
        tokensIntent: expect.any(Number),
        saved: expect.any(Number),
      }),
      'intent token savings',
    );
  });

  it('stores the PR headSha in the upsert call for cache-invalidation on future pushes', async () => {
    // Arrange
    const { container, upsertSpy } = buildMockContainer({ cachedIntent: null });
    const svc = new IntentService(container);

    // Act
    await svc.ensureIntent(WORKSPACE_ID, PR_ID);

    // Assert: upsert received the pull's current headSha.
    expect(upsertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ headSha: PULL_HEAD_SHA }),
    );
  });
});
