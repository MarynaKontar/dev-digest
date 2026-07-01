import { eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

/**
 * IntentRepository — infra layer for `pr_intent` rows.
 *
 * Owns READ and UPSERT for the intent cache. The service (application layer)
 * drives the LLM call and cache logic; this class only persists/retrieves.
 *
 * Note: `modules/reviews/repository/pull.repo.ts` also has `getIntent` /
 * `upsertIntent` helpers (legacy scaffolding). Those are kept as-is to avoid
 * touching a file outside this unit's scope. This repository is the one used
 * by IntentService and is the canonical write path for the intent module.
 */

export type PrIntentRow = typeof t.prIntent.$inferSelect;

/** Input shape for upsert — maps to the pr_intent table columns. */
export interface UpsertIntentInput {
  prId: string;
  intent: string;
  /** Pass typed string[] directly — never cast to object (Drizzle jsonb rule). */
  inScope: string[];
  /** Pass typed string[] directly — never cast to object (Drizzle jsonb rule). */
  outOfScope: string[];
  /** Pass typed string[] directly — never cast to object (Drizzle jsonb rule). */
  riskAreas: string[];
  /** The PR's headSha at time of classification; drives the cache short-circuit. */
  headSha: string;
}

export class IntentRepository {
  constructor(private db: Db) {}

  /**
   * Look up a stored intent by PR id.
   * Returns `null` when no intent has been computed yet for this PR.
   * The `headSha` field enables the cache check in `IntentService.ensureIntent`.
   */
  async getByPrId(prId: string): Promise<PrIntentRow | null> {
    const [row] = await this.db
      .select()
      .from(t.prIntent)
      .where(eq(t.prIntent.prId, prId));
    return row ?? null;
  }

  /**
   * Insert or update the intent for a PR (keyed on `prId`).
   *
   * Drizzle rule: pass typed `string[]` directly to jsonb columns — never
   * cast to `object`, which breaks Drizzle's overloaded `.values()` signatures.
   */
  async upsert(input: UpsertIntentInput): Promise<PrIntentRow> {
    const [row] = await this.db
      .insert(t.prIntent)
      .values({
        prId: input.prId,
        intent: input.intent,
        inScope: input.inScope,
        outOfScope: input.outOfScope,
        riskAreas: input.riskAreas,
        headSha: input.headSha,
      })
      .onConflictDoUpdate({
        target: t.prIntent.prId,
        set: {
          intent: input.intent,
          inScope: input.inScope,
          outOfScope: input.outOfScope,
          riskAreas: input.riskAreas,
          headSha: input.headSha,
        },
      })
      .returning();
    return row!;
  }
}
