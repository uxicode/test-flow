import { createStep, type SelectorStrategy, type AriaRole, type Step } from "../../types";
import type { GeneratedDocTestCase } from "./types";

/**
 * Clean up extra whitespace without stripping syntax characters like (), [], quotes, etc.
 */
function cleanTerm(text: string): string {
  if (!text) return "";
  return text.replace(/\s+/g, " ").trim();
}

export interface ParsedTarget {
  strategy: SelectorStrategy;
  value: string;
  role?: AriaRole;
  descriptiveText?: string;
}

/**
 * Extracts precise Playwright locator targets (css, role, text, testid, placeholder, label)
 * from raw descriptions or Playwright code snippets like:
 * - expect(page.locator('.referral-confirm-popup')).toBeVisible()
 * - expect visible locator('.referral-request-popup')
 * - getByRole('button', { name: '확인' })
 * - locator('.referral-confirm-popup')
 * - .referral-confirm-popup
 */
export function extractPlaywrightTarget(raw: string): ParsedTarget {
  const s = raw.trim();

  // 1. Check for Playwright getByRole('role', { name: 'value' })
  const getByRoleMatch = s.match(/getByRole\(\s*['"]([^'"]+)['"]\s*,\s*\{\s*name:\s*['"]([^'"]+)['"]/i);
  if (getByRoleMatch) {
    const roleCandidate = getByRoleMatch[1].toLowerCase();
    const validRoles: AriaRole[] = [
      "button", "link", "textbox", "checkbox", "radio",
      "combobox", "heading", "img", "listitem", "menuitem", "tab"
    ];
    const role: AriaRole = validRoles.includes(roleCandidate as AriaRole) ? (roleCandidate as AriaRole) : "button";
    return { strategy: "role", role, value: getByRoleMatch[2].trim() };
  }

  // 2. Check for Playwright getByText('...')
  const getByTextMatch = s.match(/getByText\(\s*['"]([^'"]+)['"]\s*\)/i);
  if (getByTextMatch) {
    return { strategy: "text", value: getByTextMatch[1].trim() };
  }

  // 3. Check for Playwright getByTestId('...')
  const getByTestIdMatch = s.match(/getByTestId\(\s*['"]([^'"]+)['"]\s*\)/i);
  if (getByTestIdMatch) {
    return { strategy: "testid", value: getByTestIdMatch[1].trim() };
  }

  // 4. Check for Playwright getByPlaceholder('...')
  const getByPlaceholderMatch = s.match(/getByPlaceholder\(\s*['"]([^'"]+)['"]\s*\)/i);
  if (getByPlaceholderMatch) {
    return { strategy: "placeholder", value: getByPlaceholderMatch[1].trim() };
  }

  // 5. Check for Playwright getByLabel('...')
  const getByLabelMatch = s.match(/getByLabel\(\s*['"]([^'"]+)['"]\s*\)/i);
  if (getByLabelMatch) {
    return { strategy: "label", value: getByLabelMatch[1].trim() };
  }

  // 6. Check for Playwright locator('...') or css('...') or css: ...
  const locatorMatch =
    s.match(/(?:locator|css)\(\s*['"]([^'"]+)['"]\s*\)/i) ||
    s.match(/(?:locator|css)\(\s*([^\)]+)\s*\)/i) ||
    s.match(/css:\s*([^\s<]+)/i);
  if (locatorMatch) {
    let val = locatorMatch[1].trim();
    // Clean outer quotes if captured e.g. 'a[href*=referral]' -> a[href*=referral]
    val = val.replace(/^['"]|['"]$/g, "");
    // Normalize unquoted attribute selectors: e.g. a[href*=referral] -> a[href*="referral"]
    val = val.replace(/\[([a-zA-Z0-9_-]+)([*^$~|]?=)([a-zA-Z0-9_-]+)\]/g, '[$1$2"$3"]');
    return { strategy: "css", value: val };
  }

  // 7. Check for direct CSS selector patterns like .referral-confirm-popup or #my-id or [data-attr]
  const directCssMatch = s.match(/(?:\s|^)(\.[a-zA-Z0-9_-]{2,}|#[a-zA-Z0-9_-]{2,}|\[[a-zA-Z0-9_=-]+\])(?:\s|$|<|\))/);
  if (directCssMatch && !s.includes("getByText") && !s.includes("getByRole")) {
    return { strategy: "css", value: directCssMatch[1].trim() };
  }

  // 8. Check for explicit role indicators (button, link, table row)
  const isExplicitButton = /버튼|\bbutton\b/i.test(s);
  const isExplicitLink = /링크|\blink\b/i.test(s);
  const isTableRow = /(리스트\s*행|테이블\s*행|표\s*행|행\s*클릭|행\s*선택|\b(td|tr)\b)/i.test(s);

  // Check for quoted text like "진료의뢰/회송" or '진료의뢰/회송'
  const quoteMatch = s.match(/["']([^"']+)["']/);
  let valueText = quoteMatch ? quoteMatch[1].trim() : "";

  if (!valueText) {
    // Strip common leading action/assertion prefixes & trailing suffixes
    let cleaned = s
      .replace(/^(expect|assert|check|click|press|fill|input|클릭|선택|누름|입력|확인)\s+/i, "")
      .replace(/\s*(?:조건에서|단계로|수행|진행|클릭|누름|버튼|링크|메뉴|텍스트|visible|toBeVisible|hidden|toBeHidden).*$/gi, "")
      .replace(/\s*\.[a-zA-Z0-9_-]+.*$/g, "")
      .trim();
    valueText = cleaned;
  }

  if (!valueText) valueText = "확인";

  if (isExplicitButton) {
    return { strategy: "role", role: "button", value: valueText };
  }
  if (isExplicitLink) {
    return { strategy: "role", role: "link", value: valueText };
  }
  if (isTableRow) {
    return { strategy: "css", value: "td" };
  }

  return { strategy: "text", value: valueText };
}

/**
 * Clean human descriptive text by removing raw locator snippets, code markers, and Playwright API noise.
 * e.g. "의뢰서상세팝업 visible locator('.referral-confirm-popup')" -> "의뢰서상세팝업"
 * e.g. "expect(page.locator('.referral-confirm-popup')).toBeVisible()" -> ""
 */
function cleanHumanTitle(raw: string): string {
  let s = raw
    .replace(/expect\s*\([^)]*\)\.toBe(?:Visible|Hidden)\(\)/gi, "")
    .replace(/(?:expect|assert|check)?\s*(?:visible|hidden|toBeVisible|toBeHidden)?\s*(?:locator|css|getByText|getByRole|getByTestId|getByPlaceholder|getByLabel)\s*\([^)]*\)/gi, "")
    .replace(/(?:\s|^)(?:\.[a-zA-Z0-9_-]{2,}|#[a-zA-Z0-9_-]{2,}|\[[a-zA-Z0-9_=-]+\])(?:\s|$|<|\))/g, "")
    .replace(/(?:expect|assert|check|visible|toBeVisible|hidden|toBeHidden|locator|css|단계로|진행|수행|조건에서|클릭|누름|입력|확인|page)+/gi, " ")
    .replace(/[\(\)]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  // If the remaining title is just punctuation or single junk chars, clear it
  if (s.length <= 1 || /^[^a-zA-Z0-9가-힣]+$/.test(s)) {
    return "";
  }
  return s;
}

/**
 * Helper to identify non-UI API, network, backend, or DB process nodes.
 * E2E UI scenario builders should skip creating DOM selector steps for internal API operations.
 */
function isApiOrBackendNode(text: string): boolean {
  if (/\b(GET|POST|PUT|DELETE|PATCH)\s+([^\s?#]+)/i.test(text)) {
    return true;
  }
  if (/\b(API\s*통신|API\s*호출|API\s*응답|HTTP\s*\d+|DB\s*조회|백엔드\s*처리|서버\s*통신)\b/i.test(text)) {
    return true;
  }
  return false;
}

/**
 * Parses user-friendly description sentences or Playwright code snippets from Flowchart Nodes
 * into functional, runnable Playwright scenario Steps.
 */
export function parseTextToRealStep(text: string): Step[] {
  if (!text) return [];

  const trimmed = cleanTerm(text);
  if (!trimmed) return [];

  // Skip visual headers, metadata descriptions, or structural comments
  if (
    trimmed.startsWith("TC") ||
    trimmed.startsWith("[TC") ||
    trimmed.startsWith("사전 조건") ||
    trimmed.startsWith("Given")
  ) {
    return [];
  }

  const steps: Step[] = [];

  // Separate edge condition [EdgeLabel] from NodeBody
  // e.g. "[1500ms 대기] 조건에서 GET /nipa/linked 값 존재? 단계로 진행"
  let nodeBody = trimmed;

  const bracketMatch = trimmed.match(/^\[([^\]]+)\]\s*(?:조건에서|조건으로)?\s*(.*)$/);
  if (bracketMatch) {
    const bracketContent = bracketMatch[1].trim();

    // 0. Check if bracket contains wait duration e.g. "1500ms 대기" or "1.5초 대기" or "Wait 2000ms"
    const isBracketWait = /대기|wait|sleep/i.test(bracketContent) || /(\d+)\s*(?:초|s|sec|ms)/i.test(bracketContent);
    if (isBracketWait) {
      let ms = 1000;
      const secMatch = bracketContent.match(/(\d+)\s*(?:초|s|sec)/i);
      const msMatch = bracketContent.match(/(\d+)\s*ms/i);
      if (secMatch) {
        ms = parseInt(secMatch[1]) * 1000;
      } else if (msMatch) {
        ms = parseInt(msMatch[1]);
      } else {
        const numMatch = bracketContent.match(/(\d+)/);
        if (numMatch) {
          const val = parseInt(numMatch[1]);
          ms = val < 50 ? val * 1000 : val;
        }
      }

      if (ms > 0) {
        const waitStep = createStep("wait_ms");
        waitStep.waitMs = ms;
        waitStep.label = `${ms}ms 대기`;
        steps.push(waitStep);
      }
    }

    nodeBody = bracketMatch[2].replace(/\s*(?:단계로\s*진행|수행|진행)\s*$/i, "").trim();
    if (!nodeBody && !isBracketWait) {
      nodeBody = bracketContent;
    }
  } else {
    nodeBody = trimmed.replace(/\s*(?:단계로\s*진행|수행|진행)\s*$/i, "").trim();
  }

  if (!nodeBody) return steps;

  // 1. API Request & Response Validation Rule (e.g. GET /nipa/linked 값 존재?, POST /api/user)
  const httpApiMatch = nodeBody.match(/\b(GET|POST|PUT|DELETE|PATCH)\s+([^\s?#]+)/i);
  const isApiKeyword = /\b(API\s*통신|API\s*호출|API\s*응답|HTTP\s*\d+)\b/i.test(nodeBody);

  if (httpApiMatch || isApiKeyword) {
    const method = httpApiMatch ? httpApiMatch[1].toUpperCase() : "GET";
    const endpoint = httpApiMatch ? httpApiMatch[2] : "/api";

    const step = createStep("api_request");
    step.selectorStrategy = "text";
    step.selectorValue = endpoint;
    step.inputValue = method;
    step.label = `API 응답 검증: ${method} ${endpoint}`;

    steps.push(step);
    return steps;
  }

  // 1. Navigation Rule: GOTO
  const isNavKeyword = /진입|이동|접속|열기|goto|visit|open|navigate/i.test(nodeBody);
  const isDirectUrl = /^(https?:\/\/|\/)/i.test(nodeBody.trim());

  if (isNavKeyword || isDirectUrl) {
    let url = "/";
    if (nodeBody.includes("로그인")) url = "/login";
    else if (nodeBody.includes("신청") || nodeBody.includes("등록")) url = "/apply";
    else if (nodeBody.includes("대시보드") || nodeBody.includes("메인")) url = "/dashboard";
    else if (nodeBody.includes("관리") || nodeBody.includes("admin")) url = "/admin";

    const urlMatch = nodeBody.match(/(https?:\/\/[^\s\)\"\']+|\/[a-zA-Z0-9_\-\/]+)/);
    if (urlMatch) {
      url = urlMatch[1];
    }

    const step = createStep("goto");
    step.selectorValue = url;
    step.label = `페이지 이동: ${url}`;
    steps.push(step);
    return steps;
  }

  // 2. Validation Rule: ASSERT (assert_visible, assert_hidden, assert_text)
  const isAssertKeyword = /visible|hidden|toBeVisible|toBeHidden|표시|화면|나타남|보임|숨김|사라짐|검증|확인|assert|expect|check/i.test(nodeBody);
  const isExplicitClick = /클릭|누름|click|press/i.test(nodeBody);

  if (isAssertKeyword && !isExplicitClick) {
    const isHidden = /hidden|toBeHidden|숨김|사라짐/i.test(nodeBody);
    const target = extractPlaywrightTarget(nodeBody);
    const humanTitle = cleanHumanTitle(nodeBody);

    const step = createStep(isHidden ? "assert_hidden" : "assert_visible");
    step.selectorStrategy = target.strategy;
    if (target.role) step.role = target.role;
    step.selectorValue = target.value;

    const actionName = isHidden ? "숨김 확인" : "표시 확인";
    if (humanTitle && humanTitle !== target.value) {
      step.label = `${humanTitle} ${actionName} (${target.value})`;
    } else {
      step.label = `${actionName}: "${target.value}"`;
    }

    steps.push(step);
    return steps;
  }

  // 3. Interaction Rule: FILL (Inputs)
  if (/입력|작성|타이핑|fill|input|type/i.test(nodeBody)) {
    const fields: string[] = [];
    if (nodeBody.includes("이메일") || nodeBody.includes("ID") || nodeBody.includes("아이디")) {
      fields.push("이메일");
    }
    if (nodeBody.includes("비밀번호") || nodeBody.includes("패스워드") || nodeBody.includes("암호")) {
      fields.push("비밀번호");
    }
    if (nodeBody.includes("이름") || nodeBody.includes("성명")) {
      fields.push("이름");
    }
    if (nodeBody.includes("소속") || nodeBody.includes("센터") || nodeBody.includes("회사")) {
      fields.push("소속 센터");
    }
    if (nodeBody.includes("사유") || nodeBody.includes("의견")) {
      fields.push("신청 사유");
    }
    if (nodeBody.includes("연락처") || nodeBody.includes("전화") || nodeBody.includes("핸드폰")) {
      fields.push("연락처");
    }

    if (fields.length > 0) {
      for (const field of fields) {
        const step = createStep("fill");
        step.selectorStrategy = "placeholder";
        step.selectorValue = field;

        let val = "테스트";
        if (field === "이메일") val = "test@example.com";
        else if (field === "비밀번호") val = "password123!";
        else if (field === "연락처") val = "010-1234-5678";

        step.inputValue = val;
        step.label = `입력 필드 작성: "${field}"에 "${val}" 입력`;
        steps.push(step);
      }
    } else {
      const target = extractPlaywrightTarget(nodeBody);
      const humanTitle = cleanHumanTitle(nodeBody) || target.value || "입력 필드";
      const step = createStep("fill");
      step.selectorStrategy = target.strategy;
      if (target.role) step.role = target.role;
      step.selectorValue = target.value;
      step.inputValue = "테스트 입력값";
      step.label = `"${humanTitle}" 필드 작성`;
      steps.push(step);
    }
    return steps;
  }

  // 4. Interaction Rule: CHECK (Checkboxes)
  if (/체크박스|체크|동의/i.test(nodeBody)) {
    const target = extractPlaywrightTarget(nodeBody);
    const humanTitle = cleanHumanTitle(nodeBody) || target.value || "약관 동의";

    const step = createStep("check");
    step.selectorStrategy = target.strategy === "css" ? "css" : "label";
    step.selectorValue = target.value;
    step.label = `체크박스 선택: "${humanTitle}"`;
    steps.push(step);
    return steps;
  }

  // 5. Timeline Rule: Real WAIT ms
  if (/대기|기다림|wait|sleep/i.test(nodeBody)) {
    const secMatch = nodeBody.match(/(\d+)\s*(?:초|s|sec)/i);
    const msMatch = nodeBody.match(/(\d+)\s*ms/i);
    let ms = 1000;

    if (secMatch) {
      ms = parseInt(secMatch[1]) * 1000;
    } else if (msMatch) {
      ms = parseInt(msMatch[1]);
    } else {
      const numMatch = nodeBody.match(/(\d+)/);
      if (numMatch) {
        const val = parseInt(numMatch[1]);
        ms = val < 50 ? val * 1000 : val;
      }
    }

    if (ms > 0) {
      const step = createStep("wait_ms");
      step.waitMs = ms;
      step.label = `${ms}ms 대기`;
      steps.push(step);
      return steps;
    }
  }

  // 6. Interaction Rule: CLICK (Explicit UI Click actions only)
  if (/클릭|누름|선택|click|press|select/i.test(nodeBody)) {
    const target = extractPlaywrightTarget(nodeBody);
    const humanTitle = cleanHumanTitle(nodeBody);

    const step = createStep("click");
    step.selectorStrategy = target.strategy;
    if (target.role) step.role = target.role;
    step.selectorValue = target.value;

    if (humanTitle && humanTitle !== target.value) {
      step.label = `클릭: ${humanTitle} (${target.value})`;
    } else {
      step.label = `버튼/요소 클릭: "${target.value}"`;
    }
    steps.push(step);
    return steps;
  }

  return steps;
}

/**
 * Builds standard assertion steps for test case expected results.
 */
function buildAssertStep(expectedText: string): Step {
  const target = extractPlaywrightTarget(expectedText);
  const humanTitle = cleanHumanTitle(expectedText);

  const step = createStep("assert_visible");
  step.selectorStrategy = target.strategy;
  if (target.role) step.role = target.role;
  step.selectorValue = target.value;

  if (humanTitle && humanTitle !== target.value) {
    step.label = `기대 결과 확인: ${humanTitle} (${target.value})`;
  } else {
    step.label = `기대 결과 확인: "${target.value}"`;
  }
  return step;
}

/**
 * Converts logic paths generated by the visual Flowchart Analyzer
 * into executable browser test steps.
 */
export function convertTestCasesToSteps(
  testCases: GeneratedDocTestCase[],
): Step[] {
  const steps: Step[] = [];

  const addStepSafely = (step: Step) => {
    const lastStep = steps[steps.length - 1];
    // Deduplicate consecutive identical goto steps
    if (
      lastStep &&
      lastStep.type === "goto" &&
      step.type === "goto" &&
      lastStep.selectorValue === step.selectorValue
    ) {
      return;
    }
    steps.push(step);
  };

  testCases.forEach((tc) => {
    // Process preconditions
    if (tc.preconditions.length > 0) {
      tc.preconditions.forEach((cond) => {
        const parsed = parseTextToRealStep(cond);
        parsed.forEach(addStepSafely);
      });
    }

    // Process each node step in the execution path
    tc.steps.forEach((line) => {
      const parsed = parseTextToRealStep(line);
      parsed.forEach(addStepSafely);
    });

    // Process expected results
    tc.expectedResults.forEach((expected) => {
      addStepSafely(buildAssertStep(expected));
    });
  });

  // Fallback check: if no active steps were resolved, default to a safe screenshot step
  if (steps.length === 0) {
    const fallback = createStep("screenshot");
    fallback.label = "플로우 확인용 캡처";
    steps.push(fallback);
    return steps;
  }

  // Post-processing optimization: Reorder goto before click if click immediately precedes goto
  const optimizedSteps: Step[] = [];
  for (let i = 0; i < steps.length; i++) {
    const current = steps[i];
    const next = steps[i + 1];

    if (current.type === "click" && next && next.type === "goto") {
      // Move goto before click so page navigation happens before trying to locate link elements
      optimizedSteps.push(next);
      optimizedSteps.push(current);
      i++; // Skip next as it is processed
    } else {
      optimizedSteps.push(current);
    }
  }

  return optimizedSteps;
}

