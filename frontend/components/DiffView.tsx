"use client";

/**
 * Before / after comparison of every resume section.
 *
 * The backend returns the input resume parsed into the same schema as the
 * tailored one (`original` vs `customized`), so each section is rendered to
 * plain text on both sides and word-diffed. Sections whose text is identical
 * are collapsed into a single "unchanged" row.
 */

import { useMemo, type ReactNode } from "react";
import { diffWordsWithSpace, type Change } from "diff";
import { Check } from "lucide-react";

import type { CustomizedResume, ExperienceItem, ProjectItem } from "@/lib/types";

interface DiffViewProps {
  /** The input resume as parsed by the backend, or null when unavailable. */
  original: CustomizedResume | null;
  /** The tailored resume returned by the backend. */
  customized: CustomizedResume;
}

/** One comparable section rendered as plain text on both sides. */
interface SectionDiff {
  key: string;
  title: string;
  before: string;
  after: string;
  changed: boolean;
}

function experienceToText(items: ExperienceItem[]): string {
  return items
    .map((item) => {
      const header = [
        [item.title, item.company].filter(Boolean).join(" - "),
        item.duration.trim() ? `(${item.duration.trim()})` : "",
      ]
        .filter(Boolean)
        .join(" ");
      const bullets = item.bullets.map((bullet) => `- ${bullet}`);
      return [header, ...bullets].join("\n");
    })
    .join("\n\n");
}

function projectsToText(items: ProjectItem[]): string {
  return items
    .map((project) => {
      const bullets = project.bullets.map((bullet) => `- ${bullet}`);
      return [project.name, ...bullets].join("\n");
    })
    .join("\n\n");
}

function buildSections(
  original: CustomizedResume | null,
  customized: CustomizedResume,
): SectionDiff[] {
  const defs: Array<{
    key: string;
    title: string;
    getText: (resume: CustomizedResume) => string;
  }> = [
    { key: "summary", title: "Summary", getText: (r) => r.summary },
    { key: "skills", title: "Skills", getText: (r) => r.skills.join(", ") },
    { key: "experience", title: "Experience", getText: (r) => experienceToText(r.experience) },
    { key: "projects", title: "Projects", getText: (r) => projectsToText(r.projects) },
    { key: "education", title: "Education", getText: (r) => r.education.join("\n") },
  ];
  return defs.map(({ key, title, getText }) => {
    const after = getText(customized);
    const before = original ? getText(original) : after;
    return { key, title, before, after, changed: before !== after };
  });
}

function WordDiff({ before, after }: { before: string; after: string }) {
  const parts = useMemo<Change[]>(
    () => diffWordsWithSpace(before, after),
    [before, after],
  );

  return (
    <p className="whitespace-pre-wrap text-sm leading-relaxed">
      {parts.map((part, index) => {
        if (part.removed) {
          return (
            <del
              key={index}
              className="rounded-sm bg-red-500/15 px-0.5 text-red-700 decoration-red-500/60 dark:text-red-400"
            >
              {part.value}
            </del>
          );
        }
        if (part.added) {
          return (
            <ins
              key={index}
              className="rounded-sm bg-emerald-500/15 px-0.5 no-underline text-emerald-700 dark:text-emerald-400"
            >
              {part.value}
            </ins>
          );
        }
        return <span key={index}>{part.value}</span>;
      })}
    </p>
  );
}

function Pane({
  title,
  tone,
  children,
}: {
  title: string;
  tone: "before" | "after";
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col rounded-lg border">
      <p
        className={
          tone === "after"
            ? "border-b bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400"
            : "border-b bg-muted px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
        }
      >
        {title}
      </p>
      <div className="flex-1 p-3">{children}</div>
    </div>
  );
}

function UnchangedRow({ title }: { title: string }) {
  return (
    <p className="flex items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">
      <Check className="size-3.5 shrink-0" aria-hidden />
      <span className="font-medium">{title}</span>
      <span>- unchanged</span>
    </p>
  );
}

export function DiffView({ original, customized }: DiffViewProps) {
  const sections = useMemo(
    () => buildSections(original, customized),
    [original, customized],
  );
  const changedCount = sections.filter((section) => section.changed).length;

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        <span className="rounded-sm bg-red-500/15 px-1 text-red-700 dark:text-red-400">
          struck through
        </span>{" "}
        text was removed, and{" "}
        <span className="rounded-sm bg-emerald-500/15 px-1 text-emerald-700 dark:text-emerald-400">
          highlighted
        </span>{" "}
        text was added. {changedCount} of {sections.length} sections changed.
      </p>

      <div className="space-y-6">
        {sections.map((section) =>
          section.changed ? (
            <section key={section.key} className="space-y-2">
              <h3 className="text-sm font-semibold">{section.title}</h3>
              <div className="grid gap-4 lg:grid-cols-2">
                <Pane title="Before (original)" tone="before">
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                    {section.before}
                  </p>
                </Pane>
                <Pane title="After (customized)" tone="after">
                  <WordDiff before={section.before} after={section.after} />
                </Pane>
              </div>
            </section>
          ) : (
            <UnchangedRow key={section.key} title={section.title} />
          ),
        )}
      </div>
    </div>
  );
}
