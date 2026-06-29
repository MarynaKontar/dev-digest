import { ConventionExtraction } from '@devdigest/shared';
import type { LLMProvider, ConventionExtraction as ConventionExtractionT } from '@devdigest/shared';
import { MIN_CONFIDENCE, MAX_CANDIDATES, CONVENTIONS_SYSTEM } from './constants.js';
import { buildUserMessage, verifyEvidence } from './helpers.js';

/**
 * A candidate whose evidence has been verified against the provided file
 * contents. `evidence_line` is the 1-based line index where the snippet's
 * first non-empty line was found.
 */
export interface VerifiedCandidate {
  rule: string;
  evidence_path: string;
  evidence_line: number;
  evidence_snippet: string;
  confidence: number;
}

/**
 * Run the convention-extraction pipeline against a set of already-read files.
 *
 * Steps:
 *  1. Build the user message from the provided files.
 *  2. Call the LLM with a structured-output schema (ConventionExtraction).
 *  3. Drop candidates with confidence <= MIN_CONFIDENCE.
 *  4. For each survivor, find its file in `files` (drop if absent).
 *  5. Verify that the first non-empty line of evidence_snippet literally exists
 *     in the file content (drop if not found); set evidence_line from the result.
 *  6. Cap survivors at MAX_CANDIDATES.
 *
 * Pure except for the LLM call — verification reads from `files`, NOT disk.
 * The service layer reads disk, passes contents in, keeping this unit-testable.
 */
export async function extractConventions(input: {
  repoName: string;
  files: { path: string; content: string }[];
  llm: LLMProvider;
  model: string;
}): Promise<VerifiedCandidate[]> {
  const { repoName, files, llm, model } = input;

  const userMessage = buildUserMessage(repoName, files);

  const result = await llm.completeStructured<ConventionExtractionT>({
    schema: ConventionExtraction,
    schemaName: 'conventions',
    messages: [
      { role: 'system', content: CONVENTIONS_SYSTEM },
      { role: 'user', content: userMessage },
    ],
    model,
  });

  const verified: VerifiedCandidate[] = [];

  for (const candidate of result.data.candidates) {
    // 1. Confidence gate — drop low-confidence candidates
    if (candidate.confidence <= MIN_CONFIDENCE) continue;

    // 2. File must be present in the provided files array
    const file = files.find((f) => f.path === candidate.evidence_path);
    if (!file) continue;

    // 3. Evidence grounding gate — the first non-empty line of the snippet must
    //    literally appear in the file; prevents hallucinated file:line references
    const hit = verifyEvidence(file.content, candidate.evidence_snippet);
    if (!hit) continue;

    verified.push({
      rule: candidate.rule,
      evidence_path: candidate.evidence_path,
      evidence_line: hit.line,
      evidence_snippet: candidate.evidence_snippet,
      confidence: candidate.confidence,
    });

    if (verified.length >= MAX_CANDIDATES) break;
  }

  return verified;
}
