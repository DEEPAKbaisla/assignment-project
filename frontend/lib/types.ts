/**
 * TypeScript mirrors of the FastAPI response models (backend/app/schemas.py).
 * Keep these in sync with the backend contract.
 */

/** Sections the backend is allowed to rewrite (POST /api/customize `sections`). */
export type SectionKey = "summary" | "skills" | "experience" | "projects";

/** Every selectable section, in display order. */
export const ALL_SECTIONS: readonly SectionKey[] = [
  "summary",
  "skills",
  "experience",
  "projects",
];

/** Human readable label for each section checkbox. */
export const SECTION_LABELS: Record<SectionKey, string> = {
  summary: "Summary",
  skills: "Skills",
  experience: "Experience",
  projects: "Projects",
};

/** backend.schemas.ExperienceItem */
export interface ExperienceItem {
  title: string;
  company: string;
  duration: string;
  bullets: string[];
}

/** backend.schemas.ProjectItem */
export interface ProjectItem {
  name: string;
  bullets: string[];
}

/** backend.schemas.CustomizedResume */
export interface CustomizedResume {
  summary: string;
  skills: string[];
  experience: ExperienceItem[];
  projects: ProjectItem[];
  education: string[];
}

/** backend.schemas.CustomizeResponse */
export interface CustomizeResponse {
  customized: CustomizedResume;
  matched_keywords: string[];
  missing_keywords: string[];
  match_score_before: number;
  match_score_after: number;
  ats_tips: string[];
  /** The input resume parsed into the same structure (untouched source of truth). */
  original: CustomizedResume;
}

/** backend.schemas.CoverLetterResponse */
export interface CoverLetterResponse {
  cover_letter: string;
}

/** Client-side request lifecycle for the customize call. */
export type RequestStatus = "idle" | "loading" | "success" | "error";
