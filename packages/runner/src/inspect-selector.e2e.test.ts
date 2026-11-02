import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";
import type { Page } from "playwright";
import { inspectSelector } from "./inspect-selector.js";

const BANNER = "#__testflow_inspect_banner";

let server: http.Server;
let baseUrl = "";
let authed = false;

before(async () => {
  server = http.createServer((req, res) => {
    res.setHeader("content-type", "text/html; charset=utf-8");
    if (req.url === "/auth") {
      authed = true;
      res.end("ok");
      return;
    }
    if (req.url === "/protected") {
      res.end(
        authed
          ? `<h1>target</h1><button id="gender" aria-label="성별">성별</button>`
          : `<form onsubmit="fetch('/auth').then(()=>{location.href='/home'});return false">` +
              `<input type="text"><input type="password"><button>로그인</button></form>`,
      );
      return;
    }
    if (req.url === "/login") {
      res.end(
        `<form onsubmit="setTimeout(()=>{location.href='/home'},800);return false">` +
          `<input type="text"><input type="password"><button>로그인</button></form>`,
      );
      return;
    }
    res.end(`<h1>home</h1><button id="gender" aria-label="성별">성별</button><div class="box">x</div>`);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(() => {
  server.close();
});

async function applyButton(page: Page, name: string): Promise<void> {
  await page.locator(`${BANNER} button`, { hasText: name }).click();
}

describe("inspectSelector", () => {
  it("로그인 후 이동해도 자동으로 선택·종료하지 않고, 적용하기를 눌러야 값을 돌려준다", async () => {
    let pendingBeforeApply = "";
    const result = await inspectSelector({
      startUrl: `${baseUrl}/login`,
      login: { email: "a", password: "b" },
      headless: true,
      timeoutMs: 20_000,
      async onReady(page) {
        await page.waitForSelector(BANNER);
        await page.locator("#gender").click();
        await page.waitForTimeout(600);
        pendingBeforeApply = (await page.locator("#__testflow_inspect_banner code").textContent()) ?? "";
        await applyButton(page, "적용하기");
      },
    });
    assert.equal(pendingBeforeApply, "#gender");
    assert.equal(result, "#gender");
  });

  it("로그인 뒤 사이트가 다른 화면으로 보내도 입력한 시작 URL 화면으로 다시 들어간다", async () => {
    authed = false;
    let urlAtReady = "";
    await inspectSelector({
      startUrl: `${baseUrl}/protected`,
      login: { email: "a", password: "b" },
      headless: true,
      timeoutMs: 20_000,
      async onReady(page) {
        await page.waitForSelector(BANNER);
        urlAtReady = page.url();
        await applyButton(page, "취소");
      },
    });
    assert.equal(urlAtReady, `${baseUrl}/protected`);
  });

  it("다시 선택하면 새로 고른 요소가 적용된다", async () => {
    const result = await inspectSelector({
      startUrl: `${baseUrl}/home`,
      headless: true,
      timeoutMs: 20_000,
      async onReady(page) {
        await page.waitForSelector(BANNER);
        await page.locator("#gender").click();
        await applyButton(page, "다시 선택");
        await page.locator(".box").click();
        await applyButton(page, "적용하기");
      },
    });
    assert.equal(result, ".box");
  });

  it("취소하면 빈 문자열을 돌려준다", async () => {
    const result = await inspectSelector({
      startUrl: `${baseUrl}/home`,
      headless: true,
      timeoutMs: 20_000,
      async onReady(page) {
        await page.waitForSelector(BANNER);
        await applyButton(page, "취소");
      },
    });
    assert.equal(result, "");
  });
});
