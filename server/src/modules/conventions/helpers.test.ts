import { describe, it, expect } from 'vitest';
import {
  verifyEvidence,
  buildEvidenceUrl,
  slugRule,
  mergeCandidatesToMarkdown,
  buildUserMessage,
} from './helpers.js';

// Unit tests for conventions/helpers.ts — pure logic, no DB or network.
// Server unit-test command: pnpm exec vitest run --exclude '**/*.it.test.ts'

// ---- verifyEvidence --------------------------------------------------------

describe('verifyEvidence', () => {
  const fileContent = [
    'import { z } from "zod";',
    '',
    'export const Foo = z.object({',
    '  bar: z.string(),',
    '});',
  ].join('\n');

  it('returns null when the snippet first line is not present in the file', () => {
    const snippet = 'const MISSING = true;';
    expect(verifyEvidence(fileContent, snippet)).toBeNull();
  });

  it('returns the correct 1-based line index when the first line is found', () => {
    const snippet = 'export const Foo = z.object({';
    const result = verifyEvidence(fileContent, snippet);
    expect(result).not.toBeNull();
    expect(result!.line).toBe(3);
  });

  it('skips blank leading lines in the snippet and finds the first non-empty line', () => {
    // Snippet starts with blank lines — should still find the real target
    const snippet = '\n\n  bar: z.string(),';
    const result = verifyEvidence(fileContent, snippet);
    expect(result).not.toBeNull();
    expect(result!.line).toBe(4);
  });

  it('returns null when the snippet is entirely blank', () => {
    expect(verifyEvidence(fileContent, '\n  \n\t\n')).toBeNull();
  });

  it('returns null when the file is empty', () => {
    expect(verifyEvidence('', 'some line')).toBeNull();
  });

  it('matches via substring — indented file line still matches an unindented target', () => {
    const indentedFile = 'function foo() {\n  return 42;\n}';
    // target "return 42;" is a substring of the trimmed line "return 42;"
    const result = verifyEvidence(indentedFile, 'return 42;');
    expect(result).not.toBeNull();
    expect(result!.line).toBe(2);
  });

  it('returns the line number of the FIRST match when the snippet line appears multiple times', () => {
    const repeatedFile = 'const x = 1;\nconst x = 1;\nconst x = 1;';
    const result = verifyEvidence(repeatedFile, 'const x = 1;');
    expect(result!.line).toBe(1);
  });
});

// ---- buildEvidenceUrl -------------------------------------------------------

describe('buildEvidenceUrl', () => {
  it('builds a correct GitHub blob URL with #L anchor', () => {
    const url = buildEvidenceUrl('acme/repo', 'main', 'src/index.ts', 42);
    expect(url).toBe('https://github.com/acme/repo/blob/main/src/index.ts#L42');
  });

  it('handles nested paths', () => {
    const url = buildEvidenceUrl('org/project', 'develop', 'packages/api/src/routes.ts', 7);
    expect(url).toBe('https://github.com/org/project/blob/develop/packages/api/src/routes.ts#L7');
  });

  it('uses line 1 correctly', () => {
    const url = buildEvidenceUrl('user/repo', 'main', 'README.md', 1);
    expect(url).toBe('https://github.com/user/repo/blob/main/README.md#L1');
  });
});

// ---- slugRule ---------------------------------------------------------------

describe('slugRule', () => {
  it('converts an imperative rule to kebab-case', () => {
    expect(slugRule('Always use TypeScript strict mode')).toBe(
      'always-use-typescript-strict-mode',
    );
  });

  it('collapses multiple non-alphanumeric characters into a single hyphen', () => {
    expect(slugRule('Never use `any` — ever!')).toBe('never-use-any-ever');
  });

  it('strips leading and trailing hyphens', () => {
    expect(slugRule('  Use X instead of Y  ')).toBe('use-x-instead-of-y');
  });

  it('handles a rule that is already slug-friendly', () => {
    expect(slugRule('use-strict')).toBe('use-strict');
  });

  it('handles numbers in the rule', () => {
    expect(slugRule('Always target ES2022')).toBe('always-target-es2022');
  });
});

