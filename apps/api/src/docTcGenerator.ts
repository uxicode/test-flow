import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { ExcelTestCase } from "./excelTestCaseTypes.js";
import type {
  GenerateDocTestCasesOptions,
  GeneratedDocTcResult,
  GeneratedDocTestCase,
  ParsedDocResult,
  ParsedDocumentRecord,
  RequirementItem,
  SourceDocumentRef,
  SourceDocumentType,
} from "./docTcTypes.js";

interface UploadedDocumentInput {
  fileName: string;
  mimeType: string;
  buffer: Buffer;
  language?: "ko" | "en";
}

const PRECONDITION_RE = /^(사전조건|전제조건|preconditions?)[:\-]?\s*/i;
const RULE_RE = /^(규칙|정책|비즈니스\s*룰|business\s*rules?)[:\-]?\s*/i;
const ACCEPT_RE = /^(기대결과|인수조건|승인조건|acceptance(\s*criteria)?)[:\-]?\s*/i;
const EXCEPTION_RE = /^(예외|오류|실패|exception(s)?)[:\-]?\s*/i;
const ACTOR_RE = /^(사용자|actor)[:\-]?\s*/i;
const OPENAI_API_URL = "https://api.openai.com/v1/responses";
const OPENAI_MODEL = process.env.TESTFLOW_DOC_TC_MODEL ?? "gpt-4.1-mini";
const OPENAI_PROMPT_VERSION = "doc-tc-openai-v1";
const execFileAsync = promisify(execFile);
const OCR_MAX_PAGES = Number(process.env.TESTFLOW_DOC_OCR_MAX_PAGES ?? 20);
const nodeRequire = createRequire(import.meta.url);

function inferDocumentType(fileName: string, mimeType: string): SourceDocumentType | null {
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  if (ext === "txt") return "txt";
  if (ext === "md" || ext === "markdown") return "md";
  if (ext === "pdf") return "pdf";
  if (ext === "docx") return "docx";
  if (ext === "hwpx" || ext === "hwp") return "hwpx";
  if (mimeType.startsWith("text/")) return "txt";
  return null;
}

function normalizeWhitespace(input: string): string {
  return input.replace(/\r\n/g, "\n").replace(/\t/g, " ").replace(/[ \u00A0]+/g, " ").trim();
}

function scoreTextQuality(input: string, language?: "ko" | "en"): number {
  if (!input) return 0;
  const visible = Array.from(input).filter((ch) => !/\s/.test(ch));
  if (visible.length === 0) return 0;
  let good = 0;
  let bad = 0;
  let hangulCount = 0;
  let alphaNumCount = 0;
  for (const ch of visible) {
    if (/[가-힣A-Za-z0-9]/.test(ch)) {
      if (/[가-힣]/.test(ch)) hangulCount += 1;
      if (/[A-Za-z0-9]/.test(ch)) alphaNumCount += 1;
      good += 2;
      continue;
    }
    if (/[.,:;!?()[\]{}"'/%+\-_=~@#*&]/.test(ch)) {
      good += 1;
      continue;
    }
    if (/[\uFFFD\u0000-\u001F¤þñ÷äàìåºÂ­ÞÙÛª²Ü¯Ã]/.test(ch)) {
      bad += 3;
      continue;
    }
    if (/[^\u0020-\u007E\u00A0-\u024F\u1100-\u11FF\u3130-\u318F\uAC00-\uD7AF]/.test(ch)) {
      bad += 2;
      continue;
    }
    good += 0.2;
  }
  const base = (good - bad) / visible.length;
  if (language === "ko") {
    const hangulRatio = hangulCount / visible.length;
    if (hangulRatio > 0.08) return base + hangulRatio * 3;
    if (hangulCount === 0 && alphaNumCount < visible.length * 0.4) {
      return base - 1.5;
    }
  }
  return base;
}

function pickBestTextCandidate(
  candidates: Array<{ text: string; source: string }>,
  language?: "ko" | "en",
): string {
  let best = "";
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const candidate of candidates) {
    const normalized = normalizeWhitespace(candidate.text);
    if (!normalized) continue;
    let score = scoreTextQuality(normalized, language);
    if (language === "ko" && candidate.source === "ocr") {
      score += 0.8;
    }
    if (score > bestScore) {
      best = normalized;
      bestScore = score;
    }
  }
  return best;
}

