import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";
import { chromium } from "playwright";
import { exploreScreen } from "./explore-screen.js";
import { CONTROL_KIND } from "@testflow/tc";

const FIXTURE_HTML = `<!DOCTYPE html>
<html lang="ko">
<head><meta charset="utf-8"><title>탐색 테스트 화면</title></head>
<body>
  <form>
    <div>
      <label for="user-name">이름</label>
      <input id="user-name" type="text" placeholder="이름 입력" data-testid="name-input">
    </div>
    <div>
      <label for="user-email">이메일</label>
      <input id="user-email" type="email" placeholder="이메일 입력">
    </div>
    <div>
      <label for="user-pass">비밀번호</label>
      <input id="user-pass" type="password">
    </div>
    <div>
      <label for="user-status">상태</label>
      <select id="user-status">
        <option value="active">활성</option>
        <option value="inactive">비활성</option>
        <option value="pending">대기</option>
      </select>
    </div>
    <div>
      <label for="birth-date">생년월일</label>
      <input id="birth-date" type="date">
    </div>
    <div>
      <label>성별</label>
      <input type="radio" name="gender" value="male" aria-label="남성"> 남성
      <input type="radio" name="gender" value="female" aria-label="여성"> 여성
    </div>
    <div>
      <label for="agree">동의</label>
      <input id="agree" type="checkbox">
    </div>
    <button type="submit">조회</button>
  </form>
</body>
</html>`;

let server: http.Server;
let baseUrl: string;

before(async () => {
  server = http.createServer((_, res) => {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(FIXTURE_HTML);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  baseUrl = `http://127.0.0.1:${port}`;
});

after(async () => {
  await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
});

describe("exploreScreen", () => {
  it("픽스처 페이지에서 대화형 요소를 수집한다", async () => {
    const browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    try {
      await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
      const map = await exploreScreen(page, { url: baseUrl, detectDropdowns: false, observeApis: false });

      assert.equal(map.$version, 1);
      assert.equal(map.screenTitle, "탐색 테스트 화면");
      assert.ok(map.elements.length >= 7, `요소가 7개 이상이어야 한다. 실제: ${map.elements.length}`);

      const findByKind = (kind: string) => map.elements.filter((e) => e.controlKind === kind);

      // text 타입 (이름, 이메일은 text로 분류됨)
      assert.ok(findByKind(CONTROL_KIND.text).length >= 1, "text 타입 요소가 있어야 한다");
      // password
      assert.ok(findByKind(CONTROL_KIND.password).length >= 1, "password 타입 요소가 있어야 한다");
      // select
      assert.ok(findByKind(CONTROL_KIND.select).length >= 1, "select 타입 요소가 있어야 한다");
      // date
      assert.ok(findByKind(CONTROL_KIND.date).length >= 1, "date 타입 요소가 있어야 한다");
      // radio
      assert.ok(findByKind(CONTROL_KIND.radio).length >= 2, "radio 타입 요소가 2개 이상이어야 한다");
      // checkbox
      assert.ok(findByKind(CONTROL_KIND.checkbox).length >= 1, "checkbox 타입 요소가 있어야 한다");
    } finally {
      await ctx.close();
      await browser.close();
    }
  });

  it("testid 로케이터 후보가 우선순위 1위에 온다", async () => {
    const browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    try {
      await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
      const map = await exploreScreen(page, { url: baseUrl, detectDropdowns: false, observeApis: false });

      // data-testid="name-input" 이 있는 이름 필드를 찾는다
      const nameEl = map.elements.find((e) => e.label === "이름" || e.locators.some((l) => l.value.includes("name-input")));
      assert.ok(nameEl, "이름 필드가 있어야 한다");
      assert.equal(nameEl.locators[0]?.strategy, "testid", "testid 가 첫 번째 후보여야 한다");
      assert.ok(nameEl.locators[0]?.value.includes("name-input"), "testid 값이 'name-input' 을 포함해야 한다");
    } finally {
      await ctx.close();
      await browser.close();
    }
  });

  it("select 요소의 dropdownOptionContainer 는 listbox 다", async () => {
    const browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    try {
      await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
      const map = await exploreScreen(page, { url: baseUrl, detectDropdowns: true, observeApis: false });

      const selectEl = map.elements.find((e) => e.controlKind === CONTROL_KIND.select);
      assert.ok(selectEl, "select 요소가 있어야 한다");
      assert.equal(selectEl.dropdownOptionContainer, "listbox");
    } finally {
      await ctx.close();
      await browser.close();
    }
  });

  it("normalizedUrl 이 설정된다", async () => {
    const browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    try {
      await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
      const map = await exploreScreen(page, { url: baseUrl, detectDropdowns: false, observeApis: false });
      assert.ok(map.normalizedUrl, "normalizedUrl이 설정되어야 한다");
    } finally {
      await ctx.close();
      await browser.close();
    }
  });
});
