"use client";

/** Single-page app: input state -> loading -> result state. */

import { useState, type FormEvent } from "react";
import {
  GitCompareArrows,
  Lightbulb,
  Loader2,
  Mail,
  RotateCcw,
  FileText,
  Wand2,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CoverLetterPanel } from "@/components/CoverLetterPanel";
import { DiffView } from "@/components/DiffView";
import { DownloadMenu } from "@/components/DownloadMenu";
import { JDInput } from "@/components/JDInput";
import { KeywordChips } from "@/components/KeywordChips";
import { LoadingState } from "@/components/LoadingState";
import { ResumeUpload } from "@/components/ResumeUpload";
import { ResumeView } from "@/components/ResumeView";
import { ScoreCard } from "@/components/ScoreCard";
import { SectionPicker } from "@/components/SectionPicker";
import { useCustomize } from "@/hooks/useCustomize";
import { ALL_SECTIONS, type CustomizeResponse, type SectionKey } from "@/lib/types";
import { isJdValid, isResumeFileValid } from "@/lib/validation";

type TabValue = "resume" | "diff" | "cover" | "ats";

const ERROR_TITLES: Record<string, string> = {
  network: "Can't reach the server",
  timeout: "Request timed out",
  http: "The request was rejected",
};

function AtsTips({ tips }: { tips: string[] }) {
  if (tips.length === 0) {
    return <p className="text-sm text-muted-foreground">No tips returned.</p>;
  }
  return (
    <ol className="space-y-3">
      {tips.map((tip, index) => (
        <li key={index} className="flex gap-3 rounded-lg border bg-card p-3">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
            {index + 1}
          </span>
          <p className="text-sm leading-relaxed text-pretty">{tip}</p>
        </li>
      ))}
    </ol>
  );
}

function ResultPanel({
  data,
  jd,
  file,
  tab,
  onTabChange,
  onStartOver,
}: {
  data: CustomizeResponse;
  jd: string;
  file: File | null;
  tab: TabValue;
  onTabChange: (tab: TabValue) => void;
  onStartOver: () => void;
}) {
  const [coverRequested, setCoverRequested] = useState(tab === "cover");

  const handleTabChange = (value: string): void => {
    if (value === "cover") setCoverRequested(true);
    onTabChange(value as TabValue);
  };

  const printFromMenu = (): void => {
    // Make sure the printable resume is the visible tab before printing.
    onTabChange("resume");
    setTimeout(() => window.print(), 150);
  };

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Your tailored resume</h2>
          <p className="text-xs text-muted-foreground">
            Review each section, then download the format you need.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <DownloadMenu resume={data.customized} onPrint={printFromMenu} />
          <Button type="button" variant="outline" onClick={onStartOver}>
            <RotateCcw className="size-4" aria-hidden />
            Start over
          </Button>
        </div>
      </div>

      <ScoreCard before={data.match_score_before} after={data.match_score_after} />

      <KeywordChips matched={data.matched_keywords} missing={data.missing_keywords} />

      <Tabs value={tab} onValueChange={handleTabChange}>
        <TabsList className="w-full justify-start overflow-x-auto sm:w-auto">
          <TabsTrigger value="resume">
            <FileText className="size-4" aria-hidden />
            Customized Resume
          </TabsTrigger>
          <TabsTrigger value="diff">
            <GitCompareArrows className="size-4" aria-hidden />
            Changes (Diff)
          </TabsTrigger>
          <TabsTrigger value="cover">
            <Mail className="size-4" aria-hidden />
            Cover Letter
          </TabsTrigger>
          <TabsTrigger value="ats">
            <Lightbulb className="size-4" aria-hidden />
            ATS Tips
          </TabsTrigger>
        </TabsList>

        <TabsContent value="resume" forceMount className="data-[state=inactive]:hidden">
          <ResumeView resume={data.customized} />
        </TabsContent>

        <TabsContent value="diff" forceMount className="data-[state=inactive]:hidden">
          <DiffView original={data.original} customized={data.customized} />
        </TabsContent>

        <TabsContent value="cover" forceMount className="data-[state=inactive]:hidden">
          <CoverLetterPanel jd={jd} file={file} active={coverRequested} />
        </TabsContent>

        <TabsContent value="ats" forceMount className="data-[state=inactive]:hidden">
          <div className="space-y-3">
            <h2 className="text-sm font-semibold">ATS optimization tips</h2>
            <AtsTips tips={data.ats_tips} />
          </div>
        </TabsContent>
      </Tabs>
    </section>
  );
}

export default function HomePage() {
  const [jd, setJd] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [sections, setSections] = useState<SectionKey[]>([...ALL_SECTIONS]);
  const [tab, setTab] = useState<TabValue>("resume");

  const { status, data, error, run, reset } = useCustomize();

  const busy = status === "loading";
  const hasResult = status === "success" && data !== null;

  const canSubmit = isJdValid(jd) && file !== null && isResumeFileValid(file) && sections.length > 0;

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (!canSubmit || busy || !file) return;
    setTab("resume");
    void run({ jd: jd.trim(), resume: file, sections });
  };

  const handleStartOver = (): void => {
    reset();
    setJd("");
    setFile(null);
    setSections([...ALL_SECTIONS]);
    setTab("resume");
  };

  return (
    <div className="space-y-8">
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>{ERROR_TITLES[error.kind] ?? "Something went wrong"}</AlertTitle>
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      ) : null}

      {hasResult && data ? (
        <ResultPanel
          data={data}
          jd={jd}
          file={file}
          tab={tab}
          onTabChange={setTab}
          onStartOver={handleStartOver}
        />
      ) : (
        <>
          {busy ? <LoadingState /> : null}

          <form
            onSubmit={handleSubmit}
            aria-busy={busy}
            className={busy ? "pointer-events-none space-y-6 opacity-60" : "space-y-6"}
          >
            <div className="grid gap-6 lg:grid-cols-2">
              <JDInput value={jd} onChange={setJd} disabled={busy} />
              <ResumeUpload
                file={file}
                onSelect={setFile}
                onRemove={() => setFile(null)}
                disabled={busy}
              />
            </div>

            <SectionPicker selected={sections} onChange={setSections} disabled={busy} />

            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" size="lg" disabled={!canSubmit || busy}>
                {busy ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <Wand2 className="size-4" aria-hidden />
                )}
                {busy ? "Customizing..." : "Customize Resume"}
              </Button>

              {!canSubmit && !busy ? (
                <p className="text-xs text-muted-foreground">
                  Add a job description (at least 100 characters), a .pdf or .docx
                  resume, and pick at least one section.
                </p>
              ) : null}
            </div>
          </form>
        </>
      )}
    </div>
  );
}
