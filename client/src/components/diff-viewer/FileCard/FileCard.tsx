/* FileCard — one collapsible file in the diff: header (path, +/- stat, comment
   count) and, when open, its parsed lines plus any outdated comments. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { PrFile } from "@/types";
import type { Severity, SmartDiffFinding } from "@devdigest/shared";
import { AUTO_EXPAND_MAX_LINES } from "../constants";
import { parsePatch, type Line } from "../helpers";
import {
  buildThreads,
  keysForLine,
  partitionThreads,
  type CommentThread,
  type DiffCommentApi,
} from "../comments";
import { s, chevronFor } from "../styles";
import { CodeLine } from "../CodeLine";
import { OutdatedComments } from "../OutdatedComments";

/** Threads anchored to a given parsed line (RIGHT=new, LEFT=old). */
function threadsForLine(ln: Line, matched: Map<string, CommentThread[]>): CommentThread[] {
  if (matched.size === 0) return [];
  const out: CommentThread[] = [];
  for (const key of keysForLine(ln)) {
    const list = matched.get(key);
    if (list) out.push(...list);
  }
  return out;
}

/** Severity precedence when several findings touch the same line. */
const SEV_RANK: Record<Severity, number> = { SUGGESTION: 1, WARNING: 2, CRITICAL: 3 };
function maxSeverity(a: Severity | undefined, b: Severity): Severity {
  return a && SEV_RANK[a] >= SEV_RANK[b] ? a : b;
}

export function FileCard({
  file,
  commenting,
  findingMarkers,
  lineAnchorId,
  onFindingClick,
}: {
  file: PrFile;
  commenting?: DiffCommentApi;
  /** Smart Diff only: per-finding severity ranges that annotate the diff lines. */
  findingMarkers?: SmartDiffFinding[];
  /** Smart Diff only: id generator so a findings badge can scroll to a flagged line. */
  lineAnchorId?: (line: number) => string;
  /** Smart Diff only: click a line's severity badge to open its FindingCard. */
  onFindingClick?: (findingId: string) => void;
}) {
  const t = useTranslations("shell");
  const hasFindings = (findingMarkers?.length ?? 0) > 0;
  const [open, setOpen] = React.useState(
    hasFindings || (file.additions ?? 0) + (file.deletions ?? 0) <= AUTO_EXPAND_MAX_LINES
  );
  const lines = React.useMemo(() => parsePatch(file.patch), [file.patch]);

  // Project findings onto new-file line numbers: sevByLine drives the left-bar
  // highlight (every line in a range); badgeByLine shows one badge per finding,
  // anchored at its end line (severity + finding id). Highest severity wins on overlap.
  const { sevByLine, badgeByLine } = React.useMemo(() => {
    const sev = new Map<number, Severity>();
    const badge = new Map<number, { severity: Severity; id: string }>();
    for (const m of findingMarkers ?? []) {
      for (let l = m.start_line; l <= m.end_line; l++) sev.set(l, maxSeverity(sev.get(l), m.severity));
      const prev = badge.get(m.end_line);
      if (!prev || SEV_RANK[m.severity] > SEV_RANK[prev.severity]) {
        badge.set(m.end_line, { severity: m.severity, id: m.id });
      }
    }
    return { sevByLine: sev, badgeByLine: badge };
  }, [findingMarkers]);

  // Group this file's comments into threads, then split into ones we can anchor
  // to a rendered line vs. "outdated" (GitHub dropped the line / it's not here).
  const comments = commenting?.comments;
  const { matched, outdated } = React.useMemo(() => {
    if (!comments) return { matched: new Map<string, CommentThread[]>(), outdated: [] };
    const fileThreads = buildThreads(comments.filter((c) => c.path === file.path));
    const renderedKeys = new Set<string>();
    for (const ln of lines) for (const k of keysForLine(ln)) renderedKeys.add(k);
    return partitionThreads(fileThreads, renderedKeys);
  }, [comments, file.path, lines]);

  const commentCount = commenting
    ? commenting.comments.filter((c) => c.path === file.path).length
    : 0;

  return (
    <div style={s.fileCard}>
      <div onClick={() => setOpen((o) => !o)} style={s.fileHeader}>
        <Icon.ChevronRight size={13} style={chevronFor(open)} />
        <Icon.FileText size={14} style={s.fileIcon} />
        <span className="mono" style={s.filePath}>
          {file.path}
        </span>
        <span className="mono tnum" style={s.fileStat}>
          <span style={s.addText}>+{file.additions}</span>{" "}
          <span style={s.delText}>−{file.deletions}</span>
        </span>
        {commentCount > 0 && (
          <span
            style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--text-muted)" }}
          >
            <Icon.MessageSquare size={12} />
            {commentCount}
          </span>
        )}
      </div>
      {open && (
        <div style={s.fileBody}>
          {lines.length === 0 ? (
            <div style={s.noDiff}>{t("diffViewer.noDiffText")}</div>
          ) : (
            lines.map((ln, i) => (
              <CodeLine
                key={i}
                ln={ln}
                path={file.path}
                threads={threadsForLine(ln, matched)}
                commenting={commenting}
                severity={ln.newNo != null ? sevByLine.get(ln.newNo) ?? null : null}
                badge={ln.newNo != null ? badgeByLine.get(ln.newNo)?.severity ?? null : null}
                badgeFindingId={ln.newNo != null ? badgeByLine.get(ln.newNo)?.id ?? null : null}
                onBadgeClick={onFindingClick}
                anchorId={
                  ln.newNo != null && lineAnchorId && sevByLine.has(ln.newNo)
                    ? lineAnchorId(ln.newNo)
                    : undefined
                }
              />
            ))
          )}
          {commenting && commenting.showComments && <OutdatedComments threads={outdated} />}
        </div>
      )}
    </div>
  );
}
