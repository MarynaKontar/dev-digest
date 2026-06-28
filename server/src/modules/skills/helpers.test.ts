import { describe, it, expect } from 'vitest';
import { parseSkillUpload, isSkillBodyChange, toSkillDto, toSkillVersionDto, stableHash, placeholderStats } from './helpers.js';

// Unit tests for skills/helpers.ts — pure logic, no DB or network.
// Server unit-test command: pnpm exec vitest run --exclude '**\/*.it.test.ts'

// ---- .md upload parsing ----------------------------------------------------

describe('parseSkillUpload — .md', () => {
  it('extracts name from first # H1 and description from first paragraph', () => {
    const md = `# My Skill Name

This is the skill description. It spans one paragraph.

## Details

More content here.
`;
    const result = parseSkillUpload(Buffer.from(md), 'my-skill.md');
    expect(result.name).toBe('My Skill Name');
    expect(result.description).toBe('This is the skill description. It spans one paragraph.');
    expect(result.body).toBe(md);
    expect(result.source).toBe('imported_url');
    expect(result.type).toBe('custom');
    expect(result.dropped_files).toEqual([]);
  });

  it('falls back to filename when no H1 is present', () => {
    const md = `Some content without a heading.

More stuff.
`;
    const result = parseSkillUpload(Buffer.from(md), 'my-security-rule.md');
    expect(result.name).toBe('my security rule');
    expect(result.description).toBe('Some content without a heading.');
  });

  it('uses name as description when no paragraph precedes first heading', () => {
    const md = `# Only A Heading

## Section One

Content here.
`;
    const result = parseSkillUpload(Buffer.from(md), 'stub.md');
    expect(result.name).toBe('Only A Heading');
    expect(result.description).toBe('Only A Heading'); // fallback to name
  });
});

// ---- .zip upload parsing ----------------------------------------------------

describe('parseSkillUpload — .zip', () => {
  // Build a minimal zip in memory using adm-zip for the test fixtures.
  // We import it dynamically to avoid a top-level import that complicates test isolation.
  const createZip = async (files: Record<string, string>): Promise<Buffer> => {
    const AdmZip = (await import('adm-zip')).default;
    const zip = new AdmZip();
    for (const [name, content] of Object.entries(files)) {
      zip.addFile(name, Buffer.from(content));
    }
    return zip.toBuffer();
  };

  it('picks SKILL.md when present', async () => {
    const skillMd = '# The Skill\n\nThis is the skill description.\n';
    const otherMd = '# Other\n\nIgnored.\n';
    const zipBuf = await createZip({ 'SKILL.md': skillMd, 'other.md': otherMd });
    const result = parseSkillUpload(zipBuf, 'bundle.zip');
    expect(result.name).toBe('The Skill');
    expect(result.description).toBe('This is the skill description.');
    expect(result.source).toBe('community');
  });

  it('falls back to first *.md when no SKILL.md exists', async () => {
    const content = '# Fallback\n\nFallback description.\n';
    const zipBuf = await createZip({ 'rules.md': content, 'README.md': '# README\n\nIgnored.\n' });
    const result = parseSkillUpload(zipBuf, 'bundle.zip');
    // Should pick first .md (rules.md or README.md depending on insertion order)
    expect(result.source).toBe('community');
    expect(result.body).toBeTruthy();
  });

  it('lists non-markdown entries in dropped_files', async () => {
    const zipBuf = await createZip({
      'SKILL.md': '# Skill\n\nDesc.\n',
      'install.sh': '#!/bin/bash\nrm -rf /',
      'config.json': '{"key":"value"}',
    });
    const result = parseSkillUpload(zipBuf, 'bundle.zip');
    expect(result.dropped_files).toHaveLength(2);
    expect(result.dropped_files).toContain('install.sh');
    expect(result.dropped_files).toContain('config.json');
  });

  it('throws ValidationError when zip has no markdown file', async () => {
    const zipBuf = await createZip({ 'script.py': 'print("hello")' });
    expect(() => parseSkillUpload(zipBuf, 'bad.zip')).toThrow(
      'No .md file found in the zip archive.',
    );
  });

  it('throws ValidationError for corrupt zip', () => {
    const notAZip = Buffer.from('this is not a zip file');
    expect(() => parseSkillUpload(notAZip, 'bad.zip')).toThrow();
  });

  it('never includes executables in the body', async () => {
    const zipBuf = await createZip({
      'SKILL.md': '# Safe\n\nContent.\n',
      'setup.sh': '#!/bin/bash\necho "PWNED"',
      'malware.exe': '\x4d\x5a',
    });
    const result = parseSkillUpload(zipBuf, 'bundle.zip');
    expect(result.body).not.toContain('PWNED');
    expect(result.body).not.toContain('MZ');
    expect(result.dropped_files).toContain('setup.sh');
    expect(result.dropped_files).toContain('malware.exe');
  });
});

// ---- Unsupported file type -------------------------------------------------

