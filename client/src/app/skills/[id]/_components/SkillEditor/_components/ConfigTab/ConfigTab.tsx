"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { FormField, TextInput, SelectInput, Textarea, Toggle, Button, Badge } from "@devdigest/ui";
import type { Skill, SkillType } from "@devdigest/shared";
import { useUpdateSkill } from "@/hooks/skills";
import { useToast } from "@/providers/toast";
import { SKILL_TYPE_OPTIONS } from "./constants";
import { s } from "./styles";

/** Skill Config tab — name / description / type / body / enabled + version badge. */
export function ConfigTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const update = useUpdateSkill();

  const [name, setName] = React.useState(skill.name);
  const [description, setDescription] = React.useState(skill.description);
  const [type, setType] = React.useState<SkillType>(skill.type);
  const [body, setBody] = React.useState(skill.body);
  const [enabled, setEnabled] = React.useState(skill.enabled);
  const [note, setNote] = React.useState("");

  React.useEffect(() => {
    setName(skill.name);
    setDescription(skill.description);
    setType(skill.type);
    setBody(skill.body);
    setEnabled(skill.enabled);
  }, [skill.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const tokenCount = Math.ceil(body.length / 4); // rough estimate

  const save = () =>
    update.mutate(
      { id: skill.id, patch: { name, description, type, body, enabled, note: note || undefined } },
      {
        onSuccess: (data) => {
          toast.success(t("config.savedToast", { version: data.version }));
          setNote("");
        },
      },
    );

  const typeOptions = SKILL_TYPE_OPTIONS.map((v) => ({ value: v, label: v }));

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("config.title")}</h2>
        <Badge color="var(--text-secondary)" mono>
          {t("config.version", { version: skill.version })}
        </Badge>
        <span style={s.tokenCount}>{t("config.tokenCount", { count: tokenCount })}</span>
        <label style={s.enabledLabel}>
          {t("config.enabled")}
          <Toggle on={enabled} onChange={setEnabled} size={16} />
        </label>
      </div>

      <FormField label={t("config.name")} required>
        <TextInput value={name} onChange={setName} />
      </FormField>
      <FormField label={t("config.description")} hint={t("config.descriptionCaption")}>
        <TextInput value={description} onChange={setDescription} />
      </FormField>
      <FormField label={t("config.type")}>
        <SelectInput
          value={type}
          onChange={(v) => setType(v as SkillType)}
          options={typeOptions}
        />
      </FormField>
      <FormField label={t("config.body")} hint={t("config.bodyHint")}>
        <Textarea value={body} onChange={setBody} rows={10} mono />
      </FormField>
      <FormField label={t("config.note")}>
        <TextInput value={note} onChange={setNote} placeholder={t("config.notePlaceholder")} />
      </FormField>

      <div style={s.actions}>
        <Button kind="primary" icon="Check" onClick={save} disabled={update.isPending}>
          {update.isPending ? t("config.saving") : t("config.save")}
        </Button>
        {update.isSuccess && (
          <span style={s.savedNote}>
            {t("config.saved", { version: update.data?.version })}
          </span>
        )}
      </div>
    </div>
  );
}
