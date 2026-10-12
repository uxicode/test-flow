import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { TestCase } from "./build-test-cases.js";

/** TC 파일 스키마 버전 — 스키마 변경 시 올린다. */
export const TC_FILE_VERSION = 1;

export interface TcFile {
  /** 스키마 버전 */
  $version: number;
  /** 분석 작업 ID (서버 인메모리 키) */
  jobId: string;
  /** 분석 결과를 저장한 시각 (ISO 8601) */
  savedAt: string;
  /** 파일 이름으로 쓸 레이블 (선택) */
  label?: string;
  /** 생성된 테스트 케이스 목록 */
  cases: TestCase[];
}

export interface TcFileMeta {
  fileId: string;
  jobId: string;
  savedAt: string;
  label?: string;
  caseCount: number;
}

function resolveDir(): string {
  const fromEnv = process.env.TC_FILE_DIR;
  if (fromEnv) return path.resolve(fromEnv);
  return path.resolve(process.cwd(), "../../data/tc");
}

function filePath(dir: string, fileId: string): string {
  return path.join(dir, `${fileId}.json`);
}

export function saveTcFile(jobId: string, cases: TestCase[], label?: string): TcFileMeta {
  const dir = resolveDir();
  fs.mkdirSync(dir, { recursive: true });

  const savedAt = new Date().toISOString();
  const fileId = `${Date.now()}-${randomUUID().slice(0, 8)}`;

  const tcFile: TcFile = {
    $version: TC_FILE_VERSION,
    jobId,
    savedAt,
    ...(label ? { label } : {}),
    cases,
  };

  fs.writeFileSync(filePath(dir, fileId), JSON.stringify(tcFile, null, 2), "utf8");

  return { fileId, jobId, savedAt, label, caseCount: cases.length };
}

export function loadTcFile(fileId: string): TcFile {
  const dir = resolveDir();
  const fp = filePath(dir, fileId);
  if (!fs.existsSync(fp)) throw new Error(`TC 파일을 찾지 못했습니다: ${fileId}`);
  const raw = fs.readFileSync(fp, "utf8");
  const parsed = JSON.parse(raw) as TcFile;
  if (parsed.$version !== TC_FILE_VERSION)
    throw new Error(`지원하지 않는 TC 파일 버전입니다: ${parsed.$version}`);
  return parsed;
}

export function listTcFiles(): TcFileMeta[] {
  const dir = resolveDir();
  if (!fs.existsSync(dir)) return [];
  const files = fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .reverse();

  const metas: TcFileMeta[] = [];
  for (const name of files) {
    try {
      const raw = fs.readFileSync(path.join(dir, name), "utf8");
      const parsed = JSON.parse(raw) as TcFile;
      const fileId = name.replace(/\.json$/u, "");
      metas.push({
        fileId,
        jobId: parsed.jobId,
        savedAt: parsed.savedAt,
        label: parsed.label,
        caseCount: parsed.cases.length,
      });
    } catch {
      // 손상된 파일은 목록에서 제외한다.
    }
  }
  return metas;
}

export function deleteTcFile(fileId: string): void {
  const dir = resolveDir();
  const fp = filePath(dir, fileId);
  if (!fs.existsSync(fp)) throw new Error(`TC 파일을 찾지 못했습니다: ${fileId}`);
  fs.unlinkSync(fp);
}
