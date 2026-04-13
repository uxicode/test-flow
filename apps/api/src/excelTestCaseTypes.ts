/**
 * 테스트케이스_ex 양식: 정책 ID · 테스트케이스 ID · Depth · 사전조건 · 기대결과 중심.
 * (선택) 자동화 열이 있으면 Playwright API 라인 생성에 사용.
 */

export type ExcelAutomationAction = "click" | "input" | "navigate";

export interface ExcelAutomationSlice {
  testId?: string;
  action?: ExcelAutomationAction;
  value?: string;
  /** assertion 미니 DSL: visible:, text:, url: (비어 있으면 무시) */
  assertion?: string;
}

export interface ExcelTcCaseRow {
  caseId: string;
  priority?: string;
  depthPath: string[];
  precondition?: string;
  expected: string;
  notes?: {
    chrome?: string;
    edge?: string;
    defect?: string;
  };
  automation?: ExcelAutomationSlice | null;
}

/** 시트·정책 단위. `feature`는 describe 제목 및 파일명에 사용 (`{sheet}_{policyId}`). */
export interface ExcelTestCase {
  feature: string;
  sheetName: string;
  policyId: string;
  cases: ExcelTcCaseRow[];
}

/** 자동화 열 파싱용 (생성기에서 사용) */
export type ExcelAssertionType = "visible" | "text" | "url";

export interface ExcelAssertion {
  type: ExcelAssertionType;
  target?: string;
  expected?: string;
}
