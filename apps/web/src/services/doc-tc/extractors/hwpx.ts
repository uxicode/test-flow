import JSZip from "jszip";
import { sanitizeExtractedText } from "../textQuality";

function collectTextNodes(root: Document | Element): string[] {
  const out: string[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let current: Node | null = walker.nextNode();
  while (current) {
    const value = current.nodeValue ?? "";
    if (value.trim().length > 0) out.push(value);
    current = walker.nextNode();
  }
  return out;
}

export async function extractHwpxText(file: File): Promise<{
  text: string;
  warnings: string[];
}> {
  const warnings: string[] = [];
  const arrayBuffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);

  const sectionEntries = Object.keys(zip.files)
    .filter(
      (name) =>
        /Contents\/(section\d+\.xml|header\.xml)$/i.test(name) ||
        /^Contents\/section\d+\.xml$/i.test(name),
    )
    .sort();

  if (sectionEntries.length === 0) {
    warnings.push("HWPX 내부에서 Contents/section*.xml을 찾지 못했습니다.");
    return { text: "", warnings };
  }

  const parser = new DOMParser();
  const paragraphs: string[] = [];
  for (const entryName of sectionEntries) {
    const entry = zip.files[entryName];
    if (!entry || entry.dir) continue;
    try {
      const xml = await entry.async("string");
      const doc = parser.parseFromString(xml, "application/xml");
      const parseError = doc.querySelector("parsererror");
      if (parseError) {
        warnings.push(`${entryName} 파싱 경고: ${parseError.textContent ?? ""}`);
        continue;
      }
      const pNodes = doc.getElementsByTagName("*");
      const bucket: string[] = [];
      for (let i = 0; i < pNodes.length; i++) {
        const node = pNodes.item(i);
        if (!node) continue;
        const local = node.localName?.toLowerCase();
        if (local === "t" || local === "char") {
          const txt = node.textContent ?? "";
          if (txt.trim()) bucket.push(txt);
        }
      }
      if (bucket.length === 0) {
        for (const line of collectTextNodes(doc)) bucket.push(line);
      }
      paragraphs.push(bucket.join(""));
    } catch (err) {
      warnings.push(
        `${entryName} 추출 실패: ${(err as Error).message ?? String(err)}`,
      );
    }
  }

  const text = sanitizeExtractedText(paragraphs.join("\n"));
  return { text, warnings };
}
