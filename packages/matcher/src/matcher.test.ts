import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { CONTROL_KIND } from "@testflow/tc";
import type { ElementEntry, ScreenElementMap } from "@testflow/runner";
import { normalizeLabel, isSynonym, controlKindsCompatible } from "./normalize.js";
import { ruleMatchStep } from "./rule-match.js";
import { _parseModelResponseForTest } from "./model-match.js";
import {
  MATCH_VERSION,
  applyReview,
  deleteMatchSet,
  listMatchSets,
  loadMatchSet,
  saveMatchSet,
  type MatchSet,
} from "./match-result.js";
import { matchTcToMap, resetMatchReview, resolveApprovedSelector } from "./matcher.js";

// ---------------------------------------------------------------------------
// 테스트 픽스처
// ---------------------------------------------------------------------------

const SAMPLE_ELEMENTS: ElementEntry[] = [
  {
    label: "이메일",
    controlKind: CONTROL_KIND.text,
    locators: [
      { strategy: "label", value: "이메일" },
      { strategy: "css", value: "#email" },
    ],
    dropdownOptionContainer: null,
  },
  {
    label: "비밀번호",
    controlKind: CONTROL_KIND.password,
    locators: [{ strategy: "css", value: "#password" }],
    dropdownOptionContainer: null,
  },
  {
    label: "상태",
    controlKind: CONTROL_KIND.select,
    locators: [{ strategy: "label", value: "상태" }],
    dropdownOptionContainer: "listbox",
  },
  {
    label: "이름",
    controlKind: CONTROL_KIND.text,
    locators: [
      { strategy: "testid", value: "[data-testid='name']" },
      { strategy: "label", value: "이름" },
    ],
    dropdownOptionContainer: null,
  },
];

const SAMPLE_MAP: ScreenElementMap = {
  $version: 1,
  url: "https://example.com/admin",
  normalizedUrl: "https://example.com/admin",
  exploredAt: new Date().toISOString(),
  screenTitle: "관리자 화면",
  elements: SAMPLE_ELEMENTS,
  queryApiUrls: [],
};

// ---------------------------------------------------------------------------
// 레이블 정규화
// ---------------------------------------------------------------------------

describe("normalizeLabel", () => {
  it("접미사 '입력'을 제거한다", () => {
    assert.equal(normalizeLabel("이메일 입력"), "이메일");
  });

  it("접미사 '필드'를 제거한다", () => {
    assert.equal(normalizeLabel("이름 필드"), "이름");
  });

  it("소문자로 변환한다", () => {
    assert.equal(normalizeLabel("EMAIL"), "email");
  });

  it("연속 공백을 하나로 줄인다", () => {
    assert.equal(normalizeLabel("이 메 일"), "이 메 일");
    assert.equal(normalizeLabel("이  메일"), "이 메일");
  });

  it("복합 접미사를 제거한다", () => {
    assert.equal(normalizeLabel("상태 드롭다운"), "상태");
    assert.equal(normalizeLabel("조회기간 필터"), "조회기간");
  });
});

// ---------------------------------------------------------------------------
// 동의어
// ---------------------------------------------------------------------------

describe("isSynonym", () => {
  it("이메일 ↔ email 동의어로 인식한다", () => {
    assert.equal(isSynonym("이메일", "email"), true);
  });

  it("비밀번호 ↔ password 동의어로 인식한다", () => {
    assert.equal(isSynonym("비밀번호", "password"), true);
  });

  it("완전 일치는 동의어가 아니다", () => {
    assert.equal(isSynonym("이메일", "이메일"), false);
  });

  it("관계없는 단어는 false 다", () => {
    assert.equal(isSynonym("이메일", "주소"), false);
  });
});

// ---------------------------------------------------------------------------
// 컨트롤 타입 호환성
// ---------------------------------------------------------------------------

