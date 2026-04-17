import type {
  DocTcGenerationMeta,
  GeneratedDocTestCase,
  GenerateDocTestCasesOptions,
  RequirementItem,
  RequirementSourceSpan,
  SourceDocumentRef,
  SourceDocumentType,
} from "./docTcTypes.js";

const DOC_TYPES = new Set(["pdf", "docx", "md", "txt", "hwpx"]);
const LANGS = new Set(["ko", "en"]);
const PRIORITIES = new Set(["P0", "P1", "P2", "P3"]);
const CASE_TYPES = new Set(["positive", "negative", "boundary", "exception"]);
const REVIEW_STATUSES = new Set(["draft", "reviewed", "approved"]);

function isStringArray(raw: unknown): raw is string[] {
  return Array.isArray(raw) && raw.every((item) => typeof item === "string");
}

function parseSourceSpans(raw: unknown): RequirementSourceSpan[] | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) return undefined;
  const out: RequirementSourceSpan[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") return undefined;
    const o = item as Record<string, unknown>;
    if (o.page !== undefined && typeof o.page !== "number") return undefined;
    if (o.heading !== undefined && typeof o.heading !== "string") return undefined;
    if (o.quote !== undefined && typeof o.quote !== "string") return undefined;
    out.push({
      ...(typeof o.page === "number" ? { page: o.page } : {}),
      ...(typeof o.heading === "string" ? { heading: o.heading } : {}),
      ...(typeof o.quote === "string" ? { quote: o.quote } : {}),
    });
  }
  return out;
}

export function parseSourceDocumentRef(raw: unknown): SourceDocumentRef | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== "string") return null;
  if (typeof o.fileName !== "string") return null;
  if (typeof o.mimeType !== "string") return null;
  if (typeof o.type !== "string" || !DOC_TYPES.has(o.type)) return null;
  if (typeof o.size !== "number") return null;
  if (typeof o.uploadedAt !== "string") return null;
  if (typeof o.textExtracted !== "boolean") return null;
  if (o.language !== undefined && (typeof o.language !== "string" || !LANGS.has(o.language))) {
    return null;
  }
  if (o.checksum !== undefined && typeof o.checksum !== "string") return null;
  return {
    id: o.id,
    fileName: o.fileName,
    mimeType: o.mimeType,
    type: o.type as SourceDocumentType,
    size: o.size,
    uploadedAt: o.uploadedAt,
    textExtracted: o.textExtracted,
    ...(typeof o.language === "string" ? { language: o.language as "ko" | "en" } : {}),
    ...(typeof o.checksum === "string" ? { checksum: o.checksum } : {}),
  };
}

function parseRequirementItem(raw: unknown): RequirementItem | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== "string") return null;
  if (o.sectionTitle !== undefined && typeof o.sectionTitle !== "string") return null;
  if (o.feature !== undefined && typeof o.feature !== "string") return null;
  if (o.actor !== undefined && typeof o.actor !== "string") return null;
  if (!isStringArray(o.preconditions)) return null;
  if (!isStringArray(o.flow)) return null;
  if (!isStringArray(o.businessRules)) return null;
  if (!isStringArray(o.acceptanceCriteria)) return null;
  if (!isStringArray(o.exceptions)) return null;
  const sourceSpans = parseSourceSpans(o.sourceSpans);
  if (o.sourceSpans !== undefined && sourceSpans === undefined) return null;
  return {
    id: o.id,
    ...(typeof o.sectionTitle === "string" ? { sectionTitle: o.sectionTitle } : {}),
    ...(typeof o.feature === "string" ? { feature: o.feature } : {}),
    ...(typeof o.actor === "string" ? { actor: o.actor } : {}),
    preconditions: o.preconditions,
    flow: o.flow,
    businessRules: o.businessRules,
    acceptanceCriteria: o.acceptanceCriteria,
    exceptions: o.exceptions,
    ...(sourceSpans ? { sourceSpans } : {}),
  };
}

