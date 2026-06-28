import { asc, desc, eq, inArray } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

/**
 * Conventions data-access layer. Owns `conventions` and `convention_scans`.
 * Methods are intentionally un-workspace-scoped at this layer (the service
 * layer holds the workspace context); foreign-key cascades enforce tenancy.
 */

import type { ConventionRow, ConventionScanRow } from '../../db/rows.js';
export type { ConventionRow, ConventionScanRow };

/** Verified candidate ready to be persisted via `replaceAll`. */
export interface InsertConventionItem {
  workspaceId: string;
  rule: string;
  evidencePath: string;
  evidenceLine: number;
  evidenceSnippet: string;
  evidenceUrl: string;
  confidence: number;
  status?: 'suggested' | 'accepted' | 'rejected';
}

export class ConventionsRepository {
  constructor(private db: Db) {}

  // ---- Scans ---------------------------------------------------------------

  /** Insert a new scan record and return the persisted row. */
  async createScan(
    workspaceId: string,
    repoId: string,
    opts: { sampleCount: number; provider: string; model: string },
  ): Promise<ConventionScanRow> {
    const [row] = await this.db
      .insert(t.conventionScans)
      .values({
        workspaceId,
        repoId,
        sampleCount: opts.sampleCount,
        provider: opts.provider,
        model: opts.model,
      })
      .returning();
    return row!;
  }

  /** Return the most-recent scan for the given repo, or undefined if none. */
  async latestScan(repoId: string): Promise<ConventionScanRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.conventionScans)
      .where(eq(t.conventionScans.repoId, repoId))
      .orderBy(desc(t.conventionScans.createdAt))
      .limit(1);
    return row;
  }

  // ---- Candidates ----------------------------------------------------------

  /**
   * All candidates for a repo, ordered by status (asc) then confidence (desc).
   * Alphabetical status order: accepted → rejected → suggested.
   */
  async listCandidates(repoId: string): Promise<ConventionRow[]> {
    return this.db
      .select()
      .from(t.conventions)
      .where(eq(t.conventions.repoId, repoId))
      .orderBy(asc(t.conventions.status), desc(t.conventions.confidence));
  }

  /** Look up a single candidate by id. */
  async getCandidate(id: string): Promise<ConventionRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.conventions)
      .where(eq(t.conventions.id, id));
    return row;
  }

  /**
   * Atomically replace all candidates for a repo:
   *  1. Delete every existing convention row for `repoId`.
   *  2. Insert the freshly-verified set, linking each to `scanId`.
   *
   * LOCKED per requirement #6: prior accept/reject decisions are discarded.
   * A re-scan always starts from a clean slate.
   */
  async replaceAll(
    repoId: string,
    scanId: string,
    items: InsertConventionItem[],
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.delete(t.conventions).where(eq(t.conventions.repoId, repoId));
      if (items.length > 0) {
        await tx.insert(t.conventions).values(
          items.map((item) => ({
            workspaceId: item.workspaceId,
            repoId,
            rule: item.rule,
            evidencePath: item.evidencePath,
            evidenceLine: item.evidenceLine,
            evidenceSnippet: item.evidenceSnippet,
            evidenceUrl: item.evidenceUrl,
            confidence: item.confidence,
            status: (item.status ?? 'suggested') as 'suggested' | 'accepted' | 'rejected',
            scanId,
          })),
        );
      }
    });
  }

  // ---- Judge ---------------------------------------------------------------

  /** Set the status of a single candidate. Returns the updated row, or undefined. */
  async setStatus(
    id: string,
    status: 'suggested' | 'accepted' | 'rejected',
  ): Promise<ConventionRow | undefined> {
    const [row] = await this.db
      .update(t.conventions)
      .set({ status })
      .where(eq(t.conventions.id, id))
      .returning();
    return row;
  }

  /** Set the status of multiple candidates in one statement. */
  async setStatusBulk(
    ids: string[],
    status: 'suggested' | 'accepted' | 'rejected',
  ): Promise<ConventionRow[]> {
    if (ids.length === 0) return [];
    return this.db
      .update(t.conventions)
      .set({ status })
      .where(inArray(t.conventions.id, ids))
      .returning();
  }

  // ---- Materialise ---------------------------------------------------------

  /** Link one or more candidates to the skill that materialised them. */
  async setSkillId(ids: string[], skillId: string): Promise<void> {
    if (ids.length === 0) return;
    await this.db
      .update(t.conventions)
      .set({ skillId })
      .where(inArray(t.conventions.id, ids));
  }
}
