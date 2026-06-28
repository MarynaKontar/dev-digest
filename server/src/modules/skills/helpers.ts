import AdmZip from 'adm-zip';
import type { Skill, SkillVersion, SkillImportPreview, SkillType, SkillSource } from '@devdigest/shared';
import type { SkillRow, SkillVersionRow } from '../../db/rows.js';
import { ValidationError } from '../../platform/errors.js';

/**
 * Pure helpers for the skills module — DTO mappers, version-bump rule, and
 * the upload import parser (pure: no DB or network calls). All testable without
 * a running server.
 */

// ---- DTO mappers ------------------------------------------------------------

/** Map a persisted skill row to the public `Skill` DTO. */
export function toSkillDto(row: SkillRow): Skill {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    type: row.type as SkillType,
    source: row.source as SkillSource,
    body: row.body,
    enabled: row.enabled,
    version: row.version,
    evidence_files: (row.evidenceFiles as string[] | null | undefined) ?? null,
  };
}

/** Map a persisted `skill_versions` row to the public `SkillVersion` DTO. */
export function toSkillVersionDto(row: SkillVersionRow): SkillVersion {
  return {
    skill_id: row.skillId,
    version: row.version,
    body: row.body,
    note: row.note,
    created_at: row.createdAt.toISOString(),
  };
}

// ---- Version-bump rule (mirrors agents `isConfigChange`) --------------------

/**
 * True when a patch changes skill content (vs. just toggling `enabled`) — a
 * content change bumps the version and writes a `skill_versions` snapshot.
 * Mirrors the agents module's `isConfigChange` pattern.
 */
export function isSkillBodyChange(
  existing: Pick<SkillRow, 'name' | 'description' | 'type' | 'source' | 'body'>,
  patch: {
    name?: string;
    description?: string;
    type?: string;
    source?: string;
    body?: string;
  },
): boolean {
  return (
    (patch.name !== undefined && patch.name !== existing.name) ||
    (patch.description !== undefined && patch.description !== existing.description) ||
    (patch.type !== undefined && patch.type !== existing.type) ||
    (patch.source !== undefined && patch.source !== existing.source) ||
    (patch.body !== undefined && patch.body !== existing.body)
  );
}

// ---- Placeholder stats (§3.6 option a) -------------------------------------

/**
 * Stable numeric hash of a string (UUID → uint32). Used to derive deterministic
 * demo numbers for skill stats where true per-skill attribution isn't available.
 */
export function stableHash(id: string): number {
  let h = 0;
  for (const c of id) {
    h = ((h * 31) + c.charCodeAt(0)) >>> 0;
  }
  return h;
}

const DEMO_CATEGORIES = ['security', 'correctness', 'style', 'performance', 'testing'] as const;

/**
 * Derive deterministic ILLUSTRATIVE stats from a skill id hash.
 *
 * NOTE: `pull_rate`, `accept_rate`, `findings_30d`, and `by_category` are demo
 * placeholders — findings are not yet tagged per-skill in the current schema, so
 * true per-skill rates cannot be derived. See spec §3.6 option (a). Only
 * `used_by` and `agents` (computed from `agent_skills`) are real.
 */
export function placeholderStats(hash: number): {
  pull_rate: number;
  accept_rate: number;
  findings_30d: number;
  by_category: { category: string; count: number }[];
} {
  // Use unsigned right shifts (`>>>`) throughout — JS bitwise ops coerce to a
  // SIGNED 32-bit int, so a uint32 hash above 2^31 would go negative and the
  // subsequent `% n` would yield negative counts.
  // pull_rate: 0.20–0.80 (illustrative)
  const pull_rate = Math.round((0.20 + (hash % 60) / 100) * 100) / 100;
  // accept_rate: 0.40–0.90 (illustrative)
  const accept_rate = Math.round((0.40 + ((hash >>> 8) % 50) / 100) * 100) / 100;
  // findings_30d: 3–52 (illustrative)
  const findings_30d = 3 + ((hash >>> 16) % 50);

  // by_category: 3–4 categories with deterministic counts (illustrative)
  const numCats = 3 + (hash % 2);
  const by_category = Array.from({ length: numCats }, (_, i) => ({
    category: DEMO_CATEGORIES[(hash + i * 7) % DEMO_CATEGORIES.length]!,
    count: 2 + ((hash >>> (i * 4)) % 20),
  }));

  return { pull_rate, accept_rate, findings_30d, by_category };
}

