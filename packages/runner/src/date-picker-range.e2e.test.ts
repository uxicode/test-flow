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
import { applyCustomDateRange, parseDateRangeValue, parseSingleDate } from "./date-picker.js";
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
    #trigger { padding: 8px 12px; border: 1px solid #585b70; background: #313244;
               color: #cdd6f4; cursor: pointer; border-radius: 6px; min-width: 220px; text-align:left; }
    #calendar { display: none; border: 1px solid #585b70; background: #313244;
                padding: 12px; border-radius: 8px; margin-top: 8px; }
    #calendar.open { display: flex; gap: 20px; }
    .month-grid { display: grid; grid-template-columns: repeat(7, 32px); gap: 2px; }
    .month-title { font-weight: bold; text-align: center; margin-bottom: 8px; }
    .day-btn { width: 32px; height: 32px; border: none; background: transparent;
               color: #cdd6f4; cursor: pointer; border-radius: 4px; font-size: 13px; }
    .day-btn:hover { background: #45475a; }
    .day-btn.selected { background: #89b4fa; color: #1e1e2e; }
    .day-btn.in-range { background: #313244; outline: 1px solid #89b4fa; }
    .day-btn.empty { cursor: default; }
  </style>
</head>
<body>
  <button id="trigger" aria-expanded="false" aria-haspopup="dialog">기간 선택</button>
  <div id="calendar" role="dialog">
    <div id="oct-panel">
      <div class="month-title">2026년 10월</div>
      <div class="month-grid" id="oct-grid"></div>
    </div>
    <div id="nov-panel">
      <div class="month-title">2026년 11월</div>
      <div class="month-grid" id="nov-grid"></div>
    </div>
  </div>
  <script>
    const state = { start: null, end: null };

    function renderMonth(gridId, year, month, offset) {
      const grid = document.getElementById(gridId);
      const first = new Date(year, month - 1, 1).getDay();
      const days = new Date(year, month, 0).getDate();
      grid.innerHTML = '';
      for (let i = 0; i < first; i++) {
        const blank = document.createElement('button');
        blank.className = 'day-btn empty';
        blank.disabled = true;
        grid.appendChild(blank);
      }
      for (let d = 1; d <= days; d++) {
        const btn = document.createElement('button');
        btn.className = 'day-btn';
        btn.textContent = String(d);
        btn.dataset.date = year + '-' + String(month).padStart(2,'0') + '-' + String(d).padStart(2,'0');
        btn.addEventListener('click', () => pickDate(btn.dataset.date));
        grid.appendChild(btn);
      }
    }

    function pickDate(isoDate) {
      if (!state.start || (state.start && state.end)) {
        state.start = isoDate;
        state.end = null;
      } else {
        if (isoDate >= state.start) {
          state.end = isoDate;
        } else {
          state.start = isoDate;
          state.end = null;
        }
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
      document.querySelectorAll('.day-btn').forEach(btn => {
        btn.classList.remove('selected', 'in-range');
        const d = btn.dataset.date;
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
    });

    renderMonth('oct-grid', 2026, 10, 0);
    renderMonth('nov-grid', 2026, 11, 0);
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
      assert.ok(
        text.includes("10.01") || text.includes("10-01"),
        `트리거에 시작일이 없음. 실제: "${text}"`,
      );
      assert.ok(
        text.includes("10.13") || text.includes("10-13"),
        `트리거에 종료일이 없음. 실제: "${text}"`,
      );
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

  it("범위가 설정되지 않으면 명확한 에러를 던진다", async () => {
    // 픽스처에서 존재하지 않는 날짜(2026-12-01)를 선택하면 day 버튼을 못 찾아서 에러 발생
    const browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    try {
      await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
      await assert.rejects(
        () => applyCustomDateRange(page, "기간 선택", "2026-12-01,2026-12-31"),
        (err: Error) => {
          // 12월이 픽스처에 없으므로 날짜 칸을 찾지 못해 에러
          assert.ok(err.message.length > 0, "에러 메시지가 있어야 한다");
          return true;
        },
      );
    } finally {
      await ctx.close();
      await browser.close();
    }
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