function sanitizeExtractedText(input: string, language?: "ko" | "en"): string {
  const lines = input
    .split("\n")
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean)
    .filter((line) => scoreTextQuality(line, language) > 0.02);
  return normalizeWhitespace(lines.join("\n"));
}

function splitBlocks(text: string): string[] {
  return text
    .split(/\n\s*\n/g)
    .map((block) => normalizeWhitespace(block))
    .filter(Boolean);
}

function cleanLine(line: string): string {
  return line.replace(/^[-*]\s*/, "").replace(/^\d+[\.\)]\s*/, "").trim();
}

function inferFeature(title: string, lines: string[]): string {
  const base = title.replace(/^#+\s*/, "").trim();
  if (base) return base;
  const first = lines[0] ?? "요구사항";
  return first.slice(0, 60);
}

function inferActor(lines: string[]): string | undefined {
  for (const raw of lines) {
    const line = cleanLine(raw);
    if (ACTOR_RE.test(line)) return line.replace(ACTOR_RE, "").trim() || undefined;
  }
  return undefined;
}

interface PdfJsTextItem {
  str: string;
  transform?: number[];
  hasEOL?: boolean;
}

/**
 * pdfjs-dist(legacy)로 PDF 텍스트를 추출. CID/ToUnicode CMap을 정상적으로 적용하므로
 * 한글·일본어·중국어 PDF에서도 깨진 문자 없이 원문을 얻을 수 있다.
 * 스캔 PDF(이미지 기반) 등에서 빈 결과가 나올 수 있어 호출부에서 OCR 폴백을 둔다.
 */
async function extractTextWithPdfJs(filePath: string): Promise<string> {
  const buf = await fs.readFile(filePath);
  const data = new Uint8Array(buf);

  const pdfjsRoot = path.dirname(nodeRequire.resolve("pdfjs-dist/package.json"));
  const cMapUrl = pathToFileURL(path.join(pdfjsRoot, "cmaps") + path.sep).toString();
  const standardFontDataUrl = pathToFileURL(
    path.join(pdfjsRoot, "standard_fonts") + path.sep,
  ).toString();

  const pdfjs = (await import("pdfjs-dist/legacy/build/pdf.mjs")) as {
    getDocument: (options: Record<string, unknown>) => {
      promise: Promise<{
        numPages: number;
        getPage: (pageNumber: number) => Promise<{
          getTextContent: () => Promise<{ items: PdfJsTextItem[] }>;
        }>;
        destroy: () => Promise<void>;
      }>;
    };
  };

  const pdf = await pdfjs
    .getDocument({
      data,
      cMapUrl,
      cMapPacked: true,
      standardFontDataUrl,
      useSystemFonts: false,
      isEvalSupported: false,
      disableFontFace: true,
      verbosity: 0,
    })
    .promise;

  const pages: string[] = [];
  try {
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const parts: string[] = [];
      let prevY: number | null = null;
      for (const item of content.items) {
        if (typeof item.str !== "string") continue;
        const y = item.transform?.[5] ?? 0;
        if (prevY !== null && Math.abs(y - prevY) > 2 && parts.length > 0) {
          parts.push("\n");
        }
        parts.push(item.str);
        if (item.hasEOL) parts.push("\n");
        prevY = y;
      }
      pages.push(parts.join(""));
    }
  } finally {
    try {
      await pdf.destroy();
    } catch {
      /* ignore */
    }
  }
  return pages.join("\n\n").trim();
}

