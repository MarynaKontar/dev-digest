/* SmartDiffView.tsx — grouped diff view for the Smart Diff feature.
   Receives already-fetched SmartDiffResponse + the full PrFile[] array (which
   carries the patch text) and renders:
     · A split-suggestion banner (when split_suggestion.too_big)
     · Groups in fixed order core → wiring → boilerplate
     · Boilerplate group collapsed by default (group-level disclosure)
     · Per-file FindingsBadge above files flagged by the latest review session
   Reuses FileCard from @/components/diff-viewer for actual diff rendering. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { SmartDiffGroup, SmartDiffFile, ProposedSplit, SmartDiffRole, PrFile } from "@devdigest/shared";
import type { DiffCommentApi } from "@/components/diff-viewer";
import { FileCard } from "@/components/diff-viewer/FileCard";
import { FindingsBadge } from "./FindingsBadge";
import { ROLE_ORDER, fileAnchorId, lineAnchorId } from "./constants";
import { s } from "./styles";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SplitSuggestion {
  too_big: boolean;
  total_lines: number;
  proposed_splits: ProposedSplit[];
}

interface SmartDiffViewProps {
  groups: SmartDiffGroup[];
  splitSuggestion: SplitSuggestion;
  /** Full PR file list (carries the patch text for each file). */
  files: PrFile[];
  commenting?: DiffCommentApi;
  /** "path:line" deep-link — scroll to that flagged line's anchor on render. */
  focus?: string | null;
  /** Click a line's severity badge → open its FindingCard on the Findings tab. */
  onFindingClick?: (findingId: string) => void;
}

// ---------------------------------------------------------------------------
// Helpers (outside component body per react-best-practices)
// ---------------------------------------------------------------------------

/** Map role → i18n key (type-safe, avoids dynamic string indexing). */
function roleLabelKey(role: SmartDiffRole): string {
  if (role === "core") return "smartDiff.coreLabel";
  if (role === "wiring") return "smartDiff.wiringLabel";
  return "smartDiff.boilerplateLabel";
}

/** Matches an added declaration line, capturing the declared identifier. */
const DECL_RE =
  /^\+\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function|class|interface|type|enum|const|let|var)\s+([A-Za-z0-9_$]+)/;

/**
 * Deterministic, token-free "what this does" for a file WITHOUT review findings:
 * surface the notable symbols the diff adds (from the patch), else null so the
 * caller can fall back to a size note. Never calls a model.
 */
function declaredSymbols(patch: string | null | undefined): string[] {
  if (!patch) return [];
  const names: string[] = [];
  for (const raw of patch.split("\n")) {
    const m = raw.match(DECL_RE);
    if (m?.[1] && !names.includes(m[1])) names.push(m[1]);
    if (names.length >= 3) break;
  }
  return names;
}

// ---------------------------------------------------------------------------
// Sub-component: split suggestion banner
// ---------------------------------------------------------------------------