export function parseRequirementItems(raw: unknown): RequirementItem[] | null {
  if (!Array.isArray(raw)) return null;
  const out: RequirementItem[] = [];
  for (const item of raw) {
    const parsed = parseRequirementItem(item);
    if (!parsed) return null;
    out.push(parsed);
  }
  return out;
}

function parseGeneratedDocTestCase(raw: unknown): GeneratedDocTestCase | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== "string") return null;
  if (typeof o.title !== "string") return null;
  if (typeof o.feature !== "string") return null;
  if (o.objective !== undefined && typeof o.objective !== "string") return null;
  if (!isStringArray(o.preconditions)) return null;
  if (!isStringArray(o.steps)) return null;
  if (!isStringArray(o.expectedResults)) return null;
  if (!isStringArray(o.requirementIds)) return null;
  if (o.priority !== undefined && (typeof o.priority !== "string" || !PRIORITIES.has(o.priority))) {
    return null;
  }
  if (o.type !== undefined && (typeof o.type !== "string" || !CASE_TYPES.has(o.type))) {
    return null;
  }
  if (
    o.reviewStatus !== undefined &&
    (typeof o.reviewStatus !== "string" || !REVIEW_STATUSES.has(o.reviewStatus))
  ) {
    return null;
  }
  return {
    id: o.id,
    title: o.title,
    feature: o.feature,
    ...(typeof o.objective === "string" ? { objective: o.objective } : {}),
    preconditions: o.preconditions,
    steps: o.steps,
    expectedResults: o.expectedResults,
    requirementIds: o.requirementIds,
    ...(typeof o.priority === "string" ? { priority: o.priority as GeneratedDocTestCase["priority"] } : {}),
    ...(typeof o.type === "string" ? { type: o.type as GeneratedDocTestCase["type"] } : {}),
    ...(typeof o.reviewStatus === "string"
      ? { reviewStatus: o.reviewStatus as GeneratedDocTestCase["reviewStatus"] }
      : {}),
  };
}

export function parseGeneratedDocTestCases(raw: unknown): GeneratedDocTestCase[] | null {
  if (!Array.isArray(raw)) return null;
  const out: GeneratedDocTestCase[] = [];
  for (const item of raw) {
    const parsed = parseGeneratedDocTestCase(item);
    if (!parsed) return null;
    out.push(parsed);
  }
  return out;
}

export function parseDocTcGenerationMeta(raw: unknown): DocTcGenerationMeta | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.provider !== "string") return null;
  if (typeof o.model !== "string") return null;
  if (typeof o.promptVersion !== "string") return null;
  if (typeof o.generatedAt !== "string") return null;
  if (!isStringArray(o.warnings)) return null;
  return {
    provider: o.provider,
    model: o.model,
    promptVersion: o.promptVersion,
    generatedAt: o.generatedAt,
    warnings: o.warnings,
  };
}

export function parseGenerateDocTcOptions(raw: unknown): GenerateDocTestCasesOptions | null {
  if (raw === undefined) return {};
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.includeNegative !== undefined && typeof o.includeNegative !== "boolean") {
    return null;
  }
  if (o.includeBoundary !== undefined && typeof o.includeBoundary !== "boolean") {
    return null;
  }
  if (
    o.maxCasesPerRequirement !== undefined &&
    (typeof o.maxCasesPerRequirement !== "number" ||
      !Number.isFinite(o.maxCasesPerRequirement) ||
      o.maxCasesPerRequirement < 1)
  ) {
    return null;
  }
  return {
    ...(typeof o.includeNegative === "boolean"
      ? { includeNegative: o.includeNegative }
      : {}),
    ...(typeof o.includeBoundary === "boolean"
      ? { includeBoundary: o.includeBoundary }
      : {}),
    ...(typeof o.maxCasesPerRequirement === "number"
      ? { maxCasesPerRequirement: Math.floor(o.maxCasesPerRequirement) }
      : {}),
  };
}
