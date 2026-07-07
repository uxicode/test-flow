import { createStep, type Step } from "../../types";
import type { GeneratedDocTestCase } from "./types";

/**
 * Clean up strings by removing brackets, quotes, and whitespace.
 */
function cleanTerm(text: string): string {
  return text
    .replace(/[\[\]\(\)\{\}"']/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Parses user-friendly description sentences from Flowchart Nodes into 
 * functional, runnable Playwright scenario Steps.
 */
function parseTextToRealStep(text: string): Step[] {
  const trimmed = cleanTerm(text);
  if (!trimmed) return [];

  // Skip visual headers, purely metadata descriptions, or structural comment triggers
  if (
    trimmed.startsWith("TC") || 
    trimmed.startsWith("[TC") ||
    trimmed.startsWith("사전 조건") || 
    trimmed.startsWith("Given") ||
    trimmed.startsWith("조건에서") ||
    trimmed.includes("조건으로 진행")
  ) {
    return []; // Clean up junk 0ms wait comments
  }

  const steps: Step[] = [];

  // 1. Navigation Rule: GOTO
  if (/진입|이동|접속|열기|goto|visit|open/i.test(trimmed)) {
    let url = "/";
    if (trimmed.includes("로그인")) url = "/login";
    else if (trimmed.includes("신청") || trimmed.includes("등록")) url = "/apply";
    else if (trimmed.includes("대시보드") || trimmed.includes("메인")) url = "/dashboard";
    else if (trimmed.includes("관리") || trimmed.includes("admin")) url = "/admin";

    // Attempt to extract path patterns (e.g. "/admin/users" or "http://...")
    const urlMatch = trimmed.match(/(https?:\/\/[^\s]+|\/[a-zA-Z0-9_\-\/]+)/);
    if (urlMatch) {
      url = urlMatch[1];
    }

    const step = createStep("goto");
    step.selectorValue = url;
    step.label = `페이지 이동: ${url}`;
    steps.push(step);
    return steps;
  }

  // 2. Interaction Rule: FILL (Inputs)
  if (/입력|작성|타이핑|fill|input|type/i.test(trimmed)) {
    const fields: string[] = [];
    if (trimmed.includes("이메일") || trimmed.includes("ID") || trimmed.includes("아이디")) {
      fields.push("이메일");
    }
    if (trimmed.includes("비밀번호") || trimmed.includes("패스워드") || trimmed.includes("암호")) {
      fields.push("비밀번호");
    }
    if (trimmed.includes("이름") || trimmed.includes("성명")) {
      fields.push("이름");
    }
    if (trimmed.includes("소속") || trimmed.includes("센터") || trimmed.includes("회사")) {
      fields.push("소속 센터");
    }
    if (trimmed.includes("사유") || trimmed.includes("의견")) {
      fields.push("신청 사유");
    }
    if (trimmed.includes("연락처") || trimmed.includes("전화") || trimmed.includes("핸드폰")) {
      fields.push("연락처");
    }

    if (fields.length > 0) {
      // Deconstruct unified descriptions (e.g. "이메일 및 비밀번호 입력") into dedicated sequential inputs
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
      // Fallback for custom fields
      let target = trimmed.replace(/(입력|작성|타이핑|fill|input|type|정보|값|\s+)/g, "");
      if (!target) target = "입력 필드";
      const step = createStep("fill");
      step.selectorStrategy = "placeholder";
      step.selectorValue = target;
      step.inputValue = "테스트 입력값";
      step.label = `"${target}" 필드 작성`;
      steps.push(step);
    }
    return steps;
  }

  // 3. Interaction Rule: CLICK
  if (/클릭|누름|선택|click|press|select/i.test(trimmed)) {
    // Avoid double matching checkboxes
    if (!trimmed.includes("체크박스")) {
      let target = trimmed.replace(/(버튼|링크|메뉴|클릭|누름|click|press|\s+)/g, "");
      if (!target) target = "확인";

      const step = createStep("click");
      step.selectorStrategy = "role";
      step.role = "button";
      step.selectorValue = target;
      step.label = `버튼 클릭: "${target}"`;
      steps.push(step);
      return steps;
    }
  }

  // 4. Interaction Rule: CHECK (Checkboxes)
  if (/체크박스|체크|동의/i.test(trimmed)) {
    let target = trimmed.replace(/(체크박스|체크|선택|선택한다|동의|선택|check|agree|\s+)/g, "");
    if (!target) target = "약관 동의";
    
    const step = createStep("check");
    step.selectorStrategy = "label";
    step.selectorValue = target;
    step.label = `체크박스 선택: "${target}"`;
    steps.push(step);
    return steps;
  }

  // 5. Timeline Rule: Real WAIT ms
  if (/대기|기다림|wait|sleep/i.test(trimmed)) {
    const secMatch = trimmed.match(/(\d+)\s*초/);
    const msMatch = trimmed.match(/(\d+)\s*ms/);
    let ms = 1000;

    if (secMatch) {
      ms = parseInt(secMatch[1]) * 1000;
    } else if (msMatch) {
      ms = parseInt(msMatch[1]);
    } else {
      const numMatch = trimmed.match(/(\d+)/);
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

  // 6. Validation Rule: ASSERT
  if (/표시|화면|나타남|검증|확인|assert|expect|check/i.test(trimmed)) {
    let target = trimmed.replace(/(표시|화면|나타남|검증|확인|assert|expect|check|에러|오류|메시지|안내|\s+)/g, "");
    if (!target && trimmed.includes("에러")) target = "오류";
    
    if (target) {
      const step = createStep("assert_visible");
      step.selectorStrategy = "text";
      step.selectorValue = target;
      step.label = `화면 표시 확인: "${target}"`;
      steps.push(step);
      return steps;
    }
  }

  return [];
}

/**
 * Builds standard assertion steps for test case expected results.
 */
function buildAssertStep(expectedText: string): Step {
  const cleaned = cleanTerm(expectedText);
  return {
    ...createStep("assert_text"),
    selectorStrategy: "text",
    selectorValue: cleaned,
    label: `기대 결과 확인: "${cleaned}"`,
  };
}

/**
 * Converts logic paths generated by the visual Flowchart Analyzer 
 * into executable browser test steps.
 */
export function convertTestCasesToSteps(
  testCases: GeneratedDocTestCase[],
): Step[] {
  const steps: Step[] = [];

  testCases.forEach((tc) => {
    // Process preconditions
    if (tc.preconditions.length > 0) {
      tc.preconditions.forEach((cond) => {
        const parsed = parseTextToRealStep(cond);
        steps.push(...parsed);
      });
    }

    // Process each node step in the execution path
    tc.steps.forEach((line) => {
      const parsed = parseTextToRealStep(line);
      steps.push(...parsed);
    });

    // Process expected results
    tc.expectedResults.forEach((expected) => {
      steps.push(buildAssertStep(expected));
    });
  });

  // Fallback check: if no active steps were resolved, default to a safe screenshot step
  if (steps.length === 0) {
    const fallback = createStep("screenshot");
    fallback.label = "플로우 확인용 캡처";
    steps.push(fallback);
  }

  return steps;
}