describe("controlKindsCompatible", () => {
  it("같은 타입은 호환된다", () => {
    assert.equal(controlKindsCompatible(CONTROL_KIND.text, CONTROL_KIND.text), true);
  });

  it("select ↔ combobox 는 호환된다", () => {
    assert.equal(controlKindsCompatible(CONTROL_KIND.select, CONTROL_KIND.combobox), true);
    assert.equal(controlKindsCompatible(CONTROL_KIND.combobox, CONTROL_KIND.select), true);
  });

  it("text ↔ password 는 호환된다", () => {
    assert.equal(controlKindsCompatible(CONTROL_KIND.text, CONTROL_KIND.password), true);
  });

  it("date ↔ date_range 는 호환된다", () => {
    assert.equal(controlKindsCompatible(CONTROL_KIND.date, CONTROL_KIND.dateRange), true);
    assert.equal(controlKindsCompatible(CONTROL_KIND.dateRange, CONTROL_KIND.date), true);
  });

  it("select ↔ radio 는 호환되지 않는다", () => {
    assert.equal(controlKindsCompatible(CONTROL_KIND.select, CONTROL_KIND.radio), false);
  });

  it("undefined 는 항상 호환된다", () => {
    assert.equal(controlKindsCompatible(undefined, CONTROL_KIND.text), true);
    assert.equal(controlKindsCompatible(CONTROL_KIND.text, undefined), true);
  });
});

// ---------------------------------------------------------------------------
// 규칙 기반 매칭
// ---------------------------------------------------------------------------

describe("ruleMatchStep", () => {
  it("완전 일치 시 신뢰도 1.0 과 method=exact 를 반환한다", () => {
    const hits = ruleMatchStep("이메일", CONTROL_KIND.text, SAMPLE_ELEMENTS, "test-map");
    assert.ok(hits.length > 0);
    assert.equal(hits[0]?.method, "exact");
    assert.equal(hits[0]?.confidence, 1.0);
    assert.equal(hits[0]?.elementLabel, "이메일");
  });

  it("정규화 후 일치하면 exact 다 (접미사 포함)", () => {
    const hits = ruleMatchStep("이메일 입력", CONTROL_KIND.text, SAMPLE_ELEMENTS, "test-map");
    assert.ok(hits.length > 0);
    assert.equal(hits[0]?.method, "exact");
  });

  it("동의어 일치 시 method=rule, 신뢰도 약 0.85 를 반환한다", () => {
    const hits = ruleMatchStep("email", CONTROL_KIND.text, SAMPLE_ELEMENTS, "test-map");
    assert.ok(hits.length > 0);
    assert.equal(hits[0]?.method, "rule");
    assert.ok(hits[0]!.confidence >= 0.8 && hits[0]!.confidence <= 0.9);
  });

  it("컨트롤 타입이 맞으면 신뢰도 보너스를 받는다", () => {
    const hitsMatch = ruleMatchStep("이름", CONTROL_KIND.text, SAMPLE_ELEMENTS, "test-map");
    const hitsMismatch = ruleMatchStep("이름", CONTROL_KIND.radio, SAMPLE_ELEMENTS, "test-map");
    assert.ok(hitsMatch[0]!.confidence > hitsMismatch[0]!.confidence);
  });

  it("testid 로케이터가 있으면 bestLocator strategy 가 testid 다", () => {
    const hits = ruleMatchStep("이름", CONTROL_KIND.text, SAMPLE_ELEMENTS, "test-map");
    assert.equal(hits[0]?.bestLocator.strategy, "testid");
  });

  it("매칭이 없으면 빈 배열을 반환한다", () => {
    const hits = ruleMatchStep("존재하지않는필드", undefined, SAMPLE_ELEMENTS, "test-map");
    assert.equal(hits.length, 0);
  });

  it("결과가 신뢰도 내림차순으로 정렬된다", () => {
    const hits = ruleMatchStep("이름", undefined, SAMPLE_ELEMENTS, "test-map");
    for (let i = 1; i < hits.length; i++) {
      assert.ok(hits[i - 1]!.confidence >= hits[i]!.confidence);
    }
  });
});

// ---------------------------------------------------------------------------
// 모델 응답 파싱 (안전장치 검증)
// ---------------------------------------------------------------------------