// ---- mergeCandidatesToMarkdown -----------------------------------------------

describe('mergeCandidatesToMarkdown', () => {
  const candidate = {
    rule: 'Always use strict TypeScript',
    evidence_path: 'src/index.ts',
    evidence_line: 3,
    evidence_snippet: 'export const foo = () => {\n  return 42;\n};',
  };

  it('produces a document with the repo-conventions heading', () => {
    const md = mergeCandidatesToMarkdown('my-repo', [candidate]);
    expect(md).toContain('# my-repo-conventions');
  });

  it('includes the preamble line with backtick-quoted repo name', () => {
    const md = mergeCandidatesToMarkdown('my-repo', [candidate]);
    expect(md).toContain('House conventions for `my-repo`.');
  });

  it('includes a ## heading derived from slugRule of the rule', () => {
    const md = mergeCandidatesToMarkdown('my-repo', [candidate]);
    expect(md).toContain('## always-use-strict-typescript');
  });

  it('includes the rule text below the heading', () => {
    const md = mergeCandidatesToMarkdown('my-repo', [candidate]);
    expect(md).toContain('Always use strict TypeScript');
  });

  it('includes the evidence_path and evidence_line', () => {
    const md = mergeCandidatesToMarkdown('my-repo', [candidate]);
    expect(md).toContain('Detected in `src/index.ts:3`');
  });

  it('includes the evidence_snippet in a fenced code block', () => {
    const md = mergeCandidatesToMarkdown('my-repo', [candidate]);
    expect(md).toContain('```\nexport const foo = () => {');
  });

  it('handles zero candidates — returns only the header', () => {
    const md = mergeCandidatesToMarkdown('empty-repo', []);
    expect(md).toContain('# empty-repo-conventions');
    expect(md).not.toContain('##');
  });

  it('separates multiple candidates with blank lines', () => {
    const c2 = { ...candidate, rule: 'Never use any', evidence_line: 10 };
    const md = mergeCandidatesToMarkdown('my-repo', [candidate, c2]);
    expect(md).toContain('## always-use-strict-typescript');
    expect(md).toContain('## never-use-any');
  });
});

// ---- buildUserMessage -------------------------------------------------------

describe('buildUserMessage', () => {
  it('includes the repository name', () => {
    const msg = buildUserMessage('my-repo', []);
    expect(msg).toContain('Repository: my-repo');
  });

  it('includes the instruction preamble', () => {
    const msg = buildUserMessage('my-repo', []);
    expect(msg).toContain('Analyze these files and extract coding conventions:');
  });

  it('includes the return-format instruction', () => {
    const msg = buildUserMessage('my-repo', []);
    expect(msg).toContain('Return JSON with candidates array');
  });

  it('renders each file as a ### heading with a fenced code block', () => {
    const msg = buildUserMessage('my-repo', [{ path: 'src/index.ts', content: 'const x = 1;' }]);
    expect(msg).toContain('### src/index.ts');
    expect(msg).toContain('```\nconst x = 1;\n```');
  });

  it('truncates file content that exceeds perFileCharCap', () => {
    const longContent = 'a'.repeat(200);
    const cap = 100;
    const msg = buildUserMessage('my-repo', [{ path: 'big.ts', content: longContent }], cap);
    // The truncated content should be exactly cap characters
    expect(msg).toContain('a'.repeat(100));
    expect(msg).not.toContain('a'.repeat(101));
  });

  it('does not truncate content within the cap', () => {
    const content = 'short content';
    const msg = buildUserMessage('my-repo', [{ path: 'small.ts', content }], 8_000);
    expect(msg).toContain('short content');
  });

  it('handles multiple files, separating them with a blank line', () => {
    const files = [
      { path: 'a.ts', content: 'const a = 1;' },
      { path: 'b.ts', content: 'const b = 2;' },
    ];
    const msg = buildUserMessage('my-repo', files);
    expect(msg).toContain('### a.ts');
    expect(msg).toContain('### b.ts');
  });

  it('handles an empty files array without error', () => {
    expect(() => buildUserMessage('empty-repo', [])).not.toThrow();
  });
});
