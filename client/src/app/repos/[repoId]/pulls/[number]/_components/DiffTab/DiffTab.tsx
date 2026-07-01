"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel, Button } from "@devdigest/ui";
import { DiffViewer, type DiffCommentApi } from "@/components/diff-viewer";
import { usePrComments, useCreatePrComment } from "@/hooks/reviews";
import { useSmartDiff } from "@/hooks/smart-diff";
import { notify } from "@/providers/toast";
import type { PrFile } from "@devdigest/shared";
import { SmartDiffView } from "./SmartDiffView";
import { s } from "./styles";

interface DiffTabProps {
  prId: string | null;
  filesCount: number;
  files: PrFile[];
  /** Inline commenting is offered only on open PRs (GitHub rejects otherwise). */
  canComment?: boolean;
  /** "file:line" to scroll to (deep-link from a finding on the Agent runs tab). */
  focus?: string | null;
  /** Click a line's severity badge → open its FindingCard on the Findings tab. */
  onFindingClick?: (findingId: string) => void;
}

export function DiffTab({ prId, filesCount, files, canComment, focus, onFindingClick }: DiffTabProps) {
  const t = useTranslations("prReview");
  const { data: comments } = usePrComments(prId);
  const create = useCreatePrComment(prId);
  const { data: smartDiffData } = useSmartDiff(prId);

  // Comments start hidden so the diff is clean by default — toggle to reveal.
  const [showComments, setShowComments] = React.useState(false);
  // Smart order is the default; toggle to Original for the flat diff.
  const [smartOrder, setSmartOrder] = React.useState(true);

  const commentCount = comments?.length ?? 0;
  // `data ?? null`: with enabled:false TanStack v5 keeps data=undefined;
  // treat that the same as "not yet loaded" → fall back to original view.
  const smartDiff = smartDiffData ?? null;

  const commenting: DiffCommentApi = {
    comments: comments ?? [],
    canComment: !!canComment && !!prId,
    showComments,
    posting: create.isPending,
    onSubmit: async (input) => {
      try {
        const res = await create.mutateAsync(input);
        setShowComments(true); // a just-posted comment shouldn't stay hidden
        return res;
      } catch (err) {
        notify.error(err instanceof Error ? err.message : "Couldn't post the comment to GitHub.");
        throw err;
      }
    },
  };

  return (
    <section>
      <SectionLabel
        icon="Code"
        right={
          <div style={s.toggleGroup}>
            {/* Smart order / Original order toggle */}
            <Button
              kind="ghost"
              size="sm"
              active={smartOrder}
              onClick={() => setSmartOrder(true)}
            >
              {t("smartDiff.smartOrder")}
            </Button>
            <Button
              kind="ghost"
              size="sm"
              active={!smartOrder}
              onClick={() => setSmartOrder(false)}
            >
              {t("smartDiff.originalOrder")}
            </Button>

            {/* Comments visibility toggle (only when there are comments) */}
            {commentCount > 0 && (
              <Button
                kind="ghost"
                size="sm"
                icon={showComments ? "EyeOff" : "Eye"}
                onClick={() => setShowComments((v) => !v)}
              >
                {showComments ? "Hide comments" : "Show comments"} ({commentCount})
              </Button>
            )}
          </div>
        }
      >
        Files changed · {filesCount} files
      </SectionLabel>

      {/* When Smart order AND data is available: render grouped view.
          Otherwise fall through to the byte-identical original DiffViewer. */}
      {smartOrder && smartDiff !== null ? (
        <SmartDiffView
          groups={smartDiff.groups}
          splitSuggestion={smartDiff.split_suggestion}
          files={files}
          commenting={commenting}
          focus={focus}
          onFindingClick={onFindingClick}
        />
      ) : (
        <DiffViewer files={files} commenting={commenting} />
      )}
    </section>
  );
}
