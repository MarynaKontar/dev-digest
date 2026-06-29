/* /skills — Skills list. SkillCards + create + import + side preview. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Dropdown, EmptyState, ErrorState, Skeleton, Icon, Markdown } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { useSkills, useUpdateSkill } from "@/hooks/skills";
import { SkillCard } from "../SkillCard";
import { CreateSkillModal } from "./_components/CreateSkillModal";
import { ImportSkillModal } from "./_components/ImportSkillModal";
import { filterSkills } from "./helpers";
import { s } from "./styles";

export function SkillsListView() {
  const t = useTranslations("skills");
  const router = useRouter();
  const { data: skills, isLoading, isError, refetch } = useSkills();
  const update = useUpdateSkill();

  const [creating, setCreating] = React.useState(false);
  const [importing, setImporting] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  const list = filterSkills(skills ?? [], search);
  const selected = skills?.find((s) => s.id === selectedId) ?? null;

  return (
    <AppShell crumb={[{ label: t("page.crumbLab") }, { label: t("page.crumbSkills") }]}>
      {creating && <CreateSkillModal onClose={() => setCreating(false)} />}
      {importing && <ImportSkillModal onClose={() => setImporting(false)} />}

      <div style={s.page}>
        {/* Header */}
        <div style={s.header}>
          <div style={s.headerText}>
            <h1 style={s.h1}>{t("page.heading")}</h1>
            <p style={s.subtitle}>{t("page.subtitle")}</p>
          </div>
          <div style={s.search}>
            <Icon.Search size={13} style={s.searchIcon} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("page.searchPlaceholder")}
              style={s.searchInput}
            />
          </div>
          <Dropdown
            width={240}
            align="right"
            trigger={
              <Button kind="primary" size="sm" icon="Plus" iconRight="ChevronDown">
                {t("page.addSkill")}
              </Button>
            }
            items={[
              { label: t("page.createFromScratch"), icon: "Edit", onClick: () => setCreating(true) },
              { label: t("page.importFromFile"), icon: "Upload", onClick: () => setImporting(true) },
            ]}
          />
        </div>

        <div style={s.layout}>
          {/* Left: card list */}
          <div style={s.listCol}>
            {isLoading && (
              <>
                <Skeleton height={100} />
                <Skeleton height={100} />
                <Skeleton height={100} />
              </>
            )}
            {isError && <ErrorState body={t("page.loadError")} onRetry={() => refetch()} />}
            {!isLoading && !isError && list.length === 0 && (
              <EmptyState
                icon="Sparkles"
                title={t("page.empty.title")}
                body={t("page.empty.body")}
                cta={t("page.empty.cta")}
                onCta={() => setCreating(true)}
              />
            )}
            {list.map((sk) => (
              <SkillCard
                key={sk.id}
                skill={sk}
                active={sk.id === selectedId}
                onClick={() => {
                  if (sk.id === selectedId) {
                    router.push(`/skills/${sk.id}?tab=config`);
                  } else {
                    setSelectedId(sk.id);
                  }
                }}
                onToggle={(enabled) => update.mutate({ id: sk.id, patch: { enabled } })}
              />
            ))}
          </div>

          {/* Right: preview panel */}
          <div style={s.previewCol}>
            {selected ? (
              <div style={s.previewPanel}>
                <div style={s.previewHeader}>
                  <span style={s.previewName}>{selected.name}</span>
                  <Button
                    kind="secondary"
                    size="sm"
                    icon="Edit"
                    onClick={() => router.push(`/skills/${selected.id}?tab=config`)}
                  >
                    Edit
                  </Button>
                </div>
                <p style={s.previewCaption}>{t("preview.caption")}</p>
                <div style={s.previewBody}>
                  <Markdown>{selected.body}</Markdown>
                </div>
              </div>
            ) : (
              <div style={s.previewEmpty}>
                <p style={s.previewEmptyText}>{t("page.selectPrompt.body")}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
