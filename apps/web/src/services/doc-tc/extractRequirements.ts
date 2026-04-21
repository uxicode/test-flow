import type { RequirementItem } from "./types";

interface Section {
  title: string;
  lines: string[];
}

const HEADING_PATTERNS: RegExp[] = [
  /^#{1,6}\s+(.+)$/,
  /^[0-9]+\.\s+(.+)$/,
  /^[0-9]+\.[0-9]+(?:\.[0-9]+)*\s+(.+)$/,
  /^[IVXLCDM]+\.\s+(.+)$/i,
  /^제\s*[0-9]+\s*[장절조]\s+(.+)$/,
  /^\[(.+)\]$/,
];

const DESCRIPTION_HEADING_RE =
  /^\s*(description|desc|설명|상세\s*설명|상세|내용)\s*:?\s*$/i;

const DESCRIPTION_LABEL_RE =
  /^\s*(description|desc|설명|상세\s*설명|상세|내용)\s*[:：]\s*(.+)$/i;

const BULLET_PREFIX = /^\s*(?:[-*•·▪◦]|[0-9]+[.)])\s+/;

const KEYWORDS: Record<keyof BucketAccumulator, RegExp> = {
  preconditions: /(사전\s*조건|전제\s*조건|precondition|given)/i,
  flow: /(흐름|단계|시나리오|절차|process|flow|step|when)/i,
  businessRules: /(규칙|정책|제약|비즈니스\s*룰|rule|policy|constraint)/i,
  acceptanceCriteria:
    /(수용\s*기준|인수\s*기준|acceptance|ac\b|기대\s*결과|expected|then)/i,
  exceptions: /(예외|오류|에러|실패|exception|error|fail)/i,
};

interface BucketAccumulator {
  preconditions: string[];
  flow: string[];
  businessRules: string[];
  acceptanceCriteria: string[];
  exceptions: string[];
}

function newBuckets(): BucketAccumulator {
  return {
    preconditions: [],
    flow: [],
    businessRules: [],
    acceptanceCriteria: [],
    exceptions: [],
  };
}

function matchHeading(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  if (DESCRIPTION_HEADING_RE.test(trimmed)) {
    return trimmed.replace(/[:：]\s*$/, "").trim();
  }
  for (const pattern of HEADING_PATTERNS) {
    const m = trimmed.match(pattern);
    if (m) return m[1].trim();
  }
  if (
    trimmed.length <= 60 &&
    /^[\u3131-\uD7A3A-Za-z][\u3131-\uD7A3A-Za-z0-9 ·:/()\-]{1,}$/.test(trimmed) &&
    !trimmed.endsWith(".") &&
    !trimmed.endsWith("다") &&
    !trimmed.includes(",")
  ) {
    return null;
  }
  return null;
}

function splitSections(text: string): Section[] {
  const lines = text.split(/\r?\n/);
  const sections: Section[] = [];
  let current: Section = { title: "개요", lines: [] };
  for (const raw of lines) {
    const heading = matchHeading(raw);
    if (heading) {
      if (current.lines.length > 0 || current.title !== "개요") {
        sections.push(current);
      }
      current = { title: heading, lines: [] };
      continue;
    }
    current.lines.push(raw);
  }
  if (current.lines.length > 0 || sections.length === 0) {
    sections.push(current);
  }
  return sections.filter((s) => s.lines.some((l) => l.trim().length > 0));
}

function classifyLine(line: string): keyof BucketAccumulator | "flow" {
  for (const key of Object.keys(KEYWORDS) as (keyof BucketAccumulator)[]) {
    if (KEYWORDS[key].test(line)) return key;
  }
  return "flow";
}

function takeBulletBlock(lines: string[]): {
  items: string[];
  prefix: keyof BucketAccumulator | null;
  headingLine: string | null;
} {
  const items: string[] = [];
  let prefix: keyof BucketAccumulator | null = null;
  let headingLine: string | null = null;
  let previousLine: string | null = null;
  for (const raw of lines) {
    const line = raw.replace(/\s+$/g, "");
    if (!line.trim()) continue;
    if (BULLET_PREFIX.test(line)) {
      const cleaned = line.replace(BULLET_PREFIX, "").trim();
      if (cleaned) items.push(cleaned);
      if (!prefix && previousLine) {
        const key = detectBucketKey(previousLine);
        if (key) {
          prefix = key;
          headingLine = previousLine.trim();
        }
      }
    } else {
      previousLine = line;
    }
  }
  return { items, prefix, headingLine };
}

