import { useState } from "react";

export function PlaywrightSpecPanel({ spec, fileName }: { spec: string; fileName: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy(): void {
    void navigator.clipboard.writeText(spec).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    });
  }

  function handleDownload(): void {
    const blob = new Blob([spec], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-2 rounded-md border border-sky-800/70 bg-slate-950/80 p-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium text-sky-200">Playwright 테스트 코드</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleCopy}
            className="rounded bg-slate-800 px-2 py-0.5 text-[11px] text-slate-200 hover:bg-slate-700"
          >
            {copied ? "복사됨" : "코드 복사"}
          </button>
          <button
            type="button"
            onClick={handleDownload}
            className="rounded bg-sky-800/70 px-2 py-0.5 text-[11px] text-sky-100 hover:bg-sky-700/80"
          >
            {fileName} 받기
          </button>
        </div>
      </div>
      <pre className="max-h-[28rem] overflow-auto whitespace-pre rounded bg-slate-900 px-2 py-2 text-[11px] leading-relaxed text-slate-200">
        {spec}
      </pre>
    </div>
  );
}
