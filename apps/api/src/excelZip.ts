import archiver from "archiver";
import type { GeneratedSpecFile } from "./excelPlaywrightGenerator.js";

export function zipGeneratedSpecs(files: GeneratedSpecFile[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const archive = archiver("zip", { zlib: { level: 9 } });
    const chunks: Buffer[] = [];
    archive.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });
    archive.on("end", () => {
      resolve(Buffer.concat(chunks));
    });
    archive.on("error", reject);
    for (const f of files) {
      archive.append(f.content, { name: `generated-tests/${f.fileName}` });
    }
    void archive.finalize().catch(reject);
  });
}
