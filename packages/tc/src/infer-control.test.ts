import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CONTROL_KIND } from "./control-kind.js";
import {
  defaultOptionValue,
  inferControlKind,
  parseOptionList,
} from "./infer-control.js";
import { buildTestCases } from "./build-test-cases.js";

describe("parseOptionList", () => {
  it("선택 항목 문장에서 옵션을 뽑는다", () => {
    assert.deepEqual(parseOptionList("선택 항목: 전체, 남성, 여성"), [
      "전체",
      "남성",
      "여성",
    ]);
  });
});

describe("inferControlKind", () => {
  it("캘린더 기간은 date_range", () => {
    assert.equal(
      inferControlKind("시작일과 종료일을 캘린더로 고른다"),
      CONTROL_KIND.dateRange,
    );
  });

  it("성별 필터는 디자인 드롭다운(combobox)", () => {
    assert.equal(
      inferControlKind("성별 필터", ["전체", "남성", "여성"]),
      CONTROL_KIND.combobox,
    );
  });
});

describe("defaultOptionValue", () => {
  it("전체를 건너뛰고 구체 값을 고른다", () => {
    assert.equal(defaultOptionValue(["전체", "남성", "여성"]), "남성");
  });
});

describe("buildTestCases filter controls", () => {
  it("성별 필터 TC에 radio와 options를 붙인다", () => {
    const cases = buildTestCases([
      {
        screenKey: "screen-1",
        screenName: "관리자 사용자 현황",
        inputs: [
          {
            target: "성별 필터",
            constraint: "",
            warning: "",
            failureExample: "",
            control: "radio",
            options: ["전체", "남성", "여성"],
          },
        ],
        successText: "사용자 목록 조회",
        buttonName: "조회",
        features: [
          {
            title: "성별 필터",
            body: "선택 항목: 전체, 남성, 여성. 사용자 성별에 따라 필터링한다.",
          },
        ],
      },
    ]);
    const success = cases.find((item) => item.title.includes("성별"));
    assert.equal(success?.inputs[0]?.control, "radio");
    assert.deepEqual(success?.inputs[0]?.options, ["전체", "남성", "여성"]);
    assert.equal(success?.inputs[0]?.value, "남성");
  });
});
