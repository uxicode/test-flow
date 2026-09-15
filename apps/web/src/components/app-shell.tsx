import { PIPELINE_STAGE, PIPELINE_STAGES } from "@testflow/shared";
import type { HealthResponse } from "@testflow/shared";
import { getJson } from "../lib/http";
import { useEffect, useState } from "react";
import { IngestPanel } from "./ingest-panel";
import { MermaidPanel } from "./mermaid-panel";
import { RunPanel } from "./run-panel";
import { TcPanel } from "./tc-panel";

const STAGE_LABEL = {
  [PIPELINE_STAGE.ingest]: "Figma URL 가져오기",
  [PIPELINE_STAGE.mermaid]: "Mermaid 변환",
  [PIPELINE_STAGE.testCase]: "TC · 이력",
  [PIPELINE_STAGE.run]: "브라우저 실행 · 로그 · 녹화",
} as const;

export function AppShell() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDumpId, setSelectedDumpId] = useState<string | null>(null);
  const [dumpListRevision, setDumpListRevision] = useState(0);
  const [selectedMermaidId, setSelectedMermaidId] = useState<string | null>(null);
  const [mermaidListRevision, setMermaidListRevision] = useState(0);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [documentListRevision, setDocumentListRevision] = useState(0);

  useEffect(() => {
    let isCancelled = false;

    async function loadHealth() {
      try {
        const result = await getJson<HealthResponse>("/api/health");
        if (!isCancelled) {
          setHealth(result);
          setErrorMessage(null);
        }
      } catch (error) {
        if (!isCancelled)
          setErrorMessage(
            error instanceof Error ? error.message : "API에 연결하지 못했습니다.",
          );
      } finally {
        if (!isCancelled) setIsLoading(false);
      }
    }

    void loadHealth();
    return () => {
      isCancelled = true;
    };
  }, []);

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-8 px-6 py-12">
      <header className="space-y-2">
        <p className="text-sm uppercase tracking-wide text-slate-400">W1–W11</p>
        <h1 className="text-3xl font-semibold text-white">TestFlow</h1>
        <p className="text-slate-300">
          Figma 흐름을 Mermaid·TC로 만들고, headed 브라우저에서 가상 마우스와 함께
          실행·로그·녹화합니다.
        </p>
      </header>

      <section className="rounded-xl border border-slate-700 bg-slate-900/70 p-5">
        <h2 className="mb-3 text-lg font-medium text-white">파이프라인</h2>
        <ol className="grid gap-3 sm:grid-cols-2">
          {PIPELINE_STAGES.map((stage, index) => (
            <li
              key={stage}
              className="rounded-lg border border-slate-600 px-4 py-3 text-slate-200"
            >
              <span className="mr-2 text-slate-500">{index + 1}.</span>
              {STAGE_LABEL[stage]}
            </li>
          ))}
        </ol>
      </section>

      <section className="rounded-xl border border-slate-700 bg-slate-900/70 p-5">
        <h2 className="mb-3 text-lg font-medium text-white">API 상태</h2>
        {isLoading ? <p className="text-slate-400">확인 중…</p> : null}
        {errorMessage ? (
          <p className="text-rose-300" role="alert">
            {errorMessage}
          </p>
        ) : null}
        {health ? (
          <dl className="space-y-1 text-sm text-slate-300">
            <div className="flex gap-2">
              <dt className="w-28 text-slate-500">서비스</dt>
              <dd>{health.service}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-28 text-slate-500">데이터 루트</dt>
              <dd className="break-all">{health.dataRoot}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-28 text-slate-500">스텝 제한</dt>
              <dd>{health.runLimits.stepTimeoutMs}ms</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-28 text-slate-500">런 보관</dt>
              <dd>{health.runLimits.maxKeptRuns}개</dd>
            </div>
          </dl>
        ) : null}
      </section>

      <IngestPanel
        onDumpSelected={setSelectedDumpId}
        onDumpsChanged={() => setDumpListRevision((value) => value + 1)}
      />
      <MermaidPanel
        dumpId={selectedDumpId}
        dumpListRevision={dumpListRevision}
        onMermaidSelected={setSelectedMermaidId}
        onMermaidsChanged={() => setMermaidListRevision((value) => value + 1)}
      />
      <TcPanel
        mermaidId={selectedMermaidId}
        mermaidListRevision={mermaidListRevision}
        onDocumentSelected={setSelectedDocumentId}
        onDocumentsChanged={() => setDocumentListRevision((value) => value + 1)}
      />
      <RunPanel documentId={selectedDocumentId} documentListRevision={documentListRevision} />
    </main>
  );
}
