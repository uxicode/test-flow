import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { collectTextLines } from "./figma-node.js";
import { fetchSpecImage } from "./fetch-image.js";
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

describe("fetchSpecImage", () => {
  it("Figma 이미지 URL을 base64로 받는다", async () => {
    const png = new Uint8Array([137, 80, 78, 71]).buffer;
    const encoded = await fetchSpecImage({
      url: "https://www.figma.com/design/Abcdefghijklmnopqr12/Spec?node-id=1-2",
      token: "token",
      fetchImpl: async (url) => {
        if (url.includes("/images/")) {
          return {
            status: 200,
            json: async () => ({ images: { "1:2": "https://img.example/shot.png" } }),
          };
        }
        return {
          status: 200,
          json: async () => ({}),
          arrayBuffer: async () => png,
        };
      },
    });
    assert.equal(encoded, Buffer.from(png).toString("base64"));
  });

  it("긴 변을 넘으면 더 작은 scale로 다시 받는다", async () => {
    const scales: string[] = [];
    const large = pngHeader(4000, 2000);
    const small = pngHeader(1024, 512);
    const encoded = await fetchSpecImage({
      url: "https://www.figma.com/design/Abcdefghijklmnopqr12/Spec?node-id=1-2",
      token: "token",
      maxSide: 1024,
      fetchImpl: async (url) => {
        if (url.includes("/images/")) {
          const scale = new URL(url).searchParams.get("scale") ?? "";
          scales.push(scale);
          return {
            status: 200,
            json: async () => ({ images: { "1:2": `https://img.example/${scale}.png` } }),
          };
        }
        return {
          status: 200,
          json: async () => ({}),
          arrayBuffer: async () => (url.includes("/0.256.png") ? small : large),
        };
      },
    });
    assert.deepEqual(scales, ["1", "0.256"]);
    assert.equal(encoded, Buffer.from(small).toString("base64"));
  });
});

function pngHeader(width: number, height: number): ArrayBuffer {
  const buffer = Buffer.alloc(24);
  buffer[0] = 0x89;
  buffer.write("PNG", 1);
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}
