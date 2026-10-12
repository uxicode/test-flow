import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import {
  ELEMENT_MAP_VERSION,
  deleteElementMap,
  findLatestMapByUrl,
  listElementMaps,
  loadElementMap,
  normalizeUrl,
  saveElementMap,
  upsertPinnedSelector,
  type ScreenElementMap,
} from "./element-map.js";

const SAMPLE_MAP: ScreenElementMap = {
  $version: ELEMENT_MAP_VERSION,
  url: "https://example.com/admin/users",
  normalizedUrl: normalizeUrl("https://example.com/admin/users"),
  exploredAt: new Date().toISOString(),
  screenTitle: "사용자 목록",
  elements: [
    {
      label: "이름",
      controlKind: "text",
      locators: [
        { strategy: "label", value: "이름" },
        { strategy: "css", value: "#user-name" },
      ],
      dropdownOptionContainer: null,
    },
    {
      label: "상태",
      controlKind: "select",
      locators: [
        { strategy: "label", value: "상태" },
        { strategy: "css", value: "#user-status" },
      ],
      dropdownOptionContainer: "listbox",
    },
  ],
  queryApiUrls: ["/api/users/search"],
};

let tmpDir: string;
const originalDir = process.env.ELEMENT_MAP_DIR;

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "testflow-map-"));
  process.env.ELEMENT_MAP_DIR = tmpDir;
});

after(() => {
  if (originalDir === undefined) delete process.env.ELEMENT_MAP_DIR;
  else process.env.ELEMENT_MAP_DIR = originalDir;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("normalizeUrl", () => {
  it("프래그먼트를 제거한다", () => {
    assert.equal(normalizeUrl("https://example.com/path#hash"), "https://example.com/path");
  });

  it("trailing slash를 제거한다", () => {
    assert.equal(normalizeUrl("https://example.com/path/"), "https://example.com/path");
  });

  it("루트 경로는 유지한다", () => {
    const url = normalizeUrl("https://example.com/");
    assert.ok(url.startsWith("https://example.com"));
  });

  it("잘못된 URL은 원본을 반환한다", () => {
    assert.equal(normalizeUrl("not-a-url"), "not-a-url");
  });
});

describe("saveElementMap / loadElementMap", () => {
  it("파일을 저장하고 올바르게 불러온다", () => {
    const meta = saveElementMap(SAMPLE_MAP);
    assert.ok(meta.mapId);
    assert.equal(meta.url, SAMPLE_MAP.url);
    assert.equal(meta.screenTitle, SAMPLE_MAP.screenTitle);
    assert.equal(meta.elementCount, 2);

    const loaded = loadElementMap(meta.mapId);
    assert.equal(loaded.$version, ELEMENT_MAP_VERSION);
    assert.equal(loaded.url, SAMPLE_MAP.url);
    assert.equal(loaded.elements.length, 2);
    assert.equal(loaded.queryApiUrls[0], "/api/users/search");
  });

  it("존재하지 않는 mapId는 에러를 던진다", () => {
    assert.throws(() => loadElementMap("ghost-map-id"), /찾지 못했습니다/u);
  });

  it("버전이 다른 파일은 에러를 던진다", () => {
    const mapId = `bad-ver-${Date.now()}`;
    fs.writeFileSync(
      path.join(tmpDir, `${mapId}.json`),
      JSON.stringify({ $version: 999, url: "", normalizedUrl: "", exploredAt: "", screenTitle: "", elements: [], queryApiUrls: [] }),
      "utf8",
    );
    assert.throws(() => loadElementMap(mapId), /버전/u);
  });
});

describe("listElementMaps", () => {
  it("저장된 맵 목록을 반환한다", () => {
    const countBefore = listElementMaps().length;
    saveElementMap({ ...SAMPLE_MAP, url: "https://example.com/list1", normalizedUrl: normalizeUrl("https://example.com/list1") });
    saveElementMap({ ...SAMPLE_MAP, url: "https://example.com/list2", normalizedUrl: normalizeUrl("https://example.com/list2") });
    const after = listElementMaps();
    assert.ok(after.length >= countBefore + 2, `기대: ${countBefore + 2} 이상, 실제: ${after.length}`);
  });

  it("존재하지 않는 디렉터리에서는 빈 배열을 반환한다", () => {
    const isolatedDir = path.join(os.tmpdir(), `testflow-no-map-dir-${Date.now()}`);
    process.env.ELEMENT_MAP_DIR = isolatedDir;
    try {
      assert.deepEqual(listElementMaps(), []);
    } finally {
      process.env.ELEMENT_MAP_DIR = tmpDir;
    }
  });
});

describe("deleteElementMap", () => {
  it("파일을 삭제한다", () => {
    const meta = saveElementMap(SAMPLE_MAP);
    deleteElementMap(meta.mapId);
    assert.ok(!fs.existsSync(path.join(tmpDir, `${meta.mapId}.json`)));
  });

  it("존재하지 않는 mapId는 에러를 던진다", () => {
    assert.throws(() => deleteElementMap("ghost-id"), /찾지 못했습니다/u);
  });
});

describe("findLatestMapByUrl", () => {
  it("URL로 가장 최근 맵을 찾는다", () => {
    const url = "https://example.com/find-test";
    saveElementMap({ ...SAMPLE_MAP, url, normalizedUrl: normalizeUrl(url) });
    const found = findLatestMapByUrl(url);
    assert.ok(found, "URL에 해당하는 맵이 있어야 한다");
    assert.equal(found.map.url, url);
  });

  it("없는 URL은 undefined를 반환한다", () => {
    const result = findLatestMapByUrl("https://example.com/no-such-url");
    assert.equal(result, undefined);
  });

  it("프래그먼트가 달라도 같은 URL로 찾는다", () => {
    const url = "https://example.com/fragment-test";
    saveElementMap({ ...SAMPLE_MAP, url, normalizedUrl: normalizeUrl(url) });
    const found = findLatestMapByUrl(`${url}#section`);
    assert.ok(found);
  });
});

describe("upsertPinnedSelector", () => {
  it("기존 맵에 pinnedSelector를 추가한다", () => {
    const url = "https://example.com/upsert-test";
    const meta = saveElementMap({ ...SAMPLE_MAP, url, normalizedUrl: normalizeUrl(url) });

    upsertPinnedSelector(url, "이름", "#pinned-name");

    const loaded = loadElementMap(meta.mapId);
    const entry = loaded.elements.find((e) => e.label === "이름");
    assert.equal(entry?.pinnedSelector, "#pinned-name");
  });

  it("맵이 없으면 새 맵을 생성한다", () => {
    const url = "https://example.com/new-map-upsert";
    upsertPinnedSelector(url, "신규레이블", "[data-testid='new-el']");

    const found = findLatestMapByUrl(url);
    assert.ok(found);
    const entry = found.map.elements.find((e) => e.label === "신규레이블");
    assert.equal(entry?.pinnedSelector, "[data-testid='new-el']");
  });

  it("레이블이 없는 요소는 새 항목으로 추가된다", () => {
    const url = "https://example.com/add-element-test";
    const meta = saveElementMap({ ...SAMPLE_MAP, url, normalizedUrl: normalizeUrl(url) });

    upsertPinnedSelector(url, "추가필드", ".added-field");

    const loaded = loadElementMap(meta.mapId);
    const entry = loaded.elements.find((e) => e.label === "추가필드");
    assert.ok(entry);
    assert.equal(entry.pinnedSelector, ".added-field");
  });
});
