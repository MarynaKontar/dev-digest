/**
 * Constants for the conventions extraction module.
 * CONVENTIONS_SYSTEM prompt lives here for reuse by the extractor;
 * pure math constants are shared with helpers.ts.
 */

/** Maximum number of sample files to pass to the model. */
export const SAMPLE_FILES = 12;

/** Character budget allocated per file in buildUserMessage. */
export const PER_FILE_CHAR_CAP = 8_000;

/** Total character budget for all file blocks in the user message. */
export const SAMPLE_TOKEN_BUDGET = 100_000;

/** Minimum confidence score to retain an extraction candidate. */
export const MIN_CONFIDENCE = 0.6;

/** Maximum candidates to persist per repo per scan. */
export const MAX_CANDIDATES = 20;

/**
 * System prompt for the convention-extraction LLM call (§3.6).
 * Verbatim from requirements — do NOT paraphrase.
 */
export const CONVENTIONS_SYSTEM =
  'You are a code-convention analyst. Analyze the provided code samples and\n' +
  'extract concrete coding conventions consistently followed in this repository.\n' +
  'Return ONLY conventions that: have clear evidence in the provided files,\n' +
  'can be formulated as a specific actionable rule (start with Always/Never/Use X\n' +
  'instead of Y), appear in at least 2 places or are configured explicitly,\n' +
  'would be useful for a code reviewer to enforce.\n' +
  'Do NOT include generic best practices obvious to any TypeScript developer,\n' +
  'things with only 1 example unless in a config file, or framework defaults.';
