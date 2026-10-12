import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { deleteTcFile, listTcFiles, loadTcFile, saveTcFile, TC_FILE_VERSION } from "./tc-file.js";
import type { TestCase } from "./build-test-cases.js";

const SAMPLE_CASES: TestCase[] = [
  {
    id: "screen1-success",
    screenName: "로그인",
    kind: "success",
    title: "로그인 성공",
    inputs: [
      { target: "이메일", value: "user@example.com", control: "text" },
      { target: "비밀번호", value: "", control: "password" },
    ],
    buttonName: "로그인",
    expectedText: "대시보드",
  },
];

let tmpDir: string;
const originalTcFileDir = process.env.TC_FILE_DIR;

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "testflow-tc-"));
  process.env.TC_FILE_DIR = tmpDir;
});

after(() => {
  if (originalTcFileDir === undefined) delete process.env.TC_FILE_DIR;
  else process.env.TC_FILE_DIR = originalTcFileDir;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("saveTcFile", () => {
  it("파일을 저장하고 메타 정보를 반환한다", () => {
    const meta = saveTcFile("job-abc", SAMPLE_CASES);
    assert.ok(meta.fileId);
    assert.equal(meta.jobId, "job-abc");
    assert.ok(meta.savedAt);
    assert.equal(meta.caseCount, 1);

    const savedPath = path.join(tmpDir, `${meta.fileId}.json`);
    assert.ok(fs.existsSync(savedPath), "파일이 디스크에 생성되어야 한다");
  });

  it("레이블을 포함해 저장한다", () => {
    const meta = saveTcFile("job-xyz", SAMPLE_CASES, "로그인 화면 TC");
    assert.equal(meta.label, "로그인 화면 TC");
  });

  it("저장된 파일에 $version 필드가 있다", () => {
    const meta = saveTcFile("job-ver", SAMPLE_CASES);
    const raw = fs.readFileSync(path.join(tmpDir, `${meta.fileId}.json`), "utf8");
    const parsed = JSON.parse(raw) as { $version: number };
    assert.equal(parsed.$version, TC_FILE_VERSION);
  });
});

describe("loadTcFile", () => {
  it("저장된 파일을 올바르게 불러온다", () => {
    const meta = saveTcFile("job-load", SAMPLE_CASES);
    const loaded = loadTcFile(meta.fileId);
    assert.equal(loaded.jobId, "job-load");
    assert.equal(loaded.cases.length, 1);
    assert.equal(loaded.cases[0]?.id, "screen1-success");
    assert.equal(loaded.$version, TC_FILE_VERSION);
  });

  it("존재하지 않는 파일은 에러를 던진다", () => {
    assert.throws(() => loadTcFile("nonexistent-id"), /찾지 못했습니다/u);
  });

  it("버전이 다른 파일은 에러를 던진다", () => {
    const fileId = `bad-version-${Date.now()}`;
    const fp = path.join(tmpDir, `${fileId}.json`);
    fs.writeFileSync(fp, JSON.stringify({ $version: 999, jobId: "x", savedAt: "", cases: [] }), "utf8");
    assert.throws(() => loadTcFile(fileId), /버전/u);
  });
});

describe("listTcFiles", () => {
  it("저장된 파일 목록을 반환한다", () => {
    const countBefore = listTcFiles().length;
    saveTcFile("job-list1", SAMPLE_CASES);
    saveTcFile("job-list2", SAMPLE_CASES, "두번째");
    const after = listTcFiles();
    assert.ok(after.length >= countBefore + 2, `기대: ${countBefore + 2} 이상, 실제: ${after.length}`);
  });

  it("각 항목이 fileId, jobId, savedAt, caseCount 를 가진다", () => {
    const meta = saveTcFile("job-meta-check", SAMPLE_CASES);
    const files = listTcFiles();
    const found = files.find((f) => f.fileId === meta.fileId);
    assert.ok(found, "저장한 파일이 목록에 있어야 한다");
    assert.ok(found.fileId);
    assert.ok(found.savedAt);
    assert.equal(found.caseCount, 1);
  });

  it("존재하지 않는 디렉터리에서는 빈 배열을 반환한다", () => {
    const isolatedDir = path.join(os.tmpdir(), `testflow-no-dir-${Date.now()}`);
    process.env.TC_FILE_DIR = isolatedDir;
    try {
      assert.deepEqual(listTcFiles(), []);
    } finally {
      process.env.TC_FILE_DIR = tmpDir;
    }
  });
});

describe("deleteTcFile", () => {
  it("파일을 삭제한다", () => {
    const meta = saveTcFile("job-del", SAMPLE_CASES);
    deleteTcFile(meta.fileId);
    const fp = path.join(tmpDir, `${meta.fileId}.json`);
    assert.ok(!fs.existsSync(fp), "파일이 삭제되어야 한다");
  });

  it("존재하지 않는 파일 삭제는 에러를 던진다", () => {
    assert.throws(() => deleteTcFile("ghost-id"), /찾지 못했습니다/u);
  });
});