async function extractTextWithPython(
  filePath: string,
  type: SourceDocumentType,
): Promise<string> {
  const script = String.raw`
import re, sys, zipfile, zlib, binascii
from pathlib import Path
import xml.etree.ElementTree as ET

path = Path(sys.argv[1])
kind = sys.argv[2]

def norm(text: str) -> str:
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"[ \t\f\v]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()

def xml_text(xml_bytes: bytes) -> str:
    try:
        root = ET.fromstring(xml_bytes)
    except Exception:
        return ""
    parts = []
    for elem in root.iter():
        if elem.text and elem.text.strip():
            parts.append(elem.text.strip())
    return norm("\n".join(parts))

def extract_docx(p: Path) -> str:
    parts = []
    with zipfile.ZipFile(p) as zf:
        names = sorted(
            [n for n in zf.namelist() if n.startswith("word/") and n.endswith(".xml")]
        )
        preferred = [n for n in names if any(
            key in n for key in ["document.xml", "header", "footer", "footnotes", "endnotes"]
        )]
        for name in preferred or names:
            try:
                parts.append(xml_text(zf.read(name)))
            except Exception:
                pass
    return norm("\n\n".join([p for p in parts if p]))

def extract_hwpx(p: Path) -> str:
    parts = []
    with zipfile.ZipFile(p) as zf:
        names = sorted([n for n in zf.namelist() if n.lower().endswith(".xml")])
        for name in names:
            try:
                txt = xml_text(zf.read(name))
                if txt:
                    parts.append(txt)
            except Exception:
                pass
    return norm("\n\n".join(parts))

def decode_pdf_literal(s: bytes) -> str:
    out = bytearray()
    i = 0
    while i < len(s):
        ch = s[i]
        if ch == 0x5C and i + 1 < len(s):
            i += 1
            esc = s[i]
            mapping = {
                ord('n'): b'\n', ord('r'): b'\r', ord('t'): b'\t',
                ord('b'): b'\b', ord('f'): b'\f',
                ord('('): b'(', ord(')'): b')', ord('\\'): b'\\'
            }
            if esc in mapping:
                out.extend(mapping[esc])
            elif 48 <= esc <= 55:
                octal = bytes([esc])
                for _ in range(2):
                    if i + 1 < len(s) and 48 <= s[i + 1] <= 55:
                        i += 1
                        octal += bytes([s[i]])
                    else:
                        break
                out.append(int(octal, 8))
            else:
                out.append(esc)
        else:
            out.append(ch)
        i += 1
    try:
        return out.decode("utf-8")
    except Exception:
        return out.decode("latin1", errors="ignore")

def extract_pdf_strings(data: bytes) -> str:
    texts = []
    for match in re.finditer(rb"stream\r?\n(.*?)\r?\nendstream", data, re.S):
        stream = match.group(1)
        candidates = [stream]
        for wbits in (zlib.MAX_WBITS, -zlib.MAX_WBITS):
            try:
                candidates.append(zlib.decompress(stream, wbits))
            except Exception:
                pass
        for content in candidates:
            for bt in re.finditer(rb"BT(.*?)ET", content, re.S):
                block = bt.group(1)
                for lit in re.finditer(rb"\((?:\\.|[^\\)])*\)", block):
                    texts.append(decode_pdf_literal(lit.group(0)[1:-1]))
                for hexs in re.finditer(rb"<([0-9A-Fa-f\s]+)>", block):
                    raw = re.sub(rb"\s+", b"", hexs.group(1))
                    if len(raw) % 2 == 1:
                        raw += b"0"
                    try:
                        texts.append(binascii.unhexlify(raw).decode("utf-16-be"))
                    except Exception:
                        try:
                            texts.append(binascii.unhexlify(raw).decode("latin1", errors="ignore"))
                        except Exception:
                            pass
    if not texts:
        loose = re.findall(rb"\((?:\\.|[^\\)]){2,}\)", data)
        texts.extend(decode_pdf_literal(x[1:-1]) for x in loose[:400])
    return norm("\n".join([t for t in texts if t and any(c.isalnum() for c in t)]))

if kind == "docx":
    sys.stdout.write(extract_docx(path))
elif kind == "hwpx":
    sys.stdout.write(extract_hwpx(path))
elif kind == "pdf":
    sys.stdout.write(extract_pdf_strings(path.read_bytes()))
else:
    sys.stdout.write(path.read_text(encoding="utf-8"))
`;

  const { stdout } = await execFileAsync("python3", ["-c", script, filePath, type], {
    maxBuffer: 20 * 1024 * 1024,
  });
  return stdout.trim();
}