describe("모델 응답 파싱 안전장치", () => {
  it("유효한 JSON 과 범위 내 choice 를 수락한다", () => {
    const result = _parseModelResponseForTest('{"choice": 1, "reason": "레이블 일치"}', 2);
    assert.ok(result);
    assert.equal(result.chosenIndex, 1);
  });

  it("choice 가 범위 초과이면 null 반환", () => {
    const result = _parseModelResponseForTest('{"choice": 5, "reason": "..."}', 2);
    assert.equal(result, null);
  });

  it("choice 가 음수이면 null 반환", () => {
    const result = _parseModelResponseForTest('{"choice": -1, "reason": "..."}', 2);
    assert.equal(result, null);
  });

  it("JSON 이 아닌 응답은 null 반환", () => {
    const result = _parseModelResponseForTest("1번 선택합니다", 2);
    assert.equal(result, null);
  });

  it("choice 가 문자열이면 null 반환", () => {
    const result = _parseModelResponseForTest('{"choice": "0", "reason": "..."}', 2);
    assert.equal(result, null);
  });

  it("choice 가 소수이면 null 반환", () => {
    const result = _parseModelResponseForTest('{"choice": 1.5, "reason": "..."}', 2);
    assert.equal(result, null);
  });

  it("마크다운 코드 펜스로 감싸진 JSON 도 처리한다", () => {
    const result = _parseModelResponseForTest('```json\n{"choice": 0, "reason": "정확"}\n```', 2);
    assert.ok(result);
    assert.equal(result.chosenIndex, 0);
  });

  it("reason 이 없어도 수락한다", () => {
    const result = _parseModelResponseForTest('{"choice": 0}', 1);
    assert.ok(result);
    assert.equal(result.reason, "");
  });

  it("셀렉터를 choice 에 넣으면 null 반환 (비정수)", () => {
    const result = _parseModelResponseForTest('{"choice": "#email", "reason": "..."}', 2);
    assert.equal(result, null);
  });
});

// ---------------------------------------------------------------------------
// MatchSet 파일 지속성
// ---------------------------------------------------------------------------

let tmpDir: string;
const originalDir = process.env.MATCH_RESULT_DIR;

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "testflow-match-"));
  process.env.MATCH_RESULT_DIR = tmpDir;
});

