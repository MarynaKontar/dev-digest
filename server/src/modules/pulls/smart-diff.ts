import type {
  SmartDiffResponse,
  SmartDiffFile,
  SmartDiffFinding,
  SmartDiffGroup,
  ProposedSplit,
  SmartDiffRole,
  Severity,
  PrFile,
} from '@devdigest/shared';
import { classifyFile } from './classifier.js';
import { SMART_DIFF_TOO_BIG_LINES } from './constants.js';

/**
 * A finding row stripped down to the fields the Smart Diff composer needs.
 * The route maps DB finding rows to this shape before calling buildSmartDiff.
 */
export type SmartFinding = {
  id: string;
  file: string;
  startLine: number;
  endLine: number;
  rationale: string;
  severity: Severity;
};

// Fixed group order — determines the display/JSON ordering.
const ROLE_ORDER: SmartDiffRole[] = ['core', 'wiring', 'boilerplate'];

// Maximum character length of the assembled pseudocode_summary.
const PSEUDOCODE_MAX_LENGTH = 500;

/**
 * Pure composer: classifies PR files, attaches per-file finding metadata, and
 * computes the split suggestion. No DB access, no HTTP calls, no LLM calls.
 *
 * @param files    PR files (from t.prFiles) in PR order.
 * @param findings Open findings from the latest review session (pre-filtered).
 * @returns        SmartDiffResponse ready for serialisation.
 */
export function buildSmartDiff(files: PrFile[], findings: SmartFinding[]): SmartDiffResponse {
  // Index findings by file path for O(1) lookup.
  const findingsByFile = new Map<string, SmartFinding[]>();
  for (const finding of findings) {
    const bucket = findingsByFile.get(finding.file);
    if (bucket !== undefined) {
      bucket.push(finding);
    } else {
      findingsByFile.set(finding.file, [finding]);
    }
  }

  // A file path is a single unit in a diff view. The pr_files import can carry
  // duplicate rows for the same path (the original DiffViewer tolerates them via
  // index keys); dedup here — first occurrence wins, PR order preserved — so a
  // path yields exactly one SmartDiffFile (unique React key + anchor id) and is
  // counted once toward total_lines.
  const seenPaths = new Set<string>();
  const uniqueFiles = files.filter((f) => {
    if (seenPaths.has(f.path)) return false;
    seenPaths.add(f.path);
    return true;
  });

  // Accumulate SmartDiffFile entries per role, preserving PR file order.
  const groupMap = new Map<SmartDiffRole, SmartDiffFile[]>();
  for (const role of ROLE_ORDER) groupMap.set(role, []);

  for (const file of uniqueFiles) {
    const role = classifyFile(file.path);
    const fileFindings = findingsByFile.get(file.path) ?? [];

    // finding_lines: expand each finding's startLine..endLine range, dedup, sort.
    const lineSet = new Set<number>();
    for (const f of fileFindings) {
      for (let l = f.startLine; l <= f.endLine; l++) {
        lineSet.add(l);
      }
    }
    const finding_lines = [...lineSet].sort((a, b) => a - b);

    // finding_markers: one entry per finding (severity + line range) — drives the
    // in-diff severity badge and colored line highlight. Order follows PR findings.
    const finding_markers: SmartDiffFinding[] = fileFindings.map((f) => ({
      id: f.id,
      severity: f.severity,
      start_line: f.startLine,
      end_line: f.endLine,
    }));

    // pseudocode_summary: deduped rationales joined into a single string.
    // null when the file has no findings — strictly deterministic, no LLM.
    let pseudocode_summary: string | null = null;
    if (fileFindings.length > 0) {
      const seen = new Set<string>();
      const rationales: string[] = [];
      for (const f of fileFindings) {
        if (!seen.has(f.rationale)) {
          seen.add(f.rationale);
          rationales.push(f.rationale);
        }
      }
      const joined = rationales.join(' | ');
      pseudocode_summary =
        joined.length > PSEUDOCODE_MAX_LENGTH ? joined.slice(0, PSEUDOCODE_MAX_LENGTH) : joined;
    }

    const smartFile: SmartDiffFile = {
      path: file.path,
      additions: file.additions,
      deletions: file.deletions,
      finding_lines,
      finding_markers,
      pseudocode_summary,
    };

    groupMap.get(role)!.push(smartFile);
  }

  // Build groups in the fixed display order.
  const groups: SmartDiffGroup[] = ROLE_ORDER.map((role) => ({
    role,
    files: groupMap.get(role)!,
  }));

  // Split suggestion: sum all file sizes; propose splits only when too big.
  const total_lines = uniqueFiles.reduce((sum, f) => sum + f.additions + f.deletions, 0);
  const too_big = total_lines > SMART_DIFF_TOO_BIG_LINES;

  let proposed_splits: ProposedSplit[] = [];
  if (too_big) {
    // Group core files by their top-level path segment (e.g. "server", "client").
    const coreFiles = groupMap.get('core') ?? [];
    const splitMap = new Map<string, string[]>();
    for (const f of coreFiles) {
      const segment = f.path.split('/')[0] ?? f.path;
      const bucket = splitMap.get(segment);
      if (bucket !== undefined) {
        bucket.push(f.path);
      } else {
        splitMap.set(segment, [f.path]);
      }
    }
    proposed_splits = [...splitMap.entries()].map(([name, splitFiles]) => ({
      name,
      files: splitFiles,
    }));
  }

  return {
    groups,
    split_suggestion: {
      too_big,
      total_lines,
      proposed_splits,
    },
  };
}
