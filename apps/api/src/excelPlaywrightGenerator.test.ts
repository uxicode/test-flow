import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  generateMergedSpecFromTestCases,
  generateSpecFileContent,
  generateSpecFilesFromTestCases,
  sanitizeSpecBaseName,
} from "./excelPlaywrightGenerator.js";
import type { ExcelTestCase } from "./excelTestCaseTypes.js";

describe("sanitizeSpecBaseName", () => {
  it("sanitizes path chars", () => {
    assert.equal(sanitizeSpecBaseName("Sheet1_HC-001"), "Sheet1_HC-001");
    assert.equal(sanitizeSpecBaseName("a/b"), "a_b");
  });
});

describe("generateSpecFileContent", () => {
  it("emits test() with block comment and policy case id", () => {
    const tc: ExcelTestCase = {
      feature: "S_P1",
      sheetName: "S",
      policyId: "P1",
      cases: [
        {
          caseId: "1",
          priority: "P1",
          depthPath: ["GNB"],
          expected: "화면 이동",
        },
      ],
    };
    const src = generateSpecFileContent(tc);
    assert.ok(!src.includes("test.fixme"), "should not contain test.fixme");
    assert.ok(src.includes("test("), "should contain test(");
    assert.ok(src.includes("TC-1"));
    assert.ok(src.includes("[P1]"));
    assert.ok(src.includes("Expected:"));
    assert.ok(src.includes("import { test, expect }"));
  });

  it("injects beforeEach page.goto when baseUrl is given", () => {
    const tc: ExcelTestCase = {
      feature: "S_P1",
      sheetName: "S",
      policyId: "P1",
      cases: [{ caseId: "1", depthPath: [], expected: "e" }],
    };
    const src = generateSpecFileContent(tc, "https://example.com");
    assert.ok(src.includes("beforeEach"));
    assert.ok(src.includes('page.goto("https://example.com")'));
  });

  it("no beforeEach when baseUrl is omitted", () => {
    const tc: ExcelTestCase = {
      feature: "S_P1",
      sheetName: "S",
      policyId: "P1",
      cases: [{ caseId: "1", depthPath: [], expected: "e" }],
    };
    const src = generateSpecFileContent(tc);
    assert.ok(!src.includes("beforeEach"));
  });

  it("emits automation click when present", () => {
    const tc: ExcelTestCase = {
      feature: "S_P1",
      sheetName: "S",
      policyId: "P1",
      cases: [
        {
          caseId: "9",
          depthPath: [],
          expected: "x",
          automation: { action: "click", testId: "btn-go" },
        },
      ],
    };
    const src = generateSpecFileContent(tc);
    assert.ok(src.includes('getByTestId("btn-go").click()'));
  });
});

describe("generateMergedSpecFromTestCases", () => {
  it("emits one import and multiple describe blocks", () => {
    const a: ExcelTestCase = {
      feature: "S_A",
      sheetName: "S",
      policyId: "A",
      cases: [
        { caseId: "1", depthPath: ["x"], expected: "e1" },
      ],
    };
    const b: ExcelTestCase = {
      feature: "S_B",
      sheetName: "S",
      policyId: "B",
      cases: [
        { caseId: "2", depthPath: ["y"], expected: "e2" },
      ],
    };
    const src = generateMergedSpecFromTestCases([a, b]);
    assert.equal((src.match(/import \{ test, expect \}/g) ?? []).length, 1);
    assert.equal((src.match(/test\.describe/g) ?? []).length, 2);
    assert.ok(src.includes("TC-1"));
    assert.ok(src.includes("TC-2"));
  });

  it("returns empty string for empty input", () => {
    assert.equal(generateMergedSpecFromTestCases([]), "");
  });
});

describe("generateSpecFilesFromTestCases", () => {
  it("dedupes file names when feature collides", () => {
    const files = generateSpecFilesFromTestCases([
      { feature: "A_B", sheetName: "A", policyId: "B", cases: [] },
      { feature: "A|B", sheetName: "A", policyId: "B2", cases: [] },
    ] as ExcelTestCase[]);
    assert.ok(files[0]!.fileName.endsWith(".spec.ts"));
    assert.equal(files.length, 2);
  });
});
