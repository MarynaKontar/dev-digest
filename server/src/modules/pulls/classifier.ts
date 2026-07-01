import type { SmartDiffRole } from '@devdigest/shared';
import { BOILERPLATE_PATTERNS, WIRING_PATTERNS } from './constants.js';

/**
 * Classify a PR file path into a SmartDiffRole.
 *
 * Evaluation order: boilerplate → wiring → core (default).
 * Operates purely on the path string — no I/O, no side effects.
 *
 * @param path  The file's relative path as reported by GitHub (forward slashes).
 * @returns     'boilerplate' | 'wiring' | 'core'
 */
export function classifyFile(path: string): SmartDiffRole {
  for (const pattern of BOILERPLATE_PATTERNS) {
    if (pattern.test(path)) return 'boilerplate';
  }
  for (const pattern of WIRING_PATTERNS) {
    if (pattern.test(path)) return 'wiring';
  }
  return 'core';
}
