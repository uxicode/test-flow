import { sanitizeExtractedText } from "../textQuality";

export async function extractPlainText(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let decoded: string;
  try {
    decoded = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  } catch {
    decoded = new TextDecoder("utf-8").decode(bytes);
  }
  return sanitizeExtractedText(decoded);
}