function SplitBanner({
  splitSuggestion,
}: {
  splitSuggestion: SplitSuggestion;
}) {
  const t = useTranslations("prReview");
  if (!splitSuggestion.too_big) return null;

  return (
    <div style={s.splitBanner} role="note" aria-label="Large PR warning">
      <p style={s.splitTitle}>
        {t("smartDiff.largeTitle", { lines: splitSuggestion.total_lines })}
      </p>
      <p style={s.splitBody}>{t("smartDiff.largeBody")}</p>
      {splitSuggestion.proposed_splits.length > 0 && (
        <ul style={s.splitList}>
          {splitSuggestion.proposed_splits.map((split, i) => (
            // stable key: name is unique per split (server-computed from path segment)
            <li key={`${split.name}-${i}`} style={s.splitItem}>
              <strong>{split.name}</strong>{" "}
              ({t("smartDiff.filesCount", { count: split.files.length })})
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: one role group
// ---------------------------------------------------------------------------

function RoleGroup({
  group,
  fileMap,
  defaultOpen,
  commenting,
  onFindingClick,
}: {
  group: SmartDiffGroup;
  fileMap: Map<string, PrFile>;
  defaultOpen: boolean;
  commenting?: DiffCommentApi;
  onFindingClick?: (findingId: string) => void;
}) {
  const t = useTranslations("prReview");
  const [open, setOpen] = React.useState(defaultOpen);
  const isClickable = !defaultOpen; // only boilerplate starts closed and is togglable
  const count = group.files.length;
  // Inline the role label to avoid dynamic key lookup that TypeScript can't type-check
  const label =
    group.role === "core"
      ? t("smartDiff.coreLabel")
      : group.role === "wiring"
        ? t("smartDiff.wiringLabel")
        : t("smartDiff.boilerplateLabel");

  return (
    <div style={s.group}>
      {/* Role heading — boilerplate is a toggle button */}
      {isClickable ? (
        <button
          type="button"
          style={{ ...s.groupHeading, ...s.groupHeadingClickable }}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <span
            style={{
              ...s.groupChevron,
              transform: open ? "rotate(90deg)" : "rotate(0deg)",
            }}
          >
            ▶
          </span>
          <span>{label}</span>
          <span style={s.fileCount}>
            {t("smartDiff.filesCount", { count })}
          </span>
        </button>
      ) : (
        <div style={s.groupHeading}>
          <span>{label}</span>
          <span style={s.fileCount}>
            {t("smartDiff.filesCount", { count })}
          </span>
        </div>
      )}

      {/* Files — conditionally rendered based on open state */}
      {open && (
        <div style={s.groupFiles}>
          {group.files.map((sdFile: SmartDiffFile) => {
            // Match back to PrFile (which carries .patch); skip if not found.
            const prFile = fileMap.get(sdFile.path);
            if (!prFile) return null;

            const markers = sdFile.finding_markers;
            const findingCount = markers.length;
            // Jump target: the first (lowest) flagged line.
            const firstLine = findingCount > 0
              ? Math.min(...markers.map((m) => m.start_line))
              : null;

            // "What this does": prefer the review-derived summary; otherwise a
            // deterministic, token-free note from the diff so EVERY file has one.
            let summary = sdFile.pseudocode_summary ?? null;
            if (!summary) {
              const symbols = declaredSymbols(prFile.patch);
              summary = symbols.length > 0
                ? t("smartDiff.summaryDefines", { symbols: symbols.join(", ") })
                : t("smartDiff.summaryChanges", {
                    additions: sdFile.additions,
                    deletions: sdFile.deletions,
                  });
            }

            return (
              <div
                key={sdFile.path}
                id={fileAnchorId(sdFile.path)}
                style={s.fileWrapper}
              >
                {/* "N findings" badge on flagged files; click scrolls to the line. */}
                {findingCount > 0 && firstLine != null && (
                  <div style={s.badgeRow}>
                    <FindingsBadge
                      count={findingCount}
                      targetId={lineAnchorId(sdFile.path, firstLine)}
                    />
                  </div>
                )}
                {/* "What this does" — under every file (review rationale when the
                    file has findings, else a deterministic diff-derived note). */}
                <div style={s.whatThisDoes}>
                  <span style={s.whatThisDoesLabel}>{t("smartDiff.whatThisDoes")}</span>{" "}
                  {summary}
                </div>
                {/* Severity badges + line highlights + line anchors are rendered
                    inside FileCard from finding_markers. */}
                <FileCard
                  file={prFile}
                  commenting={commenting}
                  findingMarkers={markers}
                  lineAnchorId={(line) => lineAnchorId(sdFile.path, line)}
                  onFindingClick={onFindingClick}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function SmartDiffView({
  groups,
  splitSuggestion,
  files,
  commenting,
  focus,
  onFindingClick,
}: SmartDiffViewProps) {
  // Build a path → PrFile map for O(1) lookup: each SmartDiffFile.path is
  // matched back to the PrFile that carries the patch text.
  // useMemo: files[] is stable between renders unless the PR changes.
  const fileMap = React.useMemo(() => {
    const m = new Map<string, PrFile>();
    for (const f of files) {
      m.set(f.path, f);
    }
    return m;
  }, [files]);

  // Sort groups into fixed role order (core → wiring → boilerplate) regardless
  // of what order the server returned them.  "Derive, don't store."
  const orderedGroups = React.useMemo(() => {
    const byRole = new Map<SmartDiffRole, SmartDiffGroup>();
    for (const g of groups) {
      byRole.set(g.role, g);
    }
    // ROLE_ORDER is SmartDiffRole[] — map is safe; filter drops missing roles.
    return ROLE_ORDER.map((r) => byRole.get(r)).filter(
      (g): g is SmartDiffGroup => g !== undefined,
    );
  }, [groups]);

  // Deep-link from a finding on the Agent runs tab: `focus` is "path:line".
  // Scroll to that flagged line's anchor once the grouped view is rendered
  // (flagged files auto-expand, so the target row exists). Re-runs when the
  // groups render so the target is in the DOM.
  React.useEffect(() => {
    if (!focus) return;
    const sep = focus.lastIndexOf(":");
    if (sep < 0) return;
    const path = focus.slice(0, sep);
    const line = Number(focus.slice(sep + 1));
    if (!Number.isFinite(line)) return;
    const el = document.getElementById(lineAnchorId(path, line));
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focus, orderedGroups]);

  return (
    <div>
      {/* Split banner renders only when too_big */}
      <SplitBanner splitSuggestion={splitSuggestion} />

      {/* Role groups */}
      {orderedGroups.map((group) => (
        <RoleGroup
          key={group.role}
          group={group}
          fileMap={fileMap}
          onFindingClick={onFindingClick}
          // Boilerplate starts collapsed; core + wiring start expanded.
          defaultOpen={group.role !== "boilerplate"}
          commenting={commenting}
        />
      ))}
    </div>
  );
}