// ---- Import parser ----------------------------------------------------------

/** Extract name + description from markdown body text. */
function parseMdMeta(
  text: string,
  filenameHint: string,
): { name: string; description: string } {
  const lines = text.split('\n');

  // Name: first `# H1` or filename without extension
  const h1Line = lines.find((l) => /^# .+/.test(l));
  const name = h1Line
    ? h1Line.replace(/^# /, '').trim()
    : filenameHint.replace(/\.md$/i, '').replace(/[-_]/g, ' ');

  // Description: first non-empty paragraph that appears AFTER the H1 heading
  // and BEFORE the next heading (##, ###, ...). A blank line ends the paragraph.
  // When the region between the H1 and the next heading is empty, falls back to name.
  let pastH1 = !h1Line; // when there is no H1, collect from the start
  const descLines: string[] = [];
  let inParagraph = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('#')) {
      if (!pastH1) {
        pastH1 = true; // consumed the H1; start collecting on the next pass
        continue;
      }
      // Any subsequent heading stops the search — description region is over.
      break;
    }
    if (!pastH1) continue;
    if (trimmed === '') {
      if (inParagraph) break; // blank line ends the paragraph
      continue;
    }
    descLines.push(trimmed);
    inParagraph = true;
  }

  return { name, description: descLines.join(' ') || name };
}

/** Parse a `.md` buffer → preview fields (sans `token_estimate`). */
function parseMdUpload(
  buffer: Buffer,
  filename: string,
): Omit<SkillImportPreview, 'token_estimate'> {
  const body = buffer.toString('utf-8');
  const { name, description } = parseMdMeta(body, filename);
  return { name, description, type: 'custom', body, source: 'imported_url', dropped_files: [] };
}

/**
 * Parse a `.zip` buffer → preview fields (sans `token_estimate`).
 *
 * Only the markdown core (`SKILL.md` or first `*.md`) is extracted and read.
 * All non-markdown entries are listed in `dropped_files`; NOTHING is executed.
 */
function parseZipUpload(
  buffer: Buffer,
  filename: string,
): Omit<SkillImportPreview, 'token_estimate'> {
  let zip: InstanceType<typeof AdmZip>;
  try {
    zip = new AdmZip(buffer);
  } catch {
    throw new ValidationError(
      `Could not open "${filename}" as a zip archive — it may be corrupt or password-protected.`,
    );
  }

  const entries = zip.getEntries().filter((e) => !e.isDirectory);
  const mdEntries = entries.filter((e) => e.name.toLowerCase().endsWith('.md'));
  const nonMdEntries = entries.filter((e) => !e.name.toLowerCase().endsWith('.md'));
  const dropped_files = nonMdEntries.map((e) => e.entryName);

  // Prefer SKILL.md (case-insensitive) else first *.md
  const target =
    mdEntries.find((e) => e.name.toLowerCase() === 'skill.md') ?? mdEntries[0];

  if (!target) {
    throw new ValidationError('No .md file found in the zip archive.');
  }

  const body = target.getData().toString('utf-8');
  const { name, description } = parseMdMeta(body, target.name);

  return { name, description, type: 'custom', body, source: 'community', dropped_files };
}

/**
 * Parse a skill upload (`.md` or `.zip`) → preview fields without token estimate.
 * Token estimate is added by SkillsService (which has access to the tokenizer).
 * Throws `ValidationError` for unsupported file types or corrupt archives.
 */
export function parseSkillUpload(
  buffer: Buffer,
  filename: string,
): Omit<SkillImportPreview, 'token_estimate'> {
  const ext = filename.split('.').pop()?.toLowerCase();
  if (ext === 'zip') return parseZipUpload(buffer, filename);
  if (ext === 'md') return parseMdUpload(buffer, filename);
  throw new ValidationError(
    `Unsupported file type ".${ext ?? ''}". Only .md and .zip are accepted.`,
  );
}
