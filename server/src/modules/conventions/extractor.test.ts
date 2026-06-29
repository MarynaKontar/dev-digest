import { describe, it, expect } from 'vitest';
import { extractConventions } from './extractor.js';
import { MockLLMProvider } from '../../adapters/mocks.js';

/**
 * Hermetic unit tests for extractConventions().
 * No DB, no Docker, no disk I/O — MockLLMProvider returns a fixed fixture.
 *
 * Three-candidate fixture:
 *   [0] high-confidence, file present, snippet's first line found → KEEP
 *   [1] confidence === 0.6 (≤ MIN_CONFIDENCE) → DROP (confidence gate)
 *   [2] high-confidence but evidence_path absent from files[] → DROP (file-missing gate)
 */

const FILE_PATH = 'src/config.ts';
const FILE_CONTENT = [
  'import { z } from "zod";',
  '',
  'export const Config = z.object({',
  '  port: z.number().default(3000),',
  '  apiKey: z.string(),',
  '});',
].join('\n');

// The structured fixture that MockLLMProvider will validate and return.
const LLM_FIXTURE = {
  candidates: [
    // Candidate 0: should survive — high confidence + file present + snippet found
    {
      rule: 'Always use Zod for runtime schema validation',
      evidence_path: FILE_PATH,
      evidence_snippet: 'export const Config = z.object({',
      confidence: 0.9,
    },
    // Candidate 1: should be dropped — confidence exactly at MIN_CONFIDENCE (0.6)
    {
      rule: 'Use default values in Zod schemas',
      evidence_path: FILE_PATH,
      evidence_snippet: '  port: z.number().default(3000),',
      confidence: 0.6,
    },
    // Candidate 2: should be dropped — evidence_path not in the provided files[]
    {
      rule: 'Always validate API keys via Zod',
      evidence_path: 'src/missing-file.ts',
      evidence_snippet: 'apiKey: z.string(),',
      confidence: 0.85,
    },
  ],
};

const FILES = [{ path: FILE_PATH, content: FILE_CONTENT }];
const MODEL = 'gpt-4.1';

describe('extractConventions', () => {
  it('returns only the one candidate that passes all gates', async () => {
    const llm = new MockLLMProvider('openai', { structured: LLM_FIXTURE });
    const results = await extractConventions({ repoName: 'test-repo', files: FILES, llm, model: MODEL });

    expect(results).toHaveLength(1);
  });

  it('the surviving candidate has the expected rule and evidence path', async () => {
    const llm = new MockLLMProvider('openai', { structured: LLM_FIXTURE });
    const [survivor] = await extractConventions({ repoName: 'test-repo', files: FILES, llm, model: MODEL });

    expect(survivor!.rule).toBe('Always use Zod for runtime schema validation');
    expect(survivor!.evidence_path).toBe(FILE_PATH);
  });

  it('sets evidence_line to the correct 1-based line index from the file', async () => {
    // "export const Config = z.object({" is on line 3 of FILE_CONTENT (1-based)
    const llm = new MockLLMProvider('openai', { structured: LLM_FIXTURE });
    const [survivor] = await extractConventions({ repoName: 'test-repo', files: FILES, llm, model: MODEL });

    expect(survivor!.evidence_line).toBe(3);
  });

  it('drops the low-confidence candidate (confidence <= MIN_CONFIDENCE = 0.6)', async () => {
    const llm = new MockLLMProvider('openai', { structured: LLM_FIXTURE });
    const results = await extractConventions({ repoName: 'test-repo', files: FILES, llm, model: MODEL });
    const rules = results.map((r) => r.rule);

    expect(rules).not.toContain('Use default values in Zod schemas');
  });

  it('drops the candidate whose evidence_path is absent from the files array', async () => {
    const llm = new MockLLMProvider('openai', { structured: LLM_FIXTURE });
    const results = await extractConventions({ repoName: 'test-repo', files: FILES, llm, model: MODEL });
    const rules = results.map((r) => r.rule);

    expect(rules).not.toContain('Always validate API keys via Zod');
  });

  it('returns empty array when the LLM returns no candidates', async () => {
    const llm = new MockLLMProvider('openai', { structured: { candidates: [] } });
    const results = await extractConventions({ repoName: 'test-repo', files: FILES, llm, model: MODEL });

    expect(results).toHaveLength(0);
  });

  it('drops a candidate whose snippet first line is not found in the file', async () => {
    const fixture = {
      candidates: [
        {
          rule: 'Always annotate return types on public functions',
          evidence_path: FILE_PATH,
          evidence_snippet: 'this line does not exist in the file',
          confidence: 0.95,
        },
      ],
    };
    const llm = new MockLLMProvider('openai', { structured: fixture });
    const results = await extractConventions({ repoName: 'test-repo', files: FILES, llm, model: MODEL });

    expect(results).toHaveLength(0);
  });
});
