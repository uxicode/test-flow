/**
 * 브라우저 evaluate 와 생성 Playwright spec 이 같이 쓰는 날짜 칸 클릭 스크립트.
 * 함수로 page.evaluate 에 넘기면 tsx 가 `__name` 을 끼워 넣으므로 문자열로 둔다.
 *
 * 속성 이름이 아니라 속성 값으로 전체 날짜를 찾는다.
 * 두 달 그리드 + 회색 인접월 날짜에서 부분 문자열(`"1"` ⊂ `"13"`)을 누르지 않는다.
 */

export const DATE_VALUE_MATCHES_SOURCE = String.raw`function dateValueMatches(value, year, month, day) {
  if (value == null) return false;
  var text = String(value).replace(/\s+/g, " ").trim();
  if (!text) return false;
  var pad = function (n) { return n < 10 ? "0" + n : String(n); };
  var y = String(year);
  var m = String(month);
  var d = String(day);
  var pm = pad(month);
  var pd = pad(day);
  var formats = [
    y + "-" + pm + "-" + pd,
    y + "-" + m + "-" + d,
    y + "-" + pm + "-" + d,
    y + "-" + m + "-" + pd,
    y + "." + pm + "." + pd,
    y + "." + m + "." + d,
    y + "." + pm + "." + d,
    y + "." + m + "." + pd,
    y + "/" + pm + "/" + pd,
    y + "/" + m + "/" + d,
    y + "/" + pm + "/" + d,
    y + "/" + m + "/" + pd,
    y + pm + pd
  ];
  function isWholeDateToken(hay, needle) {
    var idx = 0;
    while (idx < hay.length) {
      var found = hay.indexOf(needle, idx);
      if (found < 0) return false;
      var before = found === 0 ? "" : hay.charAt(found - 1);
      var afterIdx = found + needle.length;
      var after = afterIdx >= hay.length ? "" : hay.charAt(afterIdx);
      var beforeOk = !before || before < "0" || before > "9";
      var afterOk = !after || after < "0" || after > "9";
      if (beforeOk && afterOk) return true;
      idx = found + 1;
    }
    return false;
  }
  for (var i = 0; i < formats.length; i += 1) {
    if (text === formats[i] || isWholeDateToken(text, formats[i])) return true;
  }
  var monthPat = month < 10 ? "0?" + month : String(month);
  var dayPat = day < 10 ? "0?" + day : String(day);
  var korean = new RegExp(
    "(^|[^0-9])" + year + "\\s*년\\s*" + monthPat + "\\s*월\\s*" + dayPat + "\\s*일($|[^0-9])"
  );
  return korean.test(text);
}`;

