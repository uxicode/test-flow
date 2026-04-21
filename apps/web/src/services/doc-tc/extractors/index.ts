import type {
  DocTcProgress,
  ExtractedDoc,
  SourceDocumentRef,
  SourceDocumentType,
} from "../types";
import { extractDocxText } from "./docx";
import { extractHwpxText } from "./hwpx";
import { extractPdfText } from "./pdf";
import { extractPlainText } from "./text";

function guessDocumentType(
  fileName: string,
  mimeType: string,
): SourceDocumentType | null {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".pdf") || mimeType === "application/pdf") return "pdf";
  if (
    lower.endsWith(".docx") ||
    mimeType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    return "docx";
  }
  if (lower.endsWith(".hwpx")) return "hwpx";
  if (lower.endsWith(".md") || mimeType === "text/markdown") return "md";
  if (lower.endsWith(".txt") || mimeType.startsWith("text/")) return "txt";
  return null;
}

function randomId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2);
}

export interface ExtractDocumentInput {
  file: File;
  language: "ko" | "en";
  onProgress?: (progress: DocTcProgress) => void;
}

export async function extractDocument(
  input: ExtractDocumentInput,
): Promise<ExtractedDoc> {
  const { file, language, onProgress } = input;
  const type = guessDocumentType(file.name, file.type);
  if (!type) {
    throw new Error(
      `지원하지 않는 문서 형식입니다: ${file.name} (${file.type || "unknown"})`,
    );
  }

  const document: SourceDocumentRef = {
    id: randomId(),
    fileName: file.name,
    mimeType: file.type || guessMimeForType(type),
    type,
    size: file.size,
    uploadedAt: new Date().toISOString(),
    textExtracted: false,
    language,
  };

  onProgress?.({ phase: "extracting", message: "텍스트 추출 시작" });

  const warnings: string[] = [];
  let text = "";
  let usedOcr = false;

  switch (type) {
    case "pdf": {
      const res = await extractPdfText(file, { language, onProgress });
      text = res.text;
      warnings.push(...res.warnings);
      usedOcr = res.usedOcr;
      break;
    }
    case "docx": {
      const res = await extractDocxText(file);
      text = res.text;
      warnings.push(...res.warnings);
      break;
    }
    case "hwpx": {
      const res = await extractHwpxText(file);
      text = res.text;
      warnings.push(...res.warnings);
      break;
    }
    case "md":
    case "txt": {
      text = await extractPlainText(file);
      break;
    }
  }

  document.textExtracted = text.trim().length > 0;
  return { document, text, warnings, usedOcr };
}

function guessMimeForType(type: SourceDocumentType): string {
  switch (type) {
    case "pdf":
      return "application/pdf";
    case "docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case "hwpx":
      return "application/vnd.hancom.hwpx";
    case "md":
      return "text/markdown";
    case "txt":
    default:
      return "text/plain";
  }
}

export { guessDocumentType };