function detectBucketKey(
  line: string,
): keyof BucketAccumulator | null {
  for (const key of Object.keys(KEYWORDS) as (keyof BucketAccumulator)[]) {
    if (KEYWORDS[key].test(line)) return key;
  }
  return null;
}

function collectSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?。？！])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function classifySectionLines(
  section: Section,
): BucketAccumulator {
  const buckets = newBuckets();
  const isDescriptionSection = DESCRIPTION_HEADING_RE.test(section.title);
  let currentBucket: keyof BucketAccumulator | null = isDescriptionSection
    ? "flow"
    : null;

  for (const raw of section.lines) {
    const line = raw.trim();
    if (!line) {
      currentBucket = isDescriptionSection ? "flow" : null;
      continue;
    }
    const inlineDesc = DESCRIPTION_LABEL_RE.exec(line);
    if (inlineDesc) {
      const content = inlineDesc[2].trim();
      if (content) buckets.flow.push(content);
      currentBucket = "flow";
      continue;
    }
    const bucketKey = detectBucketKey(line);
    if (bucketKey && !BULLET_PREFIX.test(line)) {
      currentBucket = bucketKey;
      const contentAfterColon = line.split(/[:：]/, 2)[1]?.trim();
      if (contentAfterColon) buckets[bucketKey].push(contentAfterColon);
      continue;
    }
    if (BULLET_PREFIX.test(line)) {
      const cleaned = line.replace(BULLET_PREFIX, "").trim();
      if (!cleaned) continue;
      const target = currentBucket ?? classifyLine(cleaned);
      buckets[target].push(cleaned);
      continue;
    }
    const sentences = collectSentences(line);
    for (const sentence of sentences) {
      const target = currentBucket ?? classifyLine(sentence);
      buckets[target].push(sentence);
    }
  }
  return buckets;
}

function dedupeAndTrim(values: string[], max = 10): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const v = value.replace(/\s+/g, " ").trim();
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
    if (out.length >= max) break;
  }
  return out;
}

function deriveFeature(title: string): string {
  return title
    .replace(/^[\[【]\s*/, "")
    .replace(/\s*[\]】]$/, "")
    .replace(/\s+/g, " ")
    .trim() || "일반";
}

function randomId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return `req-${Math.random().toString(36).slice(2)}`;
}

export function extractRequirements(text: string): RequirementItem[] {
  const sections = splitSections(text);
  const requirements: RequirementItem[] = [];
  for (const section of sections) {
    const classified = classifySectionLines(section);
    const bulletBlock = takeBulletBlock(section.lines);
    if (
      bulletBlock.prefix &&
      bulletBlock.items.length > 0 &&
      classified[bulletBlock.prefix].length === 0
    ) {
      classified[bulletBlock.prefix].push(...bulletBlock.items);
    }

    const preconditions = dedupeAndTrim(classified.preconditions);
    const flow = dedupeAndTrim(classified.flow, 20);
    const businessRules = dedupeAndTrim(classified.businessRules);
    const acceptanceCriteria = dedupeAndTrim(classified.acceptanceCriteria);
    const exceptions = dedupeAndTrim(classified.exceptions);

    const hasAnyContent =
      preconditions.length +
        flow.length +
        businessRules.length +
        acceptanceCriteria.length +
        exceptions.length >
      0;
    if (!hasAnyContent) continue;

    const feature = deriveFeature(section.title);
    requirements.push({
      id: randomId(),
      sectionTitle: section.title,
      feature,
      preconditions,
      flow,
      businessRules,
      acceptanceCriteria,
      exceptions,
    });
  }

  if (requirements.length === 0) {
    const fallback = fallbackSingleRequirement(text);
    if (fallback) requirements.push(fallback);
  }

  const descriptionReqs = requirements.filter((r) =>
    DESCRIPTION_HEADING_RE.test(r.sectionTitle ?? ""),
  );
  if (descriptionReqs.length > 0) {
    const descriptionSet = new Set(descriptionReqs);
    const others = requirements.filter(
      (r) =>
        !descriptionSet.has(r) &&
        r.preconditions.length +
          r.businessRules.length +
          r.acceptanceCriteria.length +
          r.exceptions.length >
          0,
    );
    return [...descriptionReqs, ...others];
  }

  return requirements;
}

function fallbackSingleRequirement(text: string): RequirementItem | null {
  const sentences = collectSentences(text);
  if (sentences.length === 0) return null;
  const flow = dedupeAndTrim(sentences, 20);
  if (flow.length === 0) return null;
  return {
    id: randomId(),
    sectionTitle: "문서 본문",
    feature: "일반",
    preconditions: [],
    flow,
    businessRules: [],
    acceptanceCriteria: [],
    exceptions: [],
  };
}
