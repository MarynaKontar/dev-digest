/* CreateConventionSkillModal — merge selected candidates into a skill body,
   let the user edit it, then POST /repos/:id/conventions/skill. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import {
  Button,
  FormField,
  Modal,
  SelectInput,
  Textarea,
  TextInput,
  Toggle,
} from "@devdigest/ui";
import type { ConventionCandidate, SkillType } from "@devdigest/shared";
import { useCreateConventionSkill } from "@/hooks/conventions";
import { mergeCandidatesToMarkdown } from "./helpers";
import { DEFAULT_TYPE, MODAL_WIDTH, SKILL_TYPE_OPTIONS } from "./constants";
import { s } from "./styles";

export function CreateConventionSkillModal({
  repoId,
  repoShortName,
  selectedIds,
  candidates,
  onClose,
  onSuccess,
}: {
  repoId: string;
  repoShortName: string;
  selectedIds: string[];
  candidates: ConventionCandidate[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const t = useTranslations("conventions");
  const create = useCreateConventionSkill(repoId);

  const selectedCandidates = candidates.filter((c) =>
    selectedIds.includes(c.id)
  );

  const defaultName = `${repoShortName}-conventions`;
  const defaultDescription = `House coding conventions for ${repoShortName}`;
  const defaultBody = mergeCandidatesToMarkdown(repoShortName, selectedCandidates);

  const [name, setName] = React.useState(defaultName);
  const [description, setDescription] = React.useState(defaultDescription);
  const [type, setType] = React.useState<SkillType>(DEFAULT_TYPE);
  const [enabled, setEnabled] = React.useState(true);
  const [body, setBody] = React.useState(defaultBody);

  const submit = async () => {
    await create.mutateAsync({
      candidate_ids: selectedIds,
      name: name.trim() || defaultName,
      description,
      type,
      enabled,
      body,
    });
    onSuccess();
  };

  return (
    <Modal
      width={MODAL_WIDTH}
      title={t("create.title")}
      subtitle={t("create.subtitle")}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <span style={s.footerNote}>{t("create.footerNote")}</span>
          <div style={s.footerActions}>
            <Button kind="ghost" onClick={onClose}>
              {t("create.cancel")}
            </Button>
            <Button
              kind="primary"
              icon="Sparkles"
              onClick={submit}
              disabled={create.isPending}
            >
              {create.isPending ? t("create.creating") : t("create.create")}
            </Button>
          </div>
        </div>
      }
    >
      <div style={s.body}>
        <FormField label={t("create.fields.name")} required>
          <TextInput
            value={name}
            onChange={setName}
            placeholder={t("create.fields.namePlaceholder")}
          />
        </FormField>

        <FormField label={t("create.fields.description")}>
          <TextInput
            value={description}
            onChange={setDescription}
            placeholder={t("create.fields.descriptionPlaceholder")}
          />
        </FormField>

        <FormField label={t("create.fields.type")}>
          <SelectInput
            value={type}
            onChange={(v) => setType(v as SkillType)}
            options={[...SKILL_TYPE_OPTIONS]}
          />
        </FormField>

        <FormField label={t("create.fields.enabled")}>
          <div style={s.enabledRow}>
            <Toggle on={enabled} onChange={setEnabled} size={14} />
            <span style={s.enabledLabel}>{enabled ? "On" : "Off"}</span>
          </div>
        </FormField>

        <FormField
          label={t("create.fields.body")}
          hint={t("create.fields.bodyHint")}
          right={
            <span style={s.charCount}>
              {t("create.fields.charCount", { count: body.length })}
            </span>
          }
        >
          <Textarea
            value={body}
            onChange={setBody}
            rows={14}
            mono
          />
        </FormField>
      </div>
    </Modal>
  );
}