export const CLICK_CALENDAR_DAY_SOURCE = `(el, payload) => {
  ${DATE_VALUE_MATCHES_SOURCE}
  var year = payload.year;
  var month = payload.month;
  var day = payload.day;
  var key = payload.key || (year + "-" + (month < 10 ? "0" + month : String(month)) + "-" + (day < 10 ? "0" + day : String(day)));
  var doClick = payload.doClick !== false;
  var titleRe = new RegExp(year + "\\\\s*년\\\\s*" + month + "\\\\s*월");

  function classNameOf(node) {
    if (node.getAttribute) return (node.getAttribute("class") || "").toLowerCase();
    return "";
  }

  function isDisabledOrOutside(node) {
    var cur = node;
    var hops = 0;
    while (cur && hops < 4) {
      var cls = classNameOf(cur);
      if (/(outside|disabled|muted|other-month|out-of-month|not-current|inactive|not-in-view|day-outside|rdp-day_outside)/.test(cls)) {
        return true;
      }
      if (cur.getAttribute && cur.getAttribute("aria-disabled") === "true") return true;
      if (cur.disabled) return true;
      cur = cur.parentElement;
      hops += 1;
    }
    return false;
  }

  function isClickable(node) {
    if (!node || !node.tagName) return false;
    var tag = node.tagName.toLowerCase();
    if (tag === "button" || tag === "td" || tag === "a") return true;
    if (!node.getAttribute) return false;
    var role = node.getAttribute("role") || "";
    return role === "gridcell" || role === "button";
  }

  function clickableTarget(node) {
    var cur = node;
    var hops = 0;
    while (cur && hops < 6) {
      if (isClickable(cur)) return cur;
      cur = cur.parentElement;
      hops += 1;
    }
    return node;
  }

  function specificity(node) {
    var score = 0;
    if (isClickable(node)) score += 10;
    var tag = (node.tagName || "").toLowerCase();
    if (tag === "button") score += 3;
    if (node.getAttribute && node.getAttribute("role") === "gridcell") score += 3;
    if (tag === "td") score += 2;
    var depth = 0;
    var cur = node;
    while (cur && cur.parentElement) {
      depth += 1;
      cur = cur.parentElement;
    }
    return score + depth;
  }

  function collectAttrSamples(root) {
    var samples = [];
    var seen = {};
    function scan(node) {
      if (!node.attributes) return;
      for (var i = 0; i < node.attributes.length; i += 1) {
        var attr = node.attributes[i];
        var val = attr.value;
        if (!val || !/\\d/.test(val)) continue;
        var item = attr.name + "=" + JSON.stringify(String(val).slice(0, 80));
        if (seen[item]) continue;
        seen[item] = true;
        samples.push(item);
      }
    }
    scan(root);
    var all = root.querySelectorAll("*");
    for (var n = 0; n < all.length; n += 1) scan(all[n]);
    return samples.slice(0, 40);
  }

  function findByAttribute(root) {
    var nodes = [root];
    var all = root.querySelectorAll("*");
    for (var i = 0; i < all.length; i += 1) nodes.push(all[i]);
    var matches = [];
    for (var n = 0; n < nodes.length; n += 1) {
      var node = nodes[n];
      if (!node.attributes) continue;
      var hit = false;
      for (var a = 0; a < node.attributes.length; a += 1) {
        if (dateValueMatches(node.attributes[a].value, year, month, day)) {
          hit = true;
          break;
        }
      }
      if (!hit) continue;
      if (isDisabledOrOutside(node)) continue;
      var target = clickableTarget(node);
      if (isDisabledOrOutside(target)) continue;
      matches.push(target);
    }
    if (!matches.length) return null;
    matches.sort(function (a, b) { return specificity(b) - specificity(a); });
    return matches[0];
  }

  function dayCells(panel) {
    var nodes = panel.querySelectorAll('button, [role="gridcell"], td');
    var out = [];
    for (var i = 0; i < nodes.length; i += 1) {
      var node = nodes[i];
      var text = (node.textContent || "").replace(/\\s+/g, " ").trim();
      if (!/^\\d{1,2}$/.test(text)) continue;
      out.push(node);
    }
    return out;
  }

  function isOutsideByPosition(cells, node, n) {
    var idx = cells.indexOf(node);
    if (idx < 0) return false;
    if (idx < 7 && n > 7) return true;
    if (idx >= cells.length - 14 && n < 8 && idx > 20) return true;
    return false;
  }

  function monthHeaders(text) {
    var found = text.match(/\\d{4}\\s*년\\s*\\d{1,2}\\s*월/g) || [];
    var uniq = {};
    for (var i = 0; i < found.length; i += 1) {
      uniq[found[i].replace(/\\s+/g, "")] = true;
    }
    return Object.keys(uniq);
  }

  function monthPanel(root) {
    var candidates = root.querySelectorAll("div, section, table, [role='grid']");
    var best = null;
    var bestSize = Infinity;
    for (var i = 0; i < candidates.length; i += 1) {
      var cand = candidates[i];
      var text = cand.textContent || "";
      if (!titleRe.test(text)) continue;
      if (monthHeaders(text).length > 1) continue;
      var cells = dayCells(cand);
      if (cells.length < 20) continue;
      var size = cand.querySelectorAll("*").length;
      if (size < bestSize) {
        bestSize = size;
        best = cand;
      }
    }
    if (best) return best;
    if (titleRe.test(root.textContent || "") && dayCells(root).length >= 20) return root;
    return null;
  }

  function exactDayText(panel) {
    var cells = dayCells(panel);
    var wanted = String(day);
    for (var i = 0; i < cells.length; i += 1) {
      var node = cells[i];
      var text = (node.textContent || "").replace(/\\s+/g, " ").trim();
      if (text !== wanted) continue;
      if (isDisabledOrOutside(node)) continue;
      if (isOutsideByPosition(cells, node, day)) continue;
      return node;
    }
    return null;
  }

  function failReason(scanned, panelFound) {
    return key + " 날짜 칸을 찾지 못했습니다. " +
      "속성 값으로 전체 날짜를 찾지 못했고, " +
      (panelFound ? "월 패널의 날짜 텍스트도 일치하지 않습니다. " : "해당 월 패널을 찾지 못했습니다. ") +
      "스캔한 속성: " + (scanned.length ? scanned.join(", ") : "(숫자 있는 속성 없음)");
  }

  var scanned = collectAttrSamples(el);
  var byAttr = findByAttribute(el);
  if (byAttr) {
    console.log("[clickMonthDay]", key, "matched by attribute");
    if (doClick) byAttr.click();
    return { ok: true, method: "attribute", scanned: scanned };
  }
  var panel = monthPanel(el);
  var byText = panel ? exactDayText(panel) : null;
  if (byText) {
    console.log("[clickMonthDay]", key, "matched by day-text");
    if (doClick) byText.click();
    return { ok: true, method: "day-text", scanned: scanned };
  }
  return { ok: false, reason: failReason(scanned, Boolean(panel)), scanned: scanned };
}`;

export interface DayClickPayload {
  year: number;
  month: number;
  day: number;
  key: string;
  doClick: boolean;
}

export interface DayClickResult {
  ok: boolean;
  method?: "attribute" | "day-text";
  reason?: string;
  scanned?: string[];
}

export function dateValueMatches(value: string, year: number, month: number, day: number): boolean {
  const fn = new Function(
    "value",
    "year",
    "month",
    "day",
    `${DATE_VALUE_MATCHES_SOURCE}; return dateValueMatches(value, year, month, day);`,
  ) as (raw: string, y: number, m: number, d: number) => boolean;
  return fn(value, year, month, day);
}

export function clickMonthDayHelperLines(): string[] {
  const indented = CLICK_CALENDAR_DAY_SOURCE.split("\n")
    .map((line, index) => (index === 0 ? line : `    ${line}`))
    .join("\n");
  return [
    `async function clickMonthDay(calendar: Locator, iso: string): Promise<void> {`,
    `  const [year, month, day] = iso.split('-').map(Number);`,
    `  const result = await calendar.evaluate((root, payload) => {`,
    `    const clickCalendarDay = ${indented};`,
    `    return clickCalendarDay(root, payload);`,
    `  }, { year, month, day, key: iso, doClick: true });`,
    `  console.log('[clickMonthDay]', iso, result.method ?? result.reason);`,
    `  if (!result.ok) throw new Error(result.reason || (iso + ' 날짜 칸을 찾지 못했습니다.'));`,
    `}`,
  ];
}
