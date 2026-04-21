import Tesseract from "tesseract.js";

const { createWorker } = Tesseract;

type TesseractWorker = Awaited<ReturnType<typeof createWorker>>;
export type OcrImage = Parameters<TesseractWorker["recognize"]>[0];

type OcrLang = "ko" | "en";

interface WorkerCache {
  worker: TesseractWorker;
  lang: OcrLang;
}

let cached: WorkerCache | null = null;
let initPromise: Promise<TesseractWorker> | null = null;

function langsForOption(lang: OcrLang): string {
  return lang === "ko" ? "kor+eng" : "eng";
}

export async function getOcrWorker(lang: OcrLang): Promise<TesseractWorker> {
  if (cached && cached.lang === lang) return cached.worker;
  if (initPromise) await initPromise;
  if (cached && cached.lang !== lang) {
    try {
      await cached.worker.terminate();
    } catch {
      /* ignore */
    }
    cached = null;
  }
  initPromise = createWorker(langsForOption(lang));
  const worker = await initPromise;
  initPromise = null;
  cached = { worker, lang };
  return worker;
}

export async function ocrRecognizeText(
  image: OcrImage,
  lang: OcrLang,
): Promise<string> {
  const worker = await getOcrWorker(lang);
  const { data } = await worker.recognize(image);
  return typeof data.text === "string" ? data.text : "";
}

export async function terminateOcr(): Promise<void> {
  if (!cached) return;
  try {
    await cached.worker.terminate();
  } catch {
    /* ignore */
  }
  cached = null;
}