async function extractTextWithMdls(filePath: string): Promise<string> {
  const { stdout } = await execFileAsync("mdls", [
    "-raw",
    "-name",
    "kMDItemTextContent",
    filePath,
  ]);
  if (stdout.trim() === "(null)") return "";
  return stdout.trim();
}

async function extractTextWithTextutil(filePath: string): Promise<string> {
  const { stdout } = await execFileAsync("textutil", [
    "-convert",
    "txt",
    "-stdout",
    filePath,
  ]);
  return stdout.trim();
}

async function extractTextWithSwiftPdfOcr(
  filePath: string,
  language?: "ko" | "en",
): Promise<string> {
  const swiftScriptPath = path.join(__dirnameLike(), "pdfOcr.swift");
  const { stdout } = await execFileAsync(
    "swift",
    [
      swiftScriptPath,
      filePath,
      String(Math.max(1, OCR_MAX_PAGES)),
      language ?? "ko",
    ],
    { maxBuffer: 20 * 1024 * 1024 },
  );
  return stdout.trim();
}

function __dirnameLike(): string {
  return path.dirname(fileURLToPath(import.meta.url));
}

async function extractDocumentText(
  input: UploadedDocumentInput,
  type: SourceDocumentType,
): Promise<{ text: string; warnings: string[] }> {
  if (type === "txt" || type === "md") {
    return {
      text: normalizeWhitespace(input.buffer.toString("utf8")),
      warnings: [],
    };
  }

  const tempPath = path.join(
    os.tmpdir(),
    `testflow-doc-${randomUUID()}.${type === "hwpx" ? "hwpx" : type}`,
  );
  await fs.writeFile(tempPath, input.buffer);
  try {
    const candidates: Array<{ text: string; source: string }> = [];
    if (type === "pdf") {
      try {
        candidates.push({
          text: await extractTextWithPdfJs(tempPath),
          source: "pdfjs",
        });
      } catch {
        /* fallback below */
      }
    }
    if (type === "docx") {
      try {
        candidates.push({ text: await extractTextWithTextutil(tempPath), source: "textutil" });
      } catch {
        /* fallback below */
      }
    }
    if (type === "pdf" && input.language !== "ko") {
      try {
        candidates.push({ text: await extractTextWithMdls(tempPath), source: "mdls" });
      } catch {
        /* fallback below */
      }
    }
    if (type !== "pdf") {
      try {
        candidates.push({ text: await extractTextWithPython(tempPath, type), source: "python" });
      } catch {
        /* candidate optional */
      }
    }
    let text = sanitizeExtractedText(
      pickBestTextCandidate(candidates, input.language),
      input.language,
    );
    const warnings: string[] = [];
    if (type === "pdf") {
      const quality = scoreTextQuality(text, input.language);
      const needsOcr =
        !text ||
        text.length < 40 ||
        (input.language === "ko" ? quality < 0.5 : quality < 0.2);
      if (!needsOcr) {
        warnings.push("pdfjs-dist로 PDF 텍스트를 추출했습니다.");
      } else {
        warnings.push(
          "PDF에서 텍스트 레이어가 부족해 Vision OCR로 보정합니다. 스캔 PDF일 가능성이 높습니다.",
        );
        try {
          const ocrText = sanitizeExtractedText(
            await extractTextWithSwiftPdfOcr(tempPath, input.language),
            input.language,
          );
          if (ocrText) {
            const best = sanitizeExtractedText(
              pickBestTextCandidate(
                [...candidates, { text: ocrText, source: "ocr" }],
                input.language,
              ),
              input.language,
            );
            if (best && best !== text) {
              text = best;
            }
            warnings.push(
              `Vision OCR로 PDF 텍스트를 보정했습니다. 페이지 수 제한: ${Math.max(1, OCR_MAX_PAGES)}.`,
            );
          }
        } catch {
          warnings.push("Vision OCR 시도에 실패했습니다.");
        }
      }
    }
    if (!text || scoreTextQuality(text, input.language) < 0.08) {
      throw new Error("garbled_document_text");
    }
    return { text, warnings };
  } finally {
    await fs.unlink(tempPath).catch(() => undefined);
  }
}

