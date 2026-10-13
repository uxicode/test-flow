/**
 * 날짜 범위 선택기 버그 재현 및 수정 검증 e2e 테스트.
 *
 * 버그: applyCustomDateRange 가 날짜를 클릭했지만 실제로 범위가 설정되지 않아도
 * 에러 없이 통과하던 문제.
 *
 * 픽스처: 두 달 캘린더(Oct + Nov 2026)를 보여주는 로컬 HTML 페이지를 만들고
 * Playwright 로 열어서 시작일·종료일 선택 후 트리거 텍스트 검증을 테스트한다.
 */
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";
import { chromium } from "playwright";
import { CONTROL_KIND } from "@testflow/tc";
import {
  CLICK_CALENDAR_DAY_SOURCE,
  DATE_VALUE_MATCHES_SOURCE,
  dateCalendarScopeExpr,
  dateTriggerLocatorExpr,
  generatePlaywrightSpec,
  playwrightLocatorExpr,
  type DayClickPayload,
  type DayClickResult,
} from "@testflow/tc/playwright-spec";
import {
  applyCustomDateRange,
  CalendarScopeError,
  displayedRangeMatches,
  parseDateRangeValue,
  parseSingleDate,
} from "./date-picker.js";
import { applyFieldValue, isHashedCssModule } from "./apply-field.js";

// ---------------------------------------------------------------------------
// 픽스처 HTML: 두 달 캘린더 범위 선택기
// ---------------------------------------------------------------------------

