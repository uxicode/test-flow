import type {
  DocTcOptions,
  GeneratedDocTestCase,
  RequirementItem,
  TestCasePriority,
  TestCaseType,
} from "./types";

const BOUNDARY_PATTERNS = [
  /(이상|이하|초과|미만)/,
  /(min|max|최소|최대)/i,
  /\b\d+\s*(자|글자|characters?)\b/i,
  /\b\d+\s*(바이트|bytes?)\b/i,
  /\b\d+\s*(seconds?|초|분|ms|밀리초)\b/i,
];

function randomId(prefix: string): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(36).slice(2)}`;
}

function priorityFromType(type: TestCaseType): TestCasePriority {
  switch (type) {
    case "positive":
      return "P1";
    case "negative":
      return "P2";
    case "boundary":
      return "P2";
    case "exception":
      return "P3";
  }
}

function baseSteps(req: RequirementItem): string[] {
  const steps: string[] = [];
  if (req.preconditions.length > 0) {
    steps.push(`사전 조건: ${req.preconditions.join(" / ")}`);
  }
  if (req.flow.length > 0) {
    req.flow.forEach((line, idx) => {
      steps.push(`단계 ${idx + 1}: ${line}`);
    });
  } else {
    steps.push("문서에 명시된 흐름에 따라 기능을 수행한다.");
  }
  return steps;
}

function titleFor(req: RequirementItem, suffix: string): string {
  const base = req.sectionTitle || req.feature || "요구사항";
  return `${base} - ${suffix}`;
}

function positiveTestCase(req: RequirementItem): GeneratedDocTestCase {
  const expected =
    req.acceptanceCriteria.length > 0
      ? req.acceptanceCriteria
      : ["흐름을 완료하면 정상 결과가 나타난다."];
  return {
    id: randomId("tc"),
    title: titleFor(req, "정상 흐름"),
    feature: req.feature ?? "일반",
    objective: "명세된 흐름이 정상적으로 동작하는지 확인한다.",
    preconditions: req.preconditions,
    steps: baseSteps(req),
    expectedResults: expected,
    priority: priorityFromType("positive"),
    type: "positive",
    requirementIds: [req.id],
  };
}

function exceptionTestCases(req: RequirementItem): GeneratedDocTestCase[] {
  return req.exceptions.map((exception, idx) => ({
    id: randomId("tc"),
    title: titleFor(req, `예외 ${idx + 1}`),
    feature: req.feature ?? "일반",
    objective: "예외 상황에서 규정된 처리 흐름이 수행되는지 확인한다.",
    preconditions: req.preconditions,
    steps: [
      ...baseSteps(req),
      `예외 조건을 발생시킨다: ${exception}`,
    ],
    expectedResults: [`예외 처리 정책에 따라 동작한다: ${exception}`],
    priority: priorityFromType("exception"),
    type: "exception",
    requirementIds: [req.id],
  }));
}

function negativeTestCase(req: RequirementItem): GeneratedDocTestCase | null {
  if (req.flow.length === 0 && req.businessRules.length === 0) return null;
  const violation = req.businessRules[0] ?? req.flow[0];
  return {
    id: randomId("tc"),
    title: titleFor(req, "부정 경로"),
    feature: req.feature ?? "일반",
    objective: "규칙을 위반한 입력에 대해 적절히 거부되는지 확인한다.",
    preconditions: req.preconditions,
    steps: [
      ...baseSteps(req),
      `규칙을 위반하도록 입력을 수정한다: ${violation}`,
    ],
    expectedResults: [
      "시스템이 동작을 거부하거나 오류 메시지를 표시한다.",
    ],
    priority: priorityFromType("negative"),
    type: "negative",
    requirementIds: [req.id],
  };
}

function boundaryTestCase(req: RequirementItem): GeneratedDocTestCase | null {
  const candidates = [
    ...req.businessRules,
    ...req.acceptanceCriteria,
    ...req.flow,
  ];
  const match = candidates.find((line) =>
    BOUNDARY_PATTERNS.some((p) => p.test(line)),
  );
  if (!match) return null;
  return {
    id: randomId("tc"),
    title: titleFor(req, "경계 값"),
    feature: req.feature ?? "일반",
    objective: "경계 값에서 정상/비정상 동작이 구분되는지 확인한다.",
    preconditions: req.preconditions,
    steps: [
      ...baseSteps(req),
      `경계 조건 값에서 입력을 검증한다: ${match}`,
    ],
    expectedResults: [
      `경계 조건을 기준으로 정상/실패가 올바르게 구분된다.`,
    ],
    priority: priorityFromType("boundary"),
    type: "boundary",
    requirementIds: [req.id],
  };
}

export function generateTestCases(
  requirements: RequirementItem[],
  options: DocTcOptions,
): GeneratedDocTestCase[] {
  const out: GeneratedDocTestCase[] = [];
  for (const req of requirements) {
    const perRequirement: GeneratedDocTestCase[] = [];
    perRequirement.push(positiveTestCase(req));
    if (options.includeNegative) {
      const neg = negativeTestCase(req);
      if (neg) perRequirement.push(neg);
      perRequirement.push(...exceptionTestCases(req));
    }
    if (options.includeBoundary) {
      const boundary = boundaryTestCase(req);
      if (boundary) perRequirement.push(boundary);
    }
    const clipped = perRequirement.slice(
      0,
      Math.max(1, options.maxCasesPerRequirement),
    );
    out.push(...clipped);
  }
  return out;
}
