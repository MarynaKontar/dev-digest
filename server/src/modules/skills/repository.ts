import { and, asc, desc, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import { INITIAL_SKILL_VERSION, INITIAL_SKILL_NOTE } from './constants.js';
import { isSkillBodyChange } from './helpers.js';

/**
 * Skills data-access layer. Owns `skills`, `skill_versions`.
 * Workspace-scoped throughout; uses `getById(workspaceId, id)` as the
 * tenant-isolation guard on every mutating method.
 */

import type { SkillRow, SkillVersionRow } from '../../db/rows.js';
export type { SkillRow, SkillVersionRow };

export interface InsertSkill {
  workspaceId: string;
  name: string;
  description: string;
  type: 'rubric' | 'convention' | 'security' | 'custom';
  source: 'manual' | 'imported_url' | 'extracted' | 'community';
  body: string;
  enabled?: boolean;
  evidenceFiles?: string[] | null;
}

export interface UpdateSkill {
  name?: string;
  description?: string;
  type?: 'rubric' | 'convention' | 'security' | 'custom';
  source?: 'manual' | 'imported_url' | 'extracted' | 'community';
  body?: string;
  enabled?: boolean;
  evidenceFiles?: string[] | null;
  /** Optional human-readable change message stored in the new skill_versions row. */
  note?: string;
}

export class SkillsRepository {
  constructor(private db: Db) {}

  async list(workspaceId: string): Promise<SkillRow[]> {
    return this.db.select().from(t.skills).where(eq(t.skills.workspaceId, workspaceId));
  }

  async getById(workspaceId: string, id: string): Promise<SkillRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)));
    return row;
  }

  /** Delete a skill (workspace-scoped). Returns false if no such skill existed. */
  async deleteById(workspaceId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
      .returning({ id: t.skills.id });
    return rows.length > 0;
  }

  /** Insert a skill AND snapshot version 1 (note: "Initial") in skill_versions. */
  async insert(values: InsertSkill): Promise<SkillRow> {
    const [row] = await this.db
      .insert(t.skills)
      .values({
        workspaceId: values.workspaceId,
        name: values.name,
        description: values.description,
        type: values.type,
        source: values.source,
        body: values.body,
        enabled: values.enabled ?? true,
        version: INITIAL_SKILL_VERSION,
        evidenceFiles: values.evidenceFiles ?? null,
      })
      .returning();
    await this.snapshotVersion(row!, INITIAL_SKILL_VERSION, INITIAL_SKILL_NOTE);
    return row!;
  }

  /**
   * Update a skill. Any content change (name/description/type/source/body)
   * bumps the version and snapshots `skill_versions`. Toggling `enabled` only
   * does NOT bump — mirrors the agents `isConfigChange` pattern.
   */
  async update(workspaceId: string, id: string, patch: UpdateSkill): Promise<SkillRow | undefined> {
    const existing = await this.getById(workspaceId, id);
    if (!existing) return undefined;

    const contentChanged = isSkillBodyChange(existing, patch);
    const nextVersion = contentChanged ? existing.version + 1 : existing.version;
    const note = patch.note ?? '';

    const [row] = await this.db
      .update(t.skills)
      .set({
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...(patch.type !== undefined ? { type: patch.type } : {}),
        ...(patch.source !== undefined ? { source: patch.source } : {}),
        ...(patch.body !== undefined ? { body: patch.body } : {}),
        ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
        ...(patch.evidenceFiles !== undefined ? { evidenceFiles: patch.evidenceFiles } : {}),
        ...(contentChanged ? { version: nextVersion } : {}),
      })
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
      .returning();

    if (contentChanged && row) await this.snapshotVersion(row, nextVersion, note);
    return row;
  }

  private async snapshotVersion(row: SkillRow, version: number, note: string): Promise<void> {
    await this.db
      .insert(t.skillVersions)
      .values({ skillId: row.id, version, body: row.body, note })
      .onConflictDoNothing();
  }

  // ---- skill_versions (immutable body snapshots) --------------------------

  /** All body snapshots for a skill, newest version first. */
  async listVersions(skillId: string): Promise<SkillVersionRow[]> {
    return this.db
      .select()
      .from(t.skillVersions)
      .where(eq(t.skillVersions.skillId, skillId))
      .orderBy(desc(t.skillVersions.version));
  }

  /** A single body snapshot, or undefined if that version was never recorded. */
  async getVersion(skillId: string, version: number): Promise<SkillVersionRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.skillVersions)
      .where(
        and(eq(t.skillVersions.skillId, skillId), eq(t.skillVersions.version, version)),
      );
    return row;
  }

  /**
   * Restore an old version's body as a NEW version (Restore button).
   * Never mutates existing history — always appends a new snapshot.
   */
  async restore(
    workspaceId: string,
    skillId: string,
    version: number,
  ): Promise<SkillRow | undefined> {
    const skill = await this.getById(workspaceId, skillId);
    if (!skill) return undefined;
    const snap = await this.getVersion(skillId, version);
    if (!snap) return undefined;

    const nextVersion = skill.version + 1;
    const note = `Restored v${version}`;

    const [row] = await this.db
      .update(t.skills)
      .set({ body: snap.body, version: nextVersion })
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, skillId)))
      .returning();

    if (row) await this.snapshotVersion(row, nextVersion, note);
    return row;
  }

  // ---- agent_skills (skills side: who uses this skill) --------------------

  /** Agents that have this skill linked, ordered by agent name. */
  async agentsUsing(skillId: string): Promise<{ id: string; name: string }[]> {
    const rows = await this.db
      .select({ id: t.agents.id, name: t.agents.name })
      .from(t.agentSkills)
      .innerJoin(t.agents, eq(t.agentSkills.agentId, t.agents.id))
      .where(eq(t.agentSkills.skillId, skillId))
      .orderBy(asc(t.agents.name));
    return rows;
  }
}