function canUseOpenAi(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

function truncateForLlm(text: string, maxChars = 20000): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n\n[truncated]`;
}

async function callOpenAiStructured<T>({
  systemPrompt,
  userPrompt,
  schemaName,
  schema,
}: {
  systemPrompt: string;
  userPrompt: string;
  schemaName: string;
  schema: Record<string, unknown>;
}): Promise<T> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("openai_api_key_missing");

  const res = await fetch(OPENAI_API_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      input: [
        {
          role: "system",
          content: [{ type: "input_text", text: systemPrompt }],
        },
        {
          role: "user",
          content: [{ type: "input_text", text: userPrompt }],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: schemaName,
          schema,
          strict: true,
        },
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`openai_http_${res.status}:${text.slice(0, 500)}`);
  }

  const json = (await res.json()) as Record<string, unknown>;
  const outputText =
    typeof json.output_text === "string"
      ? json.output_text
      : extractOutputText(json.output);
  if (!outputText) throw new Error("openai_output_missing");
  return JSON.parse(outputText) as T;
}

function extractOutputText(raw: unknown): string | null {
  if (!Array.isArray(raw)) return null;
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const itemObj = item as Record<string, unknown>;
    const content = itemObj.content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const partObj = part as Record<string, unknown>;
      if (typeof partObj.text === "string") return partObj.text;
    }
  }
  return null;
}

function buildRequirement(block: string, index: number): RequirementItem {
  const rawLines = block.split("\n").map((line) => line.trim()).filter(Boolean);
  const titleLine =
    rawLines.find((line) => line.startsWith("#")) ??
    rawLines.find((line) => /^(\d+(\.\d+)*)[\.\)]?\s+/.test(line)) ??
    rawLines[0] ??
    `요구사항 ${index + 1}`;
  const feature = inferFeature(titleLine, rawLines);
  const preconditions: string[] = [];
  const flow: string[] = [];
  const businessRules: string[] = [];
  const acceptanceCriteria: string[] = [];
  const exceptions: string[] = [];

  for (const raw of rawLines) {
    const line = cleanLine(raw);
    if (!line || line === feature) continue;
    if (PRECONDITION_RE.test(line)) {
      preconditions.push(line.replace(PRECONDITION_RE, "").trim());
      continue;
    }
    if (RULE_RE.test(line)) {
      businessRules.push(line.replace(RULE_RE, "").trim());
      continue;
    }
    if (ACCEPT_RE.test(line)) {
      acceptanceCriteria.push(line.replace(ACCEPT_RE, "").trim());
      continue;
    }
    if (EXCEPTION_RE.test(line)) {
      exceptions.push(line.replace(EXCEPTION_RE, "").trim());
      continue;
    }
    if (ACTOR_RE.test(line)) continue;
    flow.push(line);
  }

  return {
    id: `REQ-${index + 1}`,
    sectionTitle: feature,
    feature,
    ...(inferActor(rawLines) ? { actor: inferActor(rawLines) } : {}),
    preconditions,
    flow,
    businessRules,
    acceptanceCriteria,
    exceptions,
    sourceSpans: [{ heading: feature, quote: rawLines.slice(0, 3).join(" ").slice(0, 240) }],
  };
}

export async function extractRequirementsFromText(
  text: string,
): Promise<{ requirements: RequirementItem[]; warnings: string[] }> {
  const normalizedText = normalizeWhitespace(text);
  if (!normalizedText) {
    return { requirements: [], warnings: ["입력 텍스트가 비어 있습니다."] };
  }
  const warnings: string[] = [];
  const blocks = splitBlocks(normalizedText);
  let requirements = blocks
    .slice(0, 50)
    .map((block, index) => buildRequirement(block, index));
  if (canUseOpenAi()) {
    try {
      const llmRequirements = await extractRequirementsWithOpenAi(normalizedText);
      if (llmRequirements.length > 0) {
        requirements = llmRequirements.map((item, index) => ({
          ...item,
          id: item.id || `REQ-${index + 1}`,
        }));
      } else {
        warnings.push("LLM이 requirement를 반환하지 않아 규칙 기반 추출 결과를 사용했습니다.");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      warnings.push(`LLM requirement 추출 실패로 규칙 기반 추출을 사용했습니다: ${message}`);
    }
  } else {
    warnings.push("OPENAI_API_KEY가 없어 규칙 기반 requirement 추출을 사용했습니다.");
  }
  if (blocks.length > 50) {
    warnings.push("문서 블록이 많아 앞 50개만 requirement 후보로 사용했습니다.");
  }
  if (requirements.length === 0) {
    warnings.push("요구사항 후보를 찾지 못했습니다.");
  }
  return { requirements, warnings };
}

async function extractRequirementsWithOpenAi(text: string): Promise<RequirementItem[]> {
  const schema = {
    type: "object",
    additionalProperties: false,
    required: ["requirements"],
    properties: {
      requirements: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "id",
            "sectionTitle",
            "feature",
            "actor",
            "preconditions",
            "flow",
            "businessRules",
            "acceptanceCriteria",
            "exceptions",
            "sourceSpans",
          ],
          properties: {
            id: { type: "string" },
            sectionTitle: { type: "string" },
            feature: { type: "string" },
            actor: { type: "string" },
            preconditions: { type: "array", items: { type: "string" } },
            flow: { type: "array", items: { type: "string" } },
            businessRules: { type: "array", items: { type: "string" } },
            acceptanceCriteria: { type: "array", items: { type: "string" } },
            exceptions: { type: "array", items: { type: "string" } },
            sourceSpans: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["heading", "quote"],
                properties: {
                  heading: { type: "string" },
                  quote: { type: "string" },
                },
              },
            },
          },
        },
      },
    },
  } as const;

  const result = await callOpenAiStructured<{ requirements: RequirementItem[] }>({
    schemaName: "document_requirements",
    schema,
    systemPrompt:
      "You extract software requirements from product planning documents. Return only structured requirements. Preserve Korean text when present. Do not invent selectors, APIs, or UI elements that are not supported by the document.",
    userPrompt: `Extract requirements from this document.\n\n${truncateForLlm(text)}`,
  });
  return result.requirements;
}

export async function parseUploadedDocument(
  input: UploadedDocumentInput,
): Promise<ParsedDocumentRecord> {
  const type = inferDocumentType(input.fileName, input.mimeType);
  if (!type) {
    throw new Error("unsupported_document_type");
  }
  const extracted = await extractDocumentText(input, type);
  const text = extracted.text;
  if (!text) {
    throw new Error("empty_document");
  }

  const requirementResult = await extractRequirementsFromText(text);
  const warnings: string[] = [...extracted.warnings, ...requirementResult.warnings];
  const requirements = requirementResult.requirements;

  const document: SourceDocumentRef = {
    id: randomUUID(),
    fileName: input.fileName,
    mimeType: input.mimeType,
    type,
    size: input.buffer.byteLength,
    uploadedAt: new Date().toISOString(),
    textExtracted: true,
    ...(input.language ? { language: input.language } : {}),
    checksum: createHash("sha256").update(input.buffer).digest("hex"),
  };

  return {
    document,
    extractedText: text,
    requirements:
      requirements.length > 0
        ? requirements
        : [buildRequirement(text, 0)],
    warnings,
  };
}

function limitCases(cases: GeneratedDocTestCase[], maxCasesPerRequirement: number): GeneratedDocTestCase[] {
  return cases.slice(0, Math.max(1, maxCasesPerRequirement));
}

function createPositiveCase(requirement: RequirementItem): GeneratedDocTestCase {
  const title = `${requirement.feature ?? requirement.sectionTitle ?? requirement.id} 정상 흐름 검증`;
  return {
    id: randomUUID(),
    title,
    feature: requirement.feature ?? requirement.sectionTitle ?? "문서 기반 시나리오",
    objective: requirement.acceptanceCriteria[0] ?? requirement.flow[0] ?? title,
    preconditions: requirement.preconditions,
    steps: requirement.flow.length > 0 ? requirement.flow : ["요구사항 문맥을 확인한다."],
    expectedResults:
      requirement.acceptanceCriteria.length > 0
        ? requirement.acceptanceCriteria
        : ["문서에 정의된 정상 결과가 충족된다."],
    priority: "P1",
    type: "positive",
    requirementIds: [requirement.id],
    reviewStatus: "draft",
  };
}

function createNegativeCase(requirement: RequirementItem): GeneratedDocTestCase | null {
  const exception = requirement.exceptions[0] ?? requirement.businessRules[0];
  if (!exception) return null;
  return {
    id: randomUUID(),
    title: `${requirement.feature ?? requirement.id} 예외 처리 검증`,
    feature: requirement.feature ?? requirement.sectionTitle ?? "문서 기반 시나리오",
    objective: exception,
    preconditions: requirement.preconditions,
    steps:
      requirement.flow.length > 0
        ? [...requirement.flow, "예외를 유발하는 조건으로 입력한다."]
        : ["예외 조건을 유발한다."],
    expectedResults: [exception],
    priority: "P1",
    type: "negative",
    requirementIds: [requirement.id],
    reviewStatus: "draft",
  };
}

function createBoundaryCase(requirement: RequirementItem): GeneratedDocTestCase | null {
  const rule = requirement.businessRules.find((item) =>
    /\d|최대|최소|길이|자리|횟수|max|min/i.test(item),
  );
  if (!rule) return null;
  return {
    id: randomUUID(),
    title: `${requirement.feature ?? requirement.id} 경계값 검증`,
    feature: requirement.feature ?? requirement.sectionTitle ?? "문서 기반 시나리오",
    objective: rule,
    preconditions: requirement.preconditions,
    steps:
      requirement.flow.length > 0
        ? [...requirement.flow, "경계값 조건으로 입력한다."]
        : ["경계값 조건으로 입력한다."],
    expectedResults: [rule],
    priority: "P2",
    type: "boundary",
    requirementIds: [requirement.id],
    reviewStatus: "draft",
  };
}

async function generateDocTestCasesWithOpenAi(
  requirements: RequirementItem[],
  options: GenerateDocTestCasesOptions,
): Promise<GeneratedDocTcResult> {
  const schema = {
    type: "object",
    additionalProperties: false,
    required: ["testCases", "warnings"],
    properties: {
      testCases: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "id",
            "title",
            "feature",
            "objective",
            "preconditions",
            "steps",
            "expectedResults",
            "priority",
            "type",
            "requirementIds",
            "reviewStatus",
          ],
          properties: {
            id: { type: "string" },
            title: { type: "string" },
            feature: { type: "string" },
            objective: { type: "string" },
            preconditions: { type: "array", items: { type: "string" } },
            steps: { type: "array", items: { type: "string" } },
            expectedResults: { type: "array", items: { type: "string" } },
            priority: { type: "string", enum: ["P0", "P1", "P2", "P3"] },
            type: {
              type: "string",
              enum: ["positive", "negative", "boundary", "exception"],
            },
            requirementIds: { type: "array", items: { type: "string" } },
            reviewStatus: {
              type: "string",
              enum: ["draft", "reviewed", "approved"],
            },
          },
        },
      },
      warnings: { type: "array", items: { type: "string" } },
    },
  } as const;

  const prompt = [
    "Generate practical software test cases from the following structured requirements.",
    "Output Korean text when the input is Korean.",
    "Do not invent implementation details like selectors or API payloads.",
    `includeNegative=${String(options.includeNegative ?? true)}`,
    `includeBoundary=${String(options.includeBoundary ?? true)}`,
    `maxCasesPerRequirement=${String(options.maxCasesPerRequirement ?? 3)}`,
    JSON.stringify(requirements),
  ].join("\n");

  const result = await callOpenAiStructured<{
    testCases: GeneratedDocTestCase[];
    warnings: string[];
  }>({
    schemaName: "document_test_cases",
    schema,
    systemPrompt:
      "You are a senior QA analyst. Produce reviewable business test cases from requirements. Keep cases concrete and avoid redundant duplicates. Map every case to one or more requirementIds.",
    userPrompt: prompt,
  });

  return {
    testCases: result.testCases.map((item) => ({
      ...item,
      id: item.id || randomUUID(),
    })),
    generation: {
      provider: "openai",
      model: OPENAI_MODEL,
      promptVersion: OPENAI_PROMPT_VERSION,
      generatedAt: new Date().toISOString(),
      warnings: result.warnings,
    },
  };
}

export async function generateDocTestCases(
  requirements: RequirementItem[],
  options: GenerateDocTestCasesOptions = {},
): Promise<GeneratedDocTcResult> {
  const includeNegative = options.includeNegative ?? true;
  const includeBoundary = options.includeBoundary ?? true;
  const maxCasesPerRequirement = options.maxCasesPerRequirement ?? 3;
  const warnings: string[] = [];
  const testCases: GeneratedDocTestCase[] = [];

  if (canUseOpenAi()) {
    try {
      return await generateDocTestCasesWithOpenAi(requirements, options);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      warnings.push(`LLM TC 생성 실패로 규칙 기반 생성으로 fallback 했습니다: ${message}`);
    }
  } else {
    warnings.push("OPENAI_API_KEY가 없어 규칙 기반 TC 생성을 사용했습니다.");
  }

  for (const requirement of requirements) {
    const perRequirement: GeneratedDocTestCase[] = [createPositiveCase(requirement)];
    if (includeNegative) {
      const negative = createNegativeCase(requirement);
      if (negative) perRequirement.push(negative);
    }
    if (includeBoundary) {
      const boundary = createBoundaryCase(requirement);
      if (boundary) perRequirement.push(boundary);
    }
    if (perRequirement.length === 1 && requirement.exceptions.length === 0) {
      warnings.push(`${requirement.id}: 예외/경계 조건이 부족해 정상 케이스만 생성했습니다.`);
    }
    testCases.push(...limitCases(perRequirement, maxCasesPerRequirement));
  }

  return {
    testCases,
    generation: {
      provider: "builtin",
      model: "rules-v1",
      promptVersion: OPENAI_PROMPT_VERSION,
      generatedAt: new Date().toISOString(),
      warnings,
    },
  };
}

function toCaseId(prefix: string, index: number): string {
  return `${prefix}-TC-${String(index + 1).padStart(3, "0")}`;
}

export function convertGeneratedDocTcToExcelCases(
  cases: GeneratedDocTestCase[],
): ExcelTestCase[] {
  const byFeature = new Map<string, GeneratedDocTestCase[]>();
  for (const item of cases) {
    const key = item.feature.trim() || "문서 기반 TC";
    const list = byFeature.get(key) ?? [];
    list.push(item);
    byFeature.set(key, list);
  }
  return Array.from(byFeature.entries()).map(([feature, featureCases], featureIndex) => ({
    feature,
    sheetName: "DocTC",
    policyId: `DOC-${String(featureIndex + 1).padStart(3, "0")}`,
    cases: featureCases.map((item, index) => ({
      caseId: toCaseId(`DOC-${String(featureIndex + 1).padStart(3, "0")}`, index),
      priority: item.priority,
      depthPath: [item.feature, item.title],
      precondition: item.preconditions.join(" / ") || undefined,
      expected: item.expectedResults.join(" / "),
      notes: {
        defect: item.steps.join(" -> ").slice(0, 500),
      },
      automation: null,
    })),
  }));
}
