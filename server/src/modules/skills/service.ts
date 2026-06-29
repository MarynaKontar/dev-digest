import type { Container } from '../../platform/container.js';
import type { Skill, SkillVersion, SkillImportPreview, SkillStats } from '@devdigest/shared';
import { SkillsRepository } from './repository.js';
import type { InsertSkill, UpdateSkill } from './repository.js';
import { toSkillDto, toSkillVersionDto, parseSkillUpload, stableHash, placeholderStats } from './helpers.js';

/**
 * Skills service. Business logic for the Skills library + import pipeline.
 * A skill = name + description + type + markdown body. Body changes are
 * versioned via `skill_versions` (repository). No model or provider attached.
 */

export class SkillsService {
  private repo: SkillsRepository;

  constructor(private container: Container) {
    this.repo = new SkillsRepository(container.db);
  }

  async list(workspaceId: string): Promise<Skill[]> {
    const rows = await this.repo.list(workspaceId);
    return rows.map(toSkillDto);
  }

  async get(workspaceId: string, id: string): Promise<Skill | undefined> {
    const row = await this.repo.getById(workspaceId, id);
    return row ? toSkillDto(row) : undefined;
  }

  async delete(workspaceId: string, id: string): Promise<boolean> {
    return this.repo.deleteById(workspaceId, id);
  }

  async create(workspaceId: string, input: Omit<InsertSkill, 'workspaceId'>): Promise<Skill> {
    const row = await this.repo.insert({ workspaceId, ...input });
    return toSkillDto(row);
  }

  async update(
    workspaceId: string,
    id: string,
    patch: UpdateSkill,
  ): Promise<Skill | undefined> {
    const row = await this.repo.update(workspaceId, id, patch);
    return row ? toSkillDto(row) : undefined;
  }

  /**
   * Config history for a skill, newest version first. Returns undefined when the
   * skill isn't in this workspace (maps to 404 at the route level).
   */
  async listVersions(workspaceId: string, skillId: string): Promise<SkillVersion[] | undefined> {
    const skill = await this.repo.getById(workspaceId, skillId);
    if (!skill) return undefined;
    const rows = await this.repo.listVersions(skillId);
    return rows.map(toSkillVersionDto);
  }

  /**
   * A single body snapshot. Returns undefined when the skill isn't in this
   * workspace OR that version was never recorded (route → 404).
   */
  async getVersion(
    workspaceId: string,
    skillId: string,
    version: number,
  ): Promise<SkillVersion | undefined> {
    const skill = await this.repo.getById(workspaceId, skillId);
    if (!skill) return undefined;
    const row = await this.repo.getVersion(skillId, version);
    return row ? toSkillVersionDto(row) : undefined;
  }

  /**
   * Restore an old body as a NEW version. Never mutates history.
   * Returns undefined when the skill or version doesn't exist (route → 404).
   */
  async restore(
    workspaceId: string,
    skillId: string,
    version: number,
  ): Promise<Skill | undefined> {
    const row = await this.repo.restore(workspaceId, skillId, version);
    return row ? toSkillDto(row) : undefined;
  }

  /**
   * Stats for the Stats tab (GET /skills/:id/stats).
   *
   * `used_by` and `agents` are REAL (join on agent_skills).
   * `pull_rate`, `accept_rate`, `findings_30d`, `by_category` are ILLUSTRATIVE
   * placeholders — findings are not yet tagged per-skill in the current schema.
   * Values are derived from a deterministic hash of the skill id so they are
   * stable across reloads. See spec §3.6 option (a).
   */
  async stats(workspaceId: string, id: string): Promise<SkillStats | undefined> {
    const skill = await this.repo.getById(workspaceId, id);
    if (!skill) return undefined;

    const agents = await this.repo.agentsUsing(id);
    const demo = placeholderStats(stableHash(id));

    return {
      used_by: agents.length,
      agents,
      ...demo,
    };
  }

  /**
   * Parse a skill upload (`.md` or `.zip`) and return a SkillImportPreview.
   * No DB write — save is a separate POST /skills from the client after confirm.
   */
  async importFromUpload(buffer: Buffer, filename: string): Promise<SkillImportPreview> {
    const preview = parseSkillUpload(buffer, filename);
    const token_estimate = this.container.tokenizer.count(preview.body);
    return { ...preview, token_estimate };
  }
}