const FIXTURE_HTML = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <title>날짜 범위 픽커 테스트</title>
  <style>
    body { font-family: sans-serif; padding: 20px; background: #1e1e2e; color: #cdd6f4; }
    label { display: block; font-size: 13px; margin-bottom: 6px; }
    #trigger { padding: 8px 12px; border: 1px solid #585b70; background: #313244;
               color: #cdd6f4; cursor: pointer; border-radius: 6px; min-width: 220px; text-align:left; }
    #calendar { display: none; border: 1px solid #585b70; background: #fff;
                color: #1e1e2e; padding: 12px; border-radius: 8px; margin-top: 8px; }
    #calendar.open { display: flex; gap: 28px; }
    .month-panel { min-width: 230px; }
    .month-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; font-weight: bold; }
    .month-head button { border: none; background: transparent; cursor: pointer; font-size: 16px; }
    .dow { display: grid; grid-template-columns: repeat(7, 32px); gap: 2px; font-size: 11px; color: #888; text-align: center; margin-bottom: 4px; }
    .month-grid { display: grid; grid-template-columns: repeat(7, 32px); gap: 2px; }
    .day-btn { width: 32px; height: 32px; border: none; background: transparent;
               color: #1e1e2e; cursor: pointer; border-radius: 16px; font-size: 13px; }
    .day-btn.outside { color: #c4c4c4; }
    .day-btn.today { background: #1e1e2e; color: #fff; }
    .day-btn.selected { background: #3b82f6; color: #fff; }
    .day-btn.in-range { background: #dbeafe; }
  </style>
</head>
<body>
  <label for="trigger">등록일</label>
  <button id="trigger" aria-expanded="false" aria-haspopup="dialog">기간 선택</button>
  <div id="calendar" class="calendar _root_du6a0_1 _calendar_o7hka_89" role="dialog"></div>
  <button type="button" id="search">조회</button>
  <p id="result" hidden>사용자 목록</p>
  <script>
    const TODAY = '2026-10-13';
    const state = { start: null, end: null, left: { y: 2026, m: 10 } };
    const cellDates = [];

    function iso(y, m, d) {
      return y + '-' + String(m).padStart(2,'0') + '-' + String(d).padStart(2,'0');
    }
    function addMonth(y, m, delta) {
      const d = new Date(y, m - 1 + delta, 1);
      return { y: d.getFullYear(), m: d.getMonth() + 1 };
    }

    function render() {
      cellDates.length = 0;
      const cal = document.getElementById('calendar');
      const left = state.left;
      const right = addMonth(left.y, left.m, 1);
      cal.innerHTML = monthHtml(left.y, left.m, 'left') + monthHtml(right.y, right.m, 'right');
      cal.querySelectorAll('[data-nav]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const dir = Number(btn.getAttribute('data-nav'));
          state.left = addMonth(state.left.y, state.left.m, dir);
          render();
        });
      });
      cal.querySelectorAll('.day-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          const id = Number(btn.getAttribute('data-cell-id'));
          pickDate(cellDates[id]);
        });
      });
      updateHighlight();
    }

    function monthHtml(year, month, side) {
      const first = new Date(year, month - 1, 1).getDay();
      const daysIn = new Date(year, month, 0).getDate();
      const prev = addMonth(year, month, -1);
      const next = addMonth(year, month, 1);
      const prevDays = new Date(prev.y, prev.m, 0).getDate();
      const withDateAttr = side === 'left';
      let cells = '';
      for (let i = 0; i < 42; i++) {
        let y, m, d, outside = false;
        if (i < first) {
          y = prev.y; m = prev.m; d = prevDays - first + 1 + i; outside = true;
        } else if (i - first + 1 > daysIn) {
          y = next.y; m = next.m; d = i - first + 1 - daysIn; outside = true;
        } else {
          y = year; m = month; d = i - first + 1;
        }
        const date = iso(y, m, d);
        const isToday = date === TODAY;
        const cls = ['day-btn', outside ? 'outside' : '', isToday ? 'today' : ''].filter(Boolean).join(' ');
        const cellId = cellDates.length;
        cellDates.push(date);
        let attrs = 'type="button" class="' + cls + '" data-cell-id="' + cellId + '"';
        if (withDateAttr && (outside || !isToday)) attrs += ' data-day-value="' + date + '"';
        attrs += isToday ? ' aria-label="오늘 2026년 10월 13일"' : (' aria-label="' + d + '"');
        cells += '<button ' + attrs + '>' + d + '</button>';
      }
      return '<div class="month-panel" id="' + side + '-panel">' +
        '<div class="month-head">' +
          '<button type="button" data-nav="-1" aria-label="이전 달">&lt;</button>' +
          '<span>' + year + '년 ' + month + '월</span>' +
          '<button type="button" data-nav="1" aria-label="다음 달">&gt;</button>' +
        '</div>' +
        '<div class="dow"><span>일</span><span>월</span><span>화</span><span>수</span><span>목</span><span>금</span><span>토</span></div>' +
        '<div class="month-grid">' + cells + '</div></div>';
    }

    function pickDate(isoDate) {
      if (!state.start || (state.start && state.end)) {
        state.start = isoDate;
        state.end = null;
      } else if (isoDate >= state.start) {
        state.end = isoDate;
      } else {
        state.start = isoDate;
        state.end = null;
      }
      updateTrigger();
      updateHighlight();
      if (state.start && state.end) {
        document.getElementById('calendar').classList.remove('open');
        document.getElementById('trigger').setAttribute('aria-expanded','false');
      }
    }

    function updateTrigger() {
      const trig = document.getElementById('trigger');
      if (state.start && state.end) {
        trig.textContent = state.start.replace(/-/g,'.') + ' ~ ' + state.end.replace(/-/g,'.');
      } else if (state.start) {
        trig.textContent = state.start.replace(/-/g,'.') + ' ~';
      } else {
        trig.textContent = '기간 선택';
      }
    }

    function updateHighlight() {
      document.querySelectorAll('.day-btn').forEach((btn) => {
        btn.classList.remove('selected', 'in-range');
        const d = cellDates[Number(btn.getAttribute('data-cell-id'))];
        if (!d) return;
        if (d === state.start || d === state.end) btn.classList.add('selected');
        else if (state.start && state.end && d > state.start && d < state.end) btn.classList.add('in-range');
      });
    }

    document.getElementById('trigger').addEventListener('click', () => {
      const cal = document.getElementById('calendar');
      const trig = document.getElementById('trigger');
      const isOpen = cal.classList.contains('open');
      cal.classList.toggle('open', !isOpen);
      trig.setAttribute('aria-expanded', String(!isOpen));
      if (!isOpen) render();
    });
    document.getElementById('search').addEventListener('click', () => {
      document.getElementById('result').hidden = false;
    });
  </script>
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

