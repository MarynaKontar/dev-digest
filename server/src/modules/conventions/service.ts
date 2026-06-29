import type { Container } from '../../platform/container.js';
import type {
  ConventionsView,
  ConventionCandidate,
  ConventionScan,
  Skill,
  CreateConventionSkillBody,
} from '@devdigest/shared';
import { NotFoundError, ValidationError } from '../../platform/errors.js';
import { RepoRepository } from '../repos/repository.js';
import { SkillsService } from '../skills/service.js';
import { resolveFeatureModel } from '../settings/feature-models.js';
import { extractConventions } from './extractor.js';
import { buildEvidenceUrl } from './helpers.js';
import { SAMPLE_FILES } from './constants.js';
import type { ConventionRow, ConventionScanRow } from './repository.js';

/**
 * Config files to attempt reading from the repo root.
 * Missing/uncloned files are silently skipped.
 */
const CONFIG_PATHS = [
  'eslint.config.js',
  'eslint.config.mjs',
  'eslint.config.cjs',
  'eslint.config.ts',
  '.eslintrc',
  '.eslintrc.json',
  '.eslintrc.js',
  '.eslintrc.cjs',
  '.eslintrc.yml',
  '.eslintrc.yaml',
  'tsconfig.json',
  '.prettierrc',
  '.prettierrc.json',
  '.prettierrc.js',
  '.prettierrc.cjs',
  '.prettierrc.yml',
  '.prettierrc.yaml',
  'prettier.config.js',
  'prettier.config.cjs',
  'prettier.config.mjs',
  'biome.json',
  'biome.jsonc',
  '.editorconfig',
];

// ---- DTO converters ----------------------------------------------------------

function toScanDto(row: ConventionScanRow): ConventionScan {
  return {
    id: row.id,
    repo_id: row.repoId,
    sample_count: row.sampleCount,
    model: row.model,
    created_at: row.createdAt.toISOString(),
  };
}

function toCandidateDto(row: ConventionRow): ConventionCandidate {
  return {
    id: row.id,
    repo_id: row.repoId ?? '',
    rule: row.rule,
    evidence_path: row.evidencePath ?? '',
    evidence_line: row.evidenceLine ?? 0,
    evidence_snippet: row.evidenceSnippet ?? '',
    evidence_url: row.evidenceUrl,
    confidence: row.confidence ?? 0,
    status: row.status,
    skill_id: row.skillId,
  };
}

// ---- Service -----------------------------------------------------------------

export class ConventionsService {
  private repoRepo: RepoRepository;
  private skillsService: SkillsService;

  constructor(private container: Container) {
    this.repoRepo = new RepoRepository(container.db);
    this.skillsService = new SkillsService(container);
  }

  /**
   * Run the full extraction pipeline for the given repo:
   *   read config files + sample files → LLM → verify evidence → persist → return view.
   * A re-scan replaces ALL existing candidates (locked — §3.4).
   */
  async extract(ws: string, repoId: string): Promise<ConventionsView> {
    const repo = await this.repoRepo.getById(ws, repoId);
    if (!repo) throw new NotFoundError('Repo not found');

    const repoRef = { owner: repo.owner, name: repo.name };

    // 1. Config files (code — no model)
    const configFiles: { path: string; content: string }[] = [];
    for (const path of CONFIG_PATHS) {
      try {
        const content = await this.container.git.readFile(repoRef, path);
        if (content) configFiles.push({ path, content });
      } catch {
        // missing or uncloned — skip silently
      }
    }

    // 2. Sample files (code — no model)
    const samplePaths = await this.container.repoIntel.getConventionSamples(repoId, SAMPLE_FILES);
    const sampleFiles: { path: string; content: string }[] = [];
    for (const path of samplePaths) {
      try {
        const content = await this.container.git.readFile(repoRef, path);
        sampleFiles.push({ path, content });
      } catch {
        // skip
      }
    }

    const files = [...configFiles, ...sampleFiles];

    // 3. Resolve the workspace's conventions feature model
    const { provider, model } = await resolveFeatureModel(this.container, ws, 'conventions');
    const llm = await this.container.llm(provider);

    // 4. LLM call + evidence verification (extractor.ts — pure except LLM)
    const verified = await extractConventions({ repoName: repo.name, files, llm, model });

    // 5. Persist: create scan then atomically replace candidates
    const scan = await this.container.conventionsRepo.createScan(ws, repoId, {
      sampleCount: files.length,
      provider,
      model,
    });

    const insertItems = verified.map((v) => ({
      workspaceId: ws,
      rule: v.rule,
      evidencePath: v.evidence_path,
      evidenceLine: v.evidence_line,
      evidenceSnippet: v.evidence_snippet,
      evidenceUrl: buildEvidenceUrl(
        repo.fullName,
        repo.defaultBranch,
        v.evidence_path,
        v.evidence_line,
      ),
      confidence: v.confidence,
      status: 'suggested' as const,
    }));

    await this.container.conventionsRepo.replaceAll(repoId, scan.id, insertItems);

    // 6. Return the current view (latestScan + listCandidates)
    return this.view(ws, repoId);
  }

