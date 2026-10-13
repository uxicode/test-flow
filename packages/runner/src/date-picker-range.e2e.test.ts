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
import {
  applyCustomDateRange,
  displayedRangeMatches,
  parseDateRangeValue,
  parseSingleDate,
} from "./date-picker.js";
import { isHashedCssModule } from "./apply-field.js";

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
  <script>
    const TODAY = '2026-10-13';
    const state = { start: null, end: null, left: { y: 2026, m: 10 } };

    function iso(y, m, d) {
      return y + '-' + String(m).padStart(2,'0') + '-' + String(d).padStart(2,'0');
    }
    function addMonth(y, m, delta) {
      const d = new Date(y, m - 1 + delta, 1);
      return { y: d.getFullYear(), m: d.getMonth() + 1 };
    }

    function render() {
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
        btn.addEventListener('click', () => pickDate(btn.getAttribute('data-iso')));
      });
      updateHighlight();
    }

    function monthHtml(year, month, side) {
      const first = new Date(year, month - 1, 1).getDay();
      const daysIn = new Date(year, month, 0).getDate();
      const prev = addMonth(year, month, -1);
      const next = addMonth(year, month, 1);
      const prevDays = new Date(prev.y, prev.m, 0).getDate();
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
        const cls = ['day-btn', outside ? 'outside' : '', date === TODAY ? 'today' : ''].filter(Boolean).join(' ');
        const aria = date === TODAY ? ('오늘 2026년 10월 13일') : String(d);
        cells += '<button type="button" class="' + cls + '" data-iso="' + date + '" aria-label="' + aria + '">' + d + '</button>';
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
        const d = btn.getAttribute('data-iso');
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
          assert.ok(err.message.length > 0, "에러 메시지가 있어야 한다");
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

  it("hashed CSS 셀렉터를 trigger 로 사용하면 fallback 한다 (label-based)", async () => {
    const browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    try {
      await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
      // 해시 클래스를 셀렉터로 넘기면 isHashedCssModule 감지 후 라벨 기반으로 fallback
      await applyCustomDateRange(
        page,
        "기간 선택",
        "2026-10-01,2026-10-05",
        "._root_du6a0_1._calendar_fake_89", // 해시 클래스 → 감지 후 스킵
      );
      const text = await page.locator("#trigger").innerText();
      assert.ok(text.includes("10.01") || text.includes("10-01"), `시작일 없음: "${text}"`);
    } finally {
      await ctx.close();
      await browser.close();
    }
  });
});