describe('parseSkillUpload — unsupported type', () => {
  it('throws for .txt files', () => {
    expect(() => parseSkillUpload(Buffer.from('content'), 'skill.txt')).toThrow(
      'Unsupported file type',
    );
  });
});

// ---- Version-bump rule -----------------------------------------------------

describe('isSkillBodyChange', () => {
  // Use `as const` so TypeScript narrows the enum types correctly.
  const base = {
    name: 'Test Skill',
    description: 'A description',
    type: 'rubric' as const,
    source: 'manual' as const,
    body: '## Rule\nDo the thing.',
  };

  it('returns true when body changes', () => {
    expect(isSkillBodyChange(base, { body: '## Updated Rule\nDo the thing better.' })).toBe(true);
  });

  it('returns true when name changes', () => {
    expect(isSkillBodyChange(base, { name: 'Renamed Skill' })).toBe(true);
  });

  it('returns true when description changes', () => {
    expect(isSkillBodyChange(base, { description: 'New description' })).toBe(true);
  });

  it('returns true when type changes', () => {
    expect(isSkillBodyChange(base, { type: 'security' })).toBe(true);
  });

  it('returns false when no relevant fields change', () => {
    expect(isSkillBodyChange(base, {})).toBe(false);
  });

  it('returns false when only enabled is in patch (not tracked here)', () => {
    // enabled is not a param of isSkillBodyChange — toggling it never bumps version
    expect(isSkillBodyChange(base, {})).toBe(false);
  });

  it('returns false when patch value equals existing value', () => {
    expect(isSkillBodyChange(base, { name: 'Test Skill', body: '## Rule\nDo the thing.' })).toBe(false);
  });
});

// ---- DTO mappers -----------------------------------------------------------

describe('toSkillDto', () => {
  it('maps a SkillRow to a Skill DTO', () => {
    const row = {
      id: 'abc-123',
      workspaceId: 'ws-1',
      name: 'Test',
      description: 'Desc',
      type: 'rubric' as const,
      source: 'manual' as const,
      body: 'body text',
      enabled: true,
      version: 2,
      evidenceFiles: ['file.ts'],
      createdAt: new Date('2024-01-01'),
    };
    const dto = toSkillDto(row);
    expect(dto.id).toBe('abc-123');
    expect(dto.enabled).toBe(true);
    expect(dto.version).toBe(2);
    expect(dto.evidence_files).toEqual(['file.ts']);
  });

  it('maps null evidenceFiles to null', () => {
    const row = {
      id: 'abc-123',
      workspaceId: 'ws-1',
      name: 'Test',
      description: 'Desc',
      type: 'custom' as const,
      source: 'manual' as const,
      body: 'body text',
      enabled: true,
      version: 1,
      evidenceFiles: null,
      createdAt: new Date(),
    };
    expect(toSkillDto(row).evidence_files).toBeNull();
  });
});

describe('toSkillVersionDto', () => {
  it('maps a SkillVersionRow to a SkillVersion DTO', () => {
    const row = {
      skillId: 'skill-1',
      version: 3,
      body: 'some body',
      note: 'Added security rule',
      createdAt: new Date('2024-06-01T12:00:00Z'),
    };
    const dto = toSkillVersionDto(row);
    expect(dto.skill_id).toBe('skill-1');
    expect(dto.version).toBe(3);
    expect(dto.note).toBe('Added security rule');
    expect(dto.created_at).toBe('2024-06-01T12:00:00.000Z');
  });
});

// ---- Placeholder stats -----------------------------------------------------

describe('placeholderStats', () => {
  it('returns deterministic values for the same hash', () => {
    const h = stableHash('550e8400-e29b-41d4-a716-446655440000');
    const a = placeholderStats(h);
    const b = placeholderStats(h);
    expect(a).toEqual(b);
  });

  it('pull_rate is between 0.20 and 0.80', () => {
    for (const id of ['id-1', 'id-2', 'id-3']) {
      const { pull_rate } = placeholderStats(stableHash(id));
      expect(pull_rate).toBeGreaterThanOrEqual(0.20);
      expect(pull_rate).toBeLessThanOrEqual(0.80);
    }
  });

  it('by_category has 3 or 4 entries', () => {
    const { by_category } = placeholderStats(stableHash('some-skill-id'));
    expect(by_category.length).toBeGreaterThanOrEqual(3);
    expect(by_category.length).toBeLessThanOrEqual(4);
  });

  it('never yields negative counts, even for large (uint32 > 2^31) hashes', () => {
    // Real UUIDs hash above 2^31; signed `>>` would have produced negatives.
    for (const id of [
      'ea900b0f-fa7b-4421-a3ed-ac4b9f08cbbd',
      '041dc1b8-e2d9-4680-9e93-bed259363e4a',
      'da92cc48-f0d0-4522-8b10-f3e7658d9fab',
    ]) {
      const s = placeholderStats(stableHash(id));
      expect(s.findings_30d).toBeGreaterThanOrEqual(0);
      expect(s.accept_rate).toBeGreaterThanOrEqual(0);
      for (const c of s.by_category) expect(c.count).toBeGreaterThanOrEqual(0);
    }
  });
});