  /** Return the latest scan + current candidates for the repo. */
  async view(ws: string, repoId: string): Promise<ConventionsView> {
    // ws unused — kept for symmetry + future workspace-scoped enforcement
    void ws;
    const [scan, candidates] = await Promise.all([
      this.container.conventionsRepo.latestScan(repoId),
      this.container.conventionsRepo.listCandidates(repoId),
    ]);
    return {
      scan: scan ? toScanDto(scan) : null,
      candidates: candidates.map(toCandidateDto),
    };
  }

  /** Accept or reject a single candidate. */
  async judge(
    _ws: string,
    repoId: string,
    candidateId: string,
    status: 'suggested' | 'accepted' | 'rejected',
  ): Promise<ConventionCandidate> {
    const row = await this.container.conventionsRepo.setStatus(candidateId, status);
    if (!row || row.repoId !== repoId) throw new NotFoundError('Candidate not found');
    return toCandidateDto(row);
  }

  /** Bulk-update the status of multiple candidates. */
  async judgeBulk(
    _ws: string,
    _repoId: string,
    ids: string[],
    status: 'suggested' | 'accepted' | 'rejected',
  ): Promise<ConventionCandidate[]> {
    const rows = await this.container.conventionsRepo.setStatusBulk(ids, status);
    return rows.map(toCandidateDto);
  }

  /**
   * Materialise a set of accepted candidates into a new skill.
   * All candidate_ids must be 'accepted' and belong to `repoId`; any violation
   * throws a 422 ValidationError (mirrors the pattern used in other modules).
   */
  async createSkill(
    ws: string,
    repoId: string,
    body: CreateConventionSkillBody,
  ): Promise<Skill> {
    // Load and validate all candidates
    const candidates = await Promise.all(
      body.candidate_ids.map((id) => this.container.conventionsRepo.getCandidate(id)),
    );
    for (const c of candidates) {
      if (!c) throw new ValidationError('Candidate not found');
      if (c.repoId !== repoId)
        throw new ValidationError('Candidate does not belong to this repo');
      if (c.status !== 'accepted')
        throw new ValidationError('Only accepted candidates can be materialised into a skill');
    }

    // Collect unique evidence paths for the skill's evidenceFiles field
    const evidenceFiles = [
      ...new Set(
        candidates.map((c) => c!.evidencePath).filter((p): p is string => p !== null),
      ),
    ];

    // Create the skill — SkillsService.create snapshots body as version 1
    const skill = await this.skillsService.create(ws, {
      name: body.name,
      description: body.description,
      type: body.type,
      source: 'extracted',
      enabled: body.enabled,
      body: body.body,
      evidenceFiles,
    });

    // Link all materialised candidates to the new skill
    await this.container.conventionsRepo.setSkillId(body.candidate_ids, skill.id);

    return skill;
  }
}
