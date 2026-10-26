"use client";

/** Clean, printable rendering of the customized resume. */

import type { ReactNode } from "react";
import { GraduationCap, Briefcase, FolderKanban, Sparkles, Wrench } from "lucide-react";

import type { CustomizedResume } from "@/lib/types";

interface ResumeViewProps {
  resume: CustomizedResume;
}

function SectionHeading({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <h3 className="mb-2 flex items-center gap-1.5 border-b pb-1 text-[0.7rem] font-bold uppercase tracking-[0.15em]">
      {icon}
      {children}
    </h3>
  );
}

export function ResumeView({ resume }: ResumeViewProps) {
  return (
    <article
      id="resume-print"
      className="rounded-xl border bg-card p-6 text-foreground shadow-xs sm:p-8"
    >
      <header className="mb-5">
        <h2 className="text-2xl font-bold tracking-tight">Customized Resume</h2>
        <p className="text-xs text-muted-foreground">
          Rewritten to match the target job description
        </p>
      </header>

      <div className="space-y-6 text-sm leading-relaxed">
        {resume.summary.trim() ? (
          <section>
            <SectionHeading icon={<Sparkles className="size-3.5" />}>
              Summary
            </SectionHeading>
            <p className="text-pretty">{resume.summary}</p>
          </section>
        ) : null}

        {resume.skills.length > 0 ? (
          <section>
            <SectionHeading icon={<Wrench className="size-3.5" />}>Skills</SectionHeading>
            <ul className="flex flex-wrap gap-1.5">
              {resume.skills.map((skill) => (
                <li
                  key={skill}
                  className="rounded-full border bg-muted/50 px-2.5 py-0.5 text-xs font-medium"
                >
                  {skill}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {resume.experience.length > 0 ? (
          <section>
            <SectionHeading icon={<Briefcase className="size-3.5" />}>
              Experience
            </SectionHeading>
            <div className="space-y-4">
              {resume.experience.map((job, index) => (
                <div key={`${job.company}-${index}`} className="space-y-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <p className="font-semibold">
                      {job.title}
                      {job.company ? (
                        <span className="font-normal text-muted-foreground">
                          {" - "}
                          {job.company}
                        </span>
                      ) : null}
                    </p>
                    {job.duration ? (
                      <p className="text-xs text-muted-foreground">{job.duration}</p>
                    ) : null}
                  </div>
                  {job.bullets.length > 0 ? (
                    <ul className="list-disc space-y-1 pl-5">
                      {job.bullets.map((bullet, bulletIndex) => (
                        <li key={bulletIndex} className="text-pretty">
                          {bullet}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {resume.projects.length > 0 ? (
          <section>
            <SectionHeading icon={<FolderKanban className="size-3.5" />}>
              Projects
            </SectionHeading>
            <div className="space-y-3">
              {resume.projects.map((project, index) => (
                <div key={`${project.name}-${index}`} className="space-y-1">
                  <p className="font-semibold">{project.name}</p>
                  {project.bullets.length > 0 ? (
                    <ul className="list-disc space-y-1 pl-5">
                      {project.bullets.map((bullet, bulletIndex) => (
                        <li key={bulletIndex} className="text-pretty">
                          {bullet}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {resume.education.length > 0 ? (
          <section>
            <SectionHeading icon={<GraduationCap className="size-3.5" />}>
              Education
            </SectionHeading>
            <ul className="list-disc space-y-1 pl-5">
              {resume.education.map((entry, index) => (
                <li key={index} className="text-pretty">
                  {entry}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </article>
  );
}
