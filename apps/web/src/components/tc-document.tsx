import { casesToMarkdown, casesToXlsx } from "@testflow/tc/export";
import { useMemo, useState, type ReactNode } from "react";
import { ActionButton } from "./action-button";
import type { TestCase } from "../lib/api";

interface TcDocumentProps {
  cases: TestCase[];
  values: Record<string, Record<string, string>>;
}

function downloadFile(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function renderMarkdown(source: string): ReactNode[] {
  const lines = source.split("\n");
  const nodes: ReactNode[] = [];
  let index = 0;
  let key = 0;
  while (index < lines.length) {
    const line = lines[index] ?? "";
    if (line.startsWith("# ")) {
      nodes.push(<h1 key={key} className="mb-4 text-2xl font-semibold">{line.slice(2)}</h1>);
      key += 1;
      index += 1;
      continue;
    }
    if (line.startsWith("## ")) {
      nodes.push(<h2 key={key} className="mb-2 mt-6 text-lg font-semibold">{line.slice(3)}</h2>);
      key += 1;
      index += 1;
      continue;
    }
    if (line.startsWith("- ")) {
      const items: ReactNode[] = [];
      while (index < lines.length && lines[index]?.startsWith("- ")) {
        const label = (lines[index] ?? "").slice(2);
        index += 1;
        const nested: string[] = [];
        while (lines[index]?.startsWith("  - ")) {
          nested.push((lines[index] ?? "").slice(4));
          index += 1;
        }
        items.push(
          <li key={`${key}-${items.length}`}>
            {label}
            {nested.length > 0 ? (
              <ul className="mt-1 list-disc pl-5">
                {nested.map((item) => <li key={item}>{item}</li>)}
              </ul>
            ) : null}
          </li>,
        );
      }
      nodes.push(<ul key={key} className="mb-3 list-disc space-y-1 pl-5 text-sm">{items}</ul>);
      key += 1;
      continue;
    }
    if (line.trim() === "") {
      index += 1;
      continue;
    }
    const paragraph: string[] = [];
    while (index < lines.length) {
      const current = lines[index] ?? "";
      if (current.trim() === "" || current.startsWith("#") || current.startsWith("- ")) break;
      paragraph.push(current);
      index += 1;
    }
    nodes.push(
      <p key={key} className="mb-3 whitespace-pre-wrap text-sm leading-6">{paragraph.join("\n")}</p>,
    );
    key += 1;
  }
  return nodes;
}

export function TcDocument({ cases, values }: TcDocumentProps) {
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const markdown = useMemo(() => casesToMarkdown(cases, values), [cases, values]);

  function saveMarkdown(): void {
    downloadFile("tc.md", new Blob([markdown], { type: "text/markdown;charset=utf-8" }));
  }

  function saveExcel(): void {
    const bytes = casesToXlsx(cases, values);
    const buffer = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(buffer).set(bytes);
    downloadFile(
      "tc.xlsx",
      new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <ActionButton
          label={isPreviewOpen ? "미리보기 닫기" : "마크다운 미리보기"}
          onClick={() => setIsPreviewOpen((open) => !open)}
        />
        <ActionButton label="마크다운 다운로드" variant="muted" onClick={saveMarkdown} />
        <ActionButton label="엑셀 다운로드" variant="muted" onClick={saveExcel} />
      </div>
      {isPreviewOpen ? (
        <article className="rounded-md bg-white px-6 py-5 text-slate-900">{renderMarkdown(markdown)}</article>
      ) : null}
    </div>
  );
}
