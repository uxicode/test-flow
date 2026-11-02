import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { loadAnalysisFile, saveAnalysisFile } from "./analysis-file.js";
import type { ScreenAnalysis } from "./types.js";

describe("analysis-file", () => {
  const screens: ScreenAnalysis[] = [
    { screenKey: "screen-1", screenName: "로그인", inputs: [], successText: "대시보드", buttonName: "로그인" },
  ];

  it("저장한 분석 결과를 그대로 불러온다", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "analysis-file-"));
    saveAnalysisFile("job-1", screens, dir);
    assert.deepEqual(loadAnalysisFile("job-1", dir), screens);
  });

  it("없는 작업이면 null", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "analysis-file-"));
    assert.equal(loadAnalysisFile("missing", dir), null);
  });
});
