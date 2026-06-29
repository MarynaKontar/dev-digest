"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Modal, Markdown } from "@devdigest/ui";
import type { SkillImportPreview } from "@devdigest/shared";
import { useImportSkill, useCreateSkill } from "@/hooks/skills";
import { MODAL_WIDTH } from "./constants";
import { s } from "./styles";

/** Import-skill modal — file picker → preview → confirm. */
export function ImportSkillModal({ onClose }: { onClose: () => void }) {
  const t = useTranslations("skills");
  const router = useRouter();
  const importSkill = useImportSkill();
  const createSkill = useCreateSkill();

  const [preview, setPreview] = React.useState<SkillImportPreview | null>(null);
  const [fileName, setFileName] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setFileName(file.name);
    try {
      const result = await importSkill.mutateAsync(file);
      setPreview(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("import.previewTitle"));
    }
    // Reset input so same file can be re-selected
    e.target.value = "";
  };

  const handleSave = async () => {
    if (!preview) return;
    const skill = await createSkill.mutateAsync({
      name: preview.name,
      description: preview.description,
      type: preview.type,
      source: preview.source,
      body: preview.body,
      enabled: false, // imported skills start disabled until vetted
    });
    onClose();
    router.push(`/skills/${skill.id}?tab=config`);
  };

  const handleBack = () => {
    setPreview(null);
    setFileName("");
    setError(null);
  };

  const isPending = importSkill.isPending || createSkill.isPending;

  return (
    <Modal
      width={MODAL_WIDTH}
      title={t("import.title")}
      subtitle={t("import.subtitle")}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          {preview ? (
            <>
              <Button kind="ghost" onClick={handleBack} disabled={isPending}>
                {t("import.back")}
              </Button>
              <Button kind="primary" icon="Check" onClick={handleSave} disabled={isPending}>
                {createSkill.isPending ? t("import.saving") : t("import.save")}
              </Button>
            </>
          ) : (
            <Button kind="ghost" onClick={onClose}>
              {t("import.cancel")}
            </Button>
          )}
        </div>
      }
    >
      <div style={s.body}>
        {!preview ? (
          /* Step 1: file picker */
          <div style={s.filePicker}>
            <label style={s.fileLabel}>
              {t("import.filePicker")}
              <input
                type="file"
                accept=".md,.zip"
                style={{ display: "none" }}
                onChange={handleFile}
                aria-label={t("import.filePicker")}
              />
            </label>
            {fileName && <span style={s.fileName}>{fileName}</span>}
            {importSkill.isPending && <span style={s.hint}>{t("import.importing")}</span>}
            {error && <span style={s.error}>{error}</span>}
            <p style={s.hint}>{t("import.fileHint")}</p>
          </div>
        ) : (
          /* Step 2: preview */
          <div style={s.preview}>
            {/* Trust warning — prominent */}
            <div style={s.trustWarning}>{t("import.trustWarning")}</div>

            <div style={s.previewMeta}>
              <strong>{preview.name}</strong>
              {" · "}
              {preview.type}
              {" · "}
              {t("import.tokenEstimate", { count: preview.token_estimate })}
            </div>

            {preview.dropped_files.length > 0 && (
              <div style={s.droppedSection}>
                <span style={s.droppedLabel}>{t("import.droppedFiles")}</span>
                <ul style={s.droppedList}>
                  {preview.dropped_files.map((f) => (
                    <li key={f} style={s.droppedItem}>
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div style={s.bodySection}>
              <span style={s.bodyLabel}>{t("import.previewBodyLabel")}</span>
              <div style={s.bodyBox}>
                <Markdown>{preview.body}</Markdown>
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