// ---------------------------------------------------------------------------
// 파서 단위 테스트 (브라우저 없이)
// ---------------------------------------------------------------------------

describe("parseDateRangeValue", () => {
  it("쉼표 구분 범위를 파싱한다", () => {
    const result = parseDateRangeValue("2026-10-01,2026-10-13");
    assert.ok(result);
    assert.equal(result.start.year, 2026);
    assert.equal(result.start.month, 10);
    assert.equal(result.start.day, 1);
    assert.equal(result.end.year, 2026);
    assert.equal(result.end.month, 10);
    assert.equal(result.end.day, 13);
  });

  it("물결표 구분 범위를 파싱한다", () => {
    const result = parseDateRangeValue("2026.10.01 ~ 2026.11.05");
    assert.ok(result);
    assert.equal(result.start.month, 10);
    assert.equal(result.end.month, 11);
  });

  it("단일 날짜를 start=end 로 처리한다", () => {
    const result = parseDateRangeValue("2026-10-13");
    assert.ok(result);
    assert.equal(result.start.day, 13);
    assert.equal(result.end.day, 13);
  });
});

describe("parseSingleDate", () => {
  it("점 구분자를 파싱한다", () => {
    const d = parseSingleDate("2026.10.13");
    assert.ok(d);
    assert.equal(d.year, 2026);
    assert.equal(d.month, 10);
    assert.equal(d.day, 13);
  });

  it("잘못된 날짜는 null 을 반환한다", () => {
    assert.equal(parseSingleDate("not-a-date"), null);
    assert.equal(parseSingleDate(""), null);
  });
});

describe("isHashedCssModule", () => {
  it("CSS 모듈 해시 클래스를 감지한다", () => {
    assert.equal(isHashedCssModule("._root_du6a0_1._calendar_o7hka_89"), true);
    assert.equal(isHashedCssModule("._calendar_o7hka_89"), true);
  });

  it("일반 클래스는 해시로 보지 않는다", () => {
    assert.equal(isHashedCssModule(".my-button"), false);
    assert.equal(isHashedCssModule("#email-input"), false);
    assert.equal(isHashedCssModule("[data-testid='submit']"), false);
  });

  it("단순 숫자 없는 클래스는 해시로 보지 않는다", () => {
    assert.equal(isHashedCssModule(".calendar"), false);
  });
});

// ---------------------------------------------------------------------------
// e2e: 두 달 캘린더 범위 선택기
// ---------------------------------------------------------------------------

