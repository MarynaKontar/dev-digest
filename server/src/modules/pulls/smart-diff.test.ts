import { describe, it, expect } from 'vitest';
import type { PrFile } from '@devdigest/shared';
import { buildSmartDiff, type SmartFinding } from './smart-diff.js';

/** Minimal PrFile factory (only the fields buildSmartDiff reads). */
function file(path: string, additions = 1, deletions = 0): PrFile {
  return { path, additions, deletions, patch: null };
}

/** Pull the SmartDiffFile entries for a given role out of a response. */
function filesFor(res: ReturnType<typeof buildSmartDiff>, role: string) {
  return res.groups.find((g) => g.role === role)?.files ?? [];
}

describe('buildSmartDiff', () => {
  it('groups files core → wiring → boilerplate in fixed order', () => {
    const res = buildSmartDiff(
      [file('src/modules/reviews/service.ts'), file('src/index.ts'), file('pnpm-lock.yaml')],
      [],
    );
    expect(res.groups.map((g) => g.role)).toEqual(['core', 'wiring', 'boilerplate']);
    expect(filesFor(res, 'core').map((f) => f.path)).toEqual(['src/modules/reviews/service.ts']);
    expect(filesFor(res, 'wiring').map((f) => f.path)).toEqual(['src/index.ts']);
    expect(filesFor(res, 'boilerplate').map((f) => f.path)).toEqual(['pnpm-lock.yaml']);
  });

  it('dedups duplicate pr_files rows by path (first wins, counted once)', () => {
    // The pr_files import can carry duplicate rows for the same path — a diff
    // path is a single unit, so it must yield exactly one SmartDiffFile and be
    // counted once toward total_lines (regression: duplicate React key / anchor).
    const res = buildSmartDiff(
      [file('client/CLAUDE.md', 3, 1), file('client/CLAUDE.md', 3, 1)],
      [],
    );
    const core = filesFor(res, 'core');
    expect(core.map((f) => f.path)).toEqual(['client/CLAUDE.md']);
    expect(res.split_suggestion.total_lines).toBe(4); // 3+1 counted once, not 8
  });

  it('attaches deduped, sorted finding_lines + severity markers from the latest session', () => {
    const findings: SmartFinding[] = [
      { id: 'f1', file: 'src/a.ts', startLine: 5, endLine: 6, rationale: 'r1', severity: 'WARNING' },
      { id: 'f2', file: 'src/a.ts', startLine: 6, endLine: 6, rationale: 'r1', severity: 'WARNING' },
      { id: 'f3', file: 'src/a.ts', startLine: 2, endLine: 2, rationale: 'r2', severity: 'CRITICAL' },
    ];
    const res = buildSmartDiff([file('src/a.ts')], findings);
    const [sf] = filesFor(res, 'core');
    expect(sf!.finding_lines).toEqual([2, 5, 6]);
    // One marker per finding (id + severity + range) — drives the in-diff badge/highlight.
    expect(sf!.finding_markers).toEqual([
      { id: 'f1', severity: 'WARNING', start_line: 5, end_line: 6 },
      { id: 'f2', severity: 'WARNING', start_line: 6, end_line: 6 },
      { id: 'f3', severity: 'CRITICAL', start_line: 2, end_line: 2 },
    ]);
    // pseudocode_summary assembled from the distinct rationales — never null here.
    expect(sf!.pseudocode_summary).toContain('r1');
    expect(sf!.pseudocode_summary).toContain('r2');
  });

  it('leaves pseudocode_summary null and finding_lines/markers empty when a file has no findings', () => {
    const res = buildSmartDiff([file('src/a.ts')], []);
    const [sf] = filesFor(res, 'core');
    expect(sf!.finding_lines).toEqual([]);
    expect(sf!.finding_markers).toEqual([]);
    expect(sf!.pseudocode_summary).toBeNull();
  });

  it('flags too_big and proposes splits by top-level segment only past the threshold', () => {
    const small = buildSmartDiff([file('src/a.ts', 10, 0)], []);
    expect(small.split_suggestion.too_big).toBe(false);
    expect(small.split_suggestion.proposed_splits).toEqual([]);

    const big = buildSmartDiff(
      [file('server/src/a.ts', 400, 0), file('client/src/b.ts', 400, 0)],
      [],
    );
    expect(big.split_suggestion.too_big).toBe(true);
    expect(big.split_suggestion.proposed_splits.map((s) => s.name).sort()).toEqual([
      'client',
      'server',
    ]);
  });
});
