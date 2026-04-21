export type SourceDocumentType = "pdf" | "docx" | "md" | "txt" | "hwpx";

export interface SourceDocumentRef {
  id: string;
  fileName: string;
  mimeType: string;
  type: SourceDocumentType;
  size: number;
  uploadedAt: string;
  textExtracted: boolean;
  language?: "ko" | "en";
}

export interface ExtractedDoc {
  document: SourceDocumentRef;
  text: string;
  warnings: string[];
  usedOcr: boolean;
}

export interface RequirementSourceSpan {
  page?: number;
  heading?: string;
  quote?: string;
}

export interface RequirementItem {
  id: string;
  sectionTitle?: string;
  feature?: string;
  actor?: string;
  preconditions: string[];
  flow: string[];
  businessRules: string[];
  acceptanceCriteria: string[];
  exceptions: string[];
  sourceSpans?: RequirementSourceSpan[];
}

export type TestCaseType = "positive" | "negative" | "boundary" | "exception";
export type TestCasePriority = "P0" | "P1" | "P2" | "P3";

export interface GeneratedDocTestCase {
  id: string;
  title: string;
  feature: string;
  objective?: string;
  preconditions: string[];
  steps: string[];
  expectedResults: string[];
  priority: TestCasePriority;
  type: TestCaseType;
  requirementIds: string[];
}

export interface DocTcOptions {
  includeNegative: boolean;
  includeBoundary: boolean;
  maxCasesPerRequirement: number;
  language: "ko" | "en";
}

export const DEFAULT_DOC_TC_OPTIONS: DocTcOptions = {
  includeNegative: true,
  includeBoundary: true,
  maxCasesPerRequirement: 4,
  language: "ko",
};

export interface DocTcProgress {
  phase:
    | "idle"
    | "extracting"
    | "ocr"
    | "requirements"
    | "testcases"
    | "done"
    | "error";
  message?: string;
  pageCurrent?: number;
  pageTotal?: number;
}

export interface DocTcResult {
  document: SourceDocumentRef;
  text: string;
  requirements: RequirementItem[];
  testCases: GeneratedDocTestCase[];
  warnings: string[];
}