describe("applyCustomDateRange (두 달 캘린더 픽스처)", () => {
  it("같은 달 내 범위를 올바르게 선택하고 트리거에 반영한다", async () => {
    const browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    try {
      await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
      await applyCustomDateRange(page, "기간 선택", "2026-10-01,2026-10-13");

      const text = await page.locator("#trigger").innerText();
      assert.equal(text.replace(/\s+/g, " ").trim(), "2026.10.01 ~ 2026.10.13");
    } finally {
      await ctx.close();
      await browser.close();
    }
  });

  it("다른 달 범위를 올바르게 선택한다 (10월~11월)", async () => {
    const browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    try {
      await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
      await applyCustomDateRange(page, "기간 선택", "2026-10-05,2026-11-15");

      const text = await page.locator("#trigger").innerText();
      assert.ok(text.includes("10.05") || text.includes("10-05"), `시작일 없음: "${text}"`);
      assert.ok(text.includes("11.15") || text.includes("11-15"), `종료일 없음: "${text}"`);
    } finally {
      await ctx.close();
      await browser.close();
    }
  });

  it("화면에 없는 먼 연도는 명확한 에러를 던진다", async () => {
    const browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    try {
      await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
      await assert.rejects(
        () => applyCustomDateRange(page, "기간 선택", "2099-01-01,2099-01-31"),
        (err: Error) => {
          assert.match(err.message, /2099-01-01/);
          assert.match(err.message, /스캔한 속성/);
          return true;
        },
      );
    } finally {
      await ctx.close();
      await browser.close();
    }
  });

  it("다음 달로 이동해 12월 범위를 선택한다", async () => {
    const browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    try {
      await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
      await applyCustomDateRange(page, "기간 선택", "2026-12-01,2026-12-15");
      const text = await page.locator("#trigger").innerText();
      assert.equal(text.replace(/\s+/g, " ").trim(), "2026.12.01 ~ 2026.12.15");
    } finally {
      await ctx.close();
      await browser.close();
    }
  });

  it("트리거에 시작일만 있으면 정확한 범위가 아니라서 실패한다", async () => {
    assert.equal(
      displayedRangeMatches("2026.10.13 ~", {
        start: { year: 2026, month: 10, day: 1 },
        end: { year: 2026, month: 10, day: 13 },
      }),
      false,
    );
    assert.equal(
      displayedRangeMatches("2026.10.01 ~ 2026.10.13", {
        start: { year: 2026, month: 10, day: 1 },
        end: { year: 2026, month: 10, day: 13 },
      }),
      true,
    );
  });

  it("고른 해시 셀렉터를 캘린더 컨테이너로 그대로 사용한다", async () => {
    const picked = "._root_du6a0_1._calendar_o7hka_89";
    const browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    try {
      await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
      await applyCustomDateRange(page, "검사일 필터", "2026-10-01,2026-10-13", {
        containerSelector: picked,
      });
      const text = await page.locator("#trigger").innerText();
      assert.equal(text.replace(/\s+/g, " ").trim(), "2026.10.01 ~ 2026.10.13");
    } finally {
      await ctx.close();
      await browser.close();
    }
  });

  it("고른 컨테이너가 없으면 셀렉터 이름을 넣은 에러를 던진다", async () => {
    const browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    try {
      await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
      await assert.rejects(
        () =>
          applyCustomDateRange(page, "검사일 필터", "2026-10-01,2026-10-13", {
            containerSelector: "._root_du6a0_1._calendar_fake_89",
          }),
        (err: unknown) => {
          assert.ok(err instanceof CalendarScopeError);
          assert.match(err.message, /\._root_du6a0_1\._calendar_fake_89/);
          assert.match(err.message, /캘린더 컨테이너/);
          return true;
        },
      );
    } finally {
      await ctx.close();
      await browser.close();
    }
  });

  it("생성 spec 과 러너가 같은 캘린더 locator 를 쓰고, spec locator 로 픽스처를 조작한다", async () => {
    const picked = "._root_du6a0_1._calendar_o7hka_89";
    const spec = generatePlaywrightSpec(
      {
        id: "tc-date",
        screenName: "관리자 사용자 현황",
        kind: "success",
        title: "관리자 사용자 현황 · 검사일 필터",
        inputs: [
          {
            target: "검사일 필터",
            value: "2026-10-01,2026-10-13",
            control: CONTROL_KIND.dateRange,
            selector: picked,
            selectorStrategy: "css",
          },
        ],
        buttonName: "조회",
        expectedText: "사용자 목록",
      },
      { startUrl: baseUrl },
    );
    const calendarExpr = dateCalendarScopeExpr(picked);
    assert.equal(calendarExpr, "page.locator('._root_du6a0_1._calendar_o7hka_89')");
    assert.equal(playwrightLocatorExpr("css", picked), calendarExpr);
    assert.ok(spec.includes(calendarExpr), `spec 이 ${calendarExpr} 를 써야 한다\n${spec}`);
    assert.ok(spec.includes(dateTriggerLocatorExpr("검사일 필터")));
    assert.equal(spec.includes("트리거로 쓰지 않는다"), false);
    assert.equal(spec.includes("getByRole('dialog')"), false);
    assert.ok(
      spec.replace(/\s+/g, " ").includes(DATE_VALUE_MATCHES_SOURCE.replace(/\s+/g, " ")),
      "spec 이 러너와 같은 날짜 값 매칭을 써야 한다",
    );
    assert.equal(spec.includes("[data-date=\"' + payload.iso"), false);
    assert.equal(spec.includes("[data-iso=\"' + payload.iso"), false);

    const browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    try {
      await page.goto(baseUrl, { waitUntil: "domcontentloaded" });

      const trigger = page
        .getByRole("button", { name: /검사일 필터|검사일|등록일|조회 기간/ })
        .or(page.getByLabel(/검사일 필터|검사일|등록일|조회 기간/));
      await trigger.click();
      const calendar = page.locator(picked);
      assert.equal(await calendar.count(), 1, "고른 셀렉터가 캘린더를 찾아야 한다");
      await calendar.waitFor({ state: "visible", timeout: 5000 });

      const clickMonthDay = async (iso: string) => {
        const [year, month, day] = iso.split("-").map(Number);
        const payload: DayClickPayload = { year, month, day, key: iso, doClick: true };
        const clicker = new Function("el", "payload", `return (${CLICK_CALENDAR_DAY_SOURCE})(el, payload);`) as (
          el: Element,
          arg: DayClickPayload,
        ) => DayClickResult;
        const result = await calendar.evaluate(clicker, payload);
        assert.equal(result.ok, true, result.reason ?? `${iso} 를 spec 로케이터로 눌러야 한다`);
        return result;
      };

      const start = await clickMonthDay("2026-10-01");
      const end = await clickMonthDay("2026-10-13");
      assert.equal(start.method, "attribute");
      assert.equal(end.method, "attribute");
      assert.equal((await page.locator("#trigger").innerText()).replace(/\s+/g, " ").trim(), "2026.10.01 ~ 2026.10.13");
      await page.getByRole("button", { name: "조회" }).click();
      assert.equal(await page.getByText("사용자 목록").isVisible(), true);
    } finally {
      await ctx.close();
      await browser.close();
    }
  });

  it("비표준 속성 값으로 찾고, 속성 없는 칸은 날짜 텍스트로 찾는다", async () => {
    const picked = "._root_du6a0_1._calendar_o7hka_89";
    const browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    try {
      await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
      await page.locator("#trigger").click();
      const calendar = page.locator(picked);
      await calendar.waitFor({ state: "visible", timeout: 5000 });

      const probe = async (iso: string, doClick: boolean) => {
        const [year, month, day] = iso.split("-").map(Number);
        const payload: DayClickPayload = { year, month, day, key: iso, doClick };
        const clicker = new Function("el", "payload", `return (${CLICK_CALENDAR_DAY_SOURCE})(el, payload);`) as (
          el: Element,
          arg: DayClickPayload,
        ) => DayClickResult;
        return calendar.evaluate(clicker, payload);
      };

      assert.equal((await probe("2026-10-01", false)).method, "attribute");
      assert.equal((await probe("2026-10-13", false)).method, "attribute");
      assert.equal((await probe("2026-11-15", false)).method, "day-text");

      await applyCustomDateRange(page, "기간 선택", "2026-10-05,2026-11-15");
      const text = await page.locator("#trigger").innerText();
      assert.equal(text.replace(/\s+/g, " ").trim(), "2026.10.05 ~ 2026.11.15");
    } finally {
      await ctx.close();
      await browser.close();
    }
  });

  it("applyFieldValue 는 고른 해시 셀렉터를 바꾸지 않고 캘린더 스코프로 쓴다", async () => {
    const picked = "._root_du6a0_1._calendar_o7hka_89";
    const browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const logs: string[] = [];
    try {
      await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
      await applyFieldValue(
        page,
        {
          target: "검사일 필터",
          value: "2026-10-01,2026-10-13",
          control: CONTROL_KIND.dateRange,
          selector: picked,
          selectorStrategy: "css",
        },
        (message) => logs.push(message),
        async () => ({ x: 0, y: 0 }),
      );
      assert.equal((await page.locator("#trigger").innerText()).replace(/\s+/g, " ").trim(), "2026.10.01 ~ 2026.10.13");
      assert.ok(logs.some((line) => line.includes(picked)), `로그에 고른 셀렉터가 남아야 한다\n${logs.join("\n")}`);
      assert.equal(logs.some((line) => line.includes("트리거로 쓰지 않는다")), false);
    } finally {
      await ctx.close();
      await browser.close();
    }
  });
});
