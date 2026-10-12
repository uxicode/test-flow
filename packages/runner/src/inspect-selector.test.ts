import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeOptimalSelector } from "./inspect-selector.js";

// JSDOM 없는 환경을 위한 간단한 모의 HTMLElement 생성기
function mockElement(options: {
  tagName?: string;
  id?: string;
  className?: string;
  classList?: string[];
  attributes?: Record<string, string>;
}): any {
  const attrs = options.attributes ?? {};
  if (options.id) attrs.id = options.id;
  if (options.className) attrs.class = options.className;

  return {
    tagName: options.tagName ?? "div",
    id: options.id ?? "",
    className: options.className ?? "",
    classList: options.classList ?? (options.className ? options.className.split(" ") : []),
    getAttribute(name: string) {
      return attrs[name] ?? null;
    },
    attributes: Object.entries(attrs).map(([name, value]) => ({ name, value })),
  };
}

describe("computeOptimalSelector", () => {
  it("유효한 ID가 있으면 #id 셀렉터를 반환한다", () => {
    const el = mockElement({ id: "user-status-filter" });
    assert.equal(computeOptimalSelector(el), "#user-status-filter");
  });

  it("data- 속성이 있으면 [data-*] 셀렉터를 반환한다", () => {
    const el = mockElement({
      attributes: { "data-select-popover-shell": "", "class": "popup-box" },
    });
    assert.equal(computeOptimalSelector(el), "[data-select-popover-shell]");

    const elWithValue = mockElement({
      attributes: { "data-testid": "gender-dropdown-list" },
    });
    assert.equal(computeOptimalSelector(elWithValue), '[data-testid="gender-dropdown-list"]');
  });

  it("role 속성이 있으면 [role=...] 셀렉터를 반환한다", () => {
    const el = mockElement({
      attributes: { role: "listbox" },
      className: "dropdown-panel",
    });
    assert.equal(computeOptimalSelector(el), '[role="listbox"]');
  });

  it("의미 있는 클래스명이 있으면 해당 클래스들을 결합하여 반환한다", () => {
    const el = mockElement({
      className: "ant-select-dropdown select-menu-panel",
    });
    assert.equal(computeOptimalSelector(el), ".ant-select-dropdown.select-menu-panel");
  });

  it("클래스가 있으면 해당 클래스를 반환한다", () => {
    const el = mockElement({
      tagName: "UL",
      className: "items-wrapper",
    });
    assert.equal(computeOptimalSelector(el), ".items-wrapper");
  });

  it("속성이나 클래스가 없으면 태그명을 반환한다", () => {
    const el = mockElement({
      tagName: "UL",
    });
    assert.equal(computeOptimalSelector(el), "ul");
  });
});
