import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import type { TestCase } from "./build-test-cases.js";
import { casesToMarkdown, casesToXlsx } from "./export-document.js";

const sample: TestCase[] = [
  {
    id: "screen-1-success",
    screenName: "관리자 로그인",
    kind: "success",
    title: "관리자 로그인 성공",
    inputs: [
      { target: "이메일", value: "" },
      { target: "비밀번호", value: "" },
    ],
    buttonName: "로그인",
    expectedText: "관리자 메인 화면으로 이동",
  },
  {
    id: "screen-1-failure-2",
    screenName: "관리자 로그인",
    kind: "failure",
    title: "관리자 로그인 실패 · 이메일",
    inputs: [{ target: "이메일", value: "not-an-email" }],
    buttonName: "로그인",
    expectedText: "올바른 이메일 형식을 입력해주세요.",
  },
];

describe("casesToMarkdown", () => {
  it("성공 값은 비워 두고 실패 값은 문서에 남긴다", () => {
    const markdown = casesToMarkdown(sample, {
      "screen-1-success": { 이메일: "admin@ikoob.com" },
    });
    assert.match(markdown, /^# 테스트 케이스/u);
    assert.match(markdown, /## 1\. 관리자 로그인 성공/u);
    assert.match(markdown, /구분: 성공 경로/u);
    assert.match(markdown, /이메일: admin@ikoob.com/u);
    assert.match(markdown, /비밀번호: 실행 시 입력/u);
    assert.match(markdown, /이메일: not-an-email/u);
    assert.match(markdown, /올바른 이메일 형식을 입력해주세요\./u);
  });
});

describe("casesToXlsx", () => {
  it("엑셀에서 열 수 있는 시트에 TC 문장을 넣는다", () => {
    const bytes = casesToXlsx(sample);
    const dir = mkdtempSync(join(tmpdir(), "tc-xlsx-"));
    const file = join(dir, "tc.xlsx");
    writeFileSync(file, bytes);
    const listing = execFileSync("unzip", ["-t", file], { encoding: "utf8" });
    assert.match(listing, /xl\/worksheets\/sheet1.xml/u);
    const sheet = execFileSync("unzip", ["-p", file, "xl/worksheets/sheet1.xml"], { encoding: "utf8" });
    assert.match(sheet, /관리자 로그인 성공/u);
    assert.match(sheet, /not-an-email/u);
    assert.match(sheet, /올바른 이메일 형식을 입력해주세요\./u);
    assert.equal(readFileSync(file)[0], 0x50);
  });
});
