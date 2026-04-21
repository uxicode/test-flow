import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { ocrRecognizeText } from "../ocr";
import { sanitizeExtractedText, scoreTextQuality } from "../textQuality";
import type { DocTcProgress } from "../types";

(pdfjsLib as unknown as { GlobalWorkerOptions: { workerSrc: string } })
  .GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const OCR_SCORE_THRESHOLD = 0.25;
const OCR_MIN_PAGE_LENGTH = 24;
const OCR_RENDER_SCALE = 2.0;

export interface PdfExtractionResult {
  text: string;
  warnings: string[];
  usedOcr: boolean;
}

export interface PdfExtractionOptions {
  language: "ko" | "en";
  onProgress?: (progress: DocTcProgress) => void;
}

async function renderPageToCanvas(
  page: {
    getViewport: (opts: { scale: number }) => { width: number; height: number };
    render: (opts: unknown) => { promise: Promise<void> };
  },
): Promise<HTMLCanvasElement> {
  const viewport = page.getViewport({ scale: OCR_RENDER_SCALE });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas_2d_context_unavailable");
  await page.render({ canvasContext: ctx, viewport }).promise;
  return canvas;
}

export async function extractPdfText(
  file: File,
  options: PdfExtractionOptions,
): Promise<PdfExtractionResult> {
  const warnings: string[] = [];
  const buffer = new Uint8Array(await file.arrayBuffer());
  const loadingTask = (pdfjsLib as unknown as {
    getDocument: (opts: { data: Uint8Array }) => {
      promise: Promise<{
        numPages: number;
        getPage: (pageNumber: number) => Promise<{
          getTextContent: () => Promise<{
            items: { str?: string; hasEOL?: boolean }[];
          }>;
          getViewport: (opts: {
            scale: number;
          }) => { width: number; height: number };
          render: (opts: unknown) => { promise: Promise<void> };
          cleanup: () => void;
        }>;
      }>;
    };
  }).getDocument({ data: buffer });
  const pdf = await loadingTask.promise;
  const { numPages } = pdf;
  const pageTexts: string[] = [];
  let usedOcr = false;

  for (let pageNumber = 1; pageNumber <= numPages; pageNumber++) {
    options.onProgress?.({
      phase: "extracting",
      message: `PDF 텍스트 추출 중`,
      pageCurrent: pageNumber,
      pageTotal: numPages,
    });
    const page = await pdf.getPage(pageNumber);
    let pageText = "";
    try {
      const content = await page.getTextContent();
      pageText = content.items
        .map((item) => {
          const str = typeof item.str === "string" ? item.str : "";
          return item.hasEOL ? `${str}\n` : str;
        })
        .join("");
    } catch (err) {
      warnings.push(
        `${pageNumber}페이지 텍스트 추출 실패: ${(err as Error).message}`,
      );
    }
    const cleaned = sanitizeExtractedText(pageText);
    const quality = scoreTextQuality(cleaned);
    const needsOcr =
      cleaned.length < OCR_MIN_PAGE_LENGTH || quality.score < OCR_SCORE_THRESHOLD;

    if (needsOcr) {
      try {
        options.onProgress?.({
          phase: "ocr",
          message: `OCR 수행 중`,
          pageCurrent: pageNumber,
          pageTotal: numPages,
        });
        const canvas = await renderPageToCanvas(page);
        const ocrText = await ocrRecognizeText(canvas, options.language);
        const cleanedOcr = sanitizeExtractedText(ocrText);
        if (cleanedOcr.length > cleaned.length) {
          pageTexts.push(cleanedOcr);
          usedOcr = true;
        } else {
          pageTexts.push(cleaned);
        }
      } catch (err) {
        warnings.push(
          `${pageNumber}페이지 OCR 실패: ${(err as Error).message}`,
        );
        pageTexts.push(cleaned);
      }
    } else {
      pageTexts.push(cleaned);
    }
    page.cleanup();
  }

  return {
    text: pageTexts.join("\n\n"),
    warnings,
    usedOcr,
  };
}
