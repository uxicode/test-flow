import mammoth from "mammoth";
import { sanitizeExtractedText } from "../textQuality";

export async function extractDocxText(file: File): Promise<{
  text: string;
  warnings: string[];
}> {
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  const warnings = (result.messages ?? [])
    .filter((m) => m.type === "warning" || m.type === "error")
    .map((m) => m.message);
  return {
    text: sanitizeExtractedText(result.value ?? ""),
    warnings,
  };
}
