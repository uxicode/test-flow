import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { collectTextLines } from "./figma-node.js";
import { parseFigmaUrl } from "./parse-figma-url.js";
import { readFeatureRows, segmentScreens } from "./segment-screens.js";

describe("parseFigmaUrl", () => {
  it("design URL의 node-id 하이픈을 콜론으로 바꾼다", () => {
    const parsed = parseFigmaUrl(
      "https://www.figma.com/design/x5jOK96Qacwf8wDne3c5Nq/Spec?node-id=10452-19302",
    );
    assert.equal(parsed.fileKey, "x5jOK96Qacwf8wDne3c5Nq");
    assert.equal(parsed.nodeId, "10452:19302");
  });
});

describe("segmentScreens", () => {
  it("화면 ID마다 묶고 기능 행을 나눈다", () => {
    const screens = segmentScreens([
      "화면 설명",
      "홈페이지 > 관리자 로그인",
      "화면 ID",
      "[관리자] 로그인",
      "1",
      "[이메일 입력] 형식이 올바르지 않을 경우 에러 메시지를 노출한다",
      "[로그인] 로그인 성공 시 관리자 메인 화면으로 이동",
    ]);
    assert.equal(screens.length, 1);
    assert.equal(screens[0]?.screenName, "관리자 로그인");
    const rows = readFeatureRows(screens[0]?.body ?? "");
    assert.deepEqual(
      rows.map((row) => row.title),
      ["이메일 입력", "로그인"],
    );
  });
});

describe("collectTextLines", () => {
  it("숨긴 텍스트는 빼는다", () => {
    const lines = collectTextLines([
      {
        id: "1",
        name: "frame",
        type: "FRAME",
        children: [
          { id: "2", name: "화면 ID", type: "TEXT", characters: "화면 ID" },
          { id: "3", name: "숨김", type: "TEXT", visible: false, characters: "비밀" },
        ],
      },
    ]);
    assert.deepEqual(lines, ["화면 ID"]);
  });
});