after(() => {
  if (originalDir === undefined) delete process.env.MATCH_RESULT_DIR;
  else process.env.MATCH_RESULT_DIR = originalDir;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const SAMPLE_MATCH_SET: MatchSet = {
  $version: MATCH_VERSION,
  jobId: "job-123",
  mapId: "map-456",
  createdAt: new Date().toISOString(),
  steps: [
    {
      tcId: "tc-1",
      stepLabel: "이메일",
      controlKind: CONTROL_KIND.text,
      candidates: [
        {
          elementMapId: "map-456",
          elementIndex: 0,
          elementLabel: "이메일",
          controlKind: CONTROL_KIND.text,
          bestLocator: { strategy: "css", value: "#email" },
          confidence: 1.0,
          method: "exact",
          reason: "레이블 완전 일치",
        },
      ],
      chosenIndex: 0,
      status: "matched",
    },
    {
      tcId: "tc-1",
      stepLabel: "알 수 없는 필드",
      candidates: [],
      chosenIndex: -1,
      status: "review",
    },
  ],
};

describe("MatchSet 파일 지속성", () => {
  it("저장하고 올바르게 불러온다", () => {
    const meta = saveMatchSet(SAMPLE_MATCH_SET);
    assert.ok(meta.matchId);
    assert.equal(meta.jobId, "job-123");
    assert.equal(meta.totalSteps, 2);
    assert.equal(meta.reviewCount, 1);
    assert.equal(meta.matchedCount, 1);

    const loaded = loadMatchSet(meta.matchId);
    assert.equal(loaded.$version, MATCH_VERSION);
    assert.equal(loaded.steps.length, 2);
  });

  it("없는 matchId 는 에러를 던진다", () => {
    assert.throws(() => loadMatchSet("ghost-match"), /찾지 못했습니다/u);
  });

  it("목록 조회 시 저장된 항목이 포함된다", () => {
    const countBefore = listMatchSets().length;
    saveMatchSet(SAMPLE_MATCH_SET);
    assert.ok(listMatchSets().length >= countBefore + 1);
  });

  it("삭제하면 파일이 없어진다", () => {
    const meta = saveMatchSet(SAMPLE_MATCH_SET);
    deleteMatchSet(meta.matchId);
    assert.throws(() => loadMatchSet(meta.matchId), /찾지 못했습니다/u);
  });
});

// ---------------------------------------------------------------------------
// 전체 매칭 + resolveApprovedSelector
// ---------------------------------------------------------------------------

describe("matchTcToMap + resolveApprovedSelector", () => {
  it("TC 케이스를 요소 맵에 매칭하고 MatchSet 을 반환한다", async () => {
    const cases = [
      {
        id: "tc-login",
        screenName: "로그인",
        kind: "success" as const,
        title: "로그인 성공",
        inputs: [
          { target: "이메일", value: "test@example.com", control: CONTROL_KIND.text },
          { target: "비밀번호", value: "", control: CONTROL_KIND.password },
        ],
        buttonName: "로그인",
        expectedText: "대시보드",
      },
    ];

    const result = await matchTcToMap({
      cases,
      map: SAMPLE_MAP,
      mapId: "map-test",
      jobId: "job-test",
    });

    assert.equal(result.$version, MATCH_VERSION);
    assert.ok(result.steps.length >= 2);

    // 이메일은 exact 매칭
    const emailStep = result.steps.find((s) => s.stepLabel === "이메일");
    assert.ok(emailStep);
    assert.equal(emailStep.status, "matched");
    assert.equal(emailStep.candidates[0]?.method, "exact");
  });

  it("검토를 리셋하면 자동 매칭 직후 상태로 돌아간다", async () => {
    const cases = [
      {
        id: "tc-reset",
        screenName: "로그인",
        kind: "success" as const,
        title: "로그인 성공",
        inputs: [{ target: "이메일", value: "", control: CONTROL_KIND.text }],
        buttonName: "로그인",
        expectedText: "대시보드",
      },
    ];
    const result = await matchTcToMap({ cases, map: SAMPLE_MAP, mapId: "map-test", jobId: "job-test" });
    const before = structuredClone(result.steps[0]);
    assert.ok(before);

    applyReview(result, 0, "reject", undefined, "틀림");
    assert.equal(result.steps[0]?.status, "rejected");

    resetMatchReview(result);
    assert.equal(result.steps[0]?.status, before.status);
    assert.equal(result.steps[0]?.chosenIndex, before.chosenIndex);
    assert.equal(result.steps[0]?.reviewNote, undefined);
  });

  it("초기값이 없는 이전 파일도 후보 목록으로 리셋한다", () => {
    const set: MatchSet = structuredClone(SAMPLE_MATCH_SET);
    const step = set.steps[0];
    assert.ok(step);
    assert.equal(step.initialStatus, undefined, "샘플은 초기값이 없는 이전 형식이다");
    step.status = "rejected";
    step.chosenIndex = -1;

    resetMatchReview(set);
    assert.equal(step.status, "matched");
    assert.equal(step.chosenIndex, 0);
  });

  it("resolveApprovedSelector 가 matched 스텝에서 셀렉터를 반환한다", async () => {
    const cases = [
      {
        id: "tc-x",
        screenName: "화면",
        kind: "success" as const,
        title: "테스트",
        inputs: [{ target: "이름", value: "", control: CONTROL_KIND.text }],
        buttonName: "확인",
        expectedText: "완료",
      },
    ];

    const result = await matchTcToMap({
      cases,
      map: SAMPLE_MAP,
      mapId: "map-test",
      jobId: "job-test",
    });

    const nameStep = result.steps.find((s) => s.stepLabel === "이름");
    assert.ok(nameStep);
    if (nameStep.status === "matched" || nameStep.status === "approved") {
      const sel = resolveApprovedSelector(result, "이름");
      assert.ok(sel, "승인된 매칭에서 셀렉터를 반환해야 한다");
    }
  });

  it("후보가 없는 스텝은 review 상태다", async () => {
    const cases = [
      {
        id: "tc-y",
        screenName: "화면",
        kind: "success" as const,
        title: "테스트",
        inputs: [{ target: "존재하지않는필드xyz", value: "", control: CONTROL_KIND.text }],
        buttonName: "확인",
        expectedText: "완료",
      },
    ];

    const result = await matchTcToMap({
      cases,
      map: SAMPLE_MAP,
      mapId: "map-test",
      jobId: "job-test",
    });

    const step = result.steps.find((s) => s.stepLabel === "존재하지않는필드xyz");
    assert.ok(step);
    assert.equal(step.status, "review");
    assert.equal(step.candidates.length, 0);
  });
});
