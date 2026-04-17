import type { ExcelTestCase } from "./excelTestCaseTypes.js";

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
  checksum?: string;
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

export type GeneratedDocTcPriority = "P0" | "P1" | "P2" | "P3";
export type GeneratedDocTcType =
  | "positive"
  | "negative"
  | "boundary"
  | "exception";
export type GeneratedDocTcReviewStatus = "draft" | "reviewed" | "approved";

export interface GeneratedDocTestCase {
  id: string;
  title: string;
  feature: string;
  objective?: string;
  preconditions: string[];
  steps: string[];
  expectedResults: string[];
  priority?: GeneratedDocTcPriority;
  type?: GeneratedDocTcType;
  requirementIds: string[];
  reviewStatus?: GeneratedDocTcReviewStatus;
}

export interface DocTcGenerationMeta {
  provider: string;
  model: string;
  promptVersion: string;
  generatedAt: string;
  warnings: string[];
}

export interface ParsedDocResult {
  document: SourceDocumentRef;
  extractedText: string;
  requirements: RequirementItem[];
  warnings: string[];
}

export interface GenerateDocTestCasesOptions {
  includeNegative?: boolean;
  includeBoundary?: boolean;
  maxCasesPerRequirement?: number;
}

export interface GeneratedDocTcResult {
  testCases: GeneratedDocTestCase[];
  generation: DocTcGenerationMeta;
}

export interface ParsedDocumentRecord extends ParsedDocResult {}

export interface ExportedDocTcResult {
  testCases: ExcelTestCase[];
}
