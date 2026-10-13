/**
 * 브라우저에서 실행되는 날짜 칸 위치 스크립트.
 * 함수로 page.evaluate에 넘기면 tsx가 `__name`을 끼워 넣으므로 문자열로 둔다.
 * 클릭은 호출부에서 page.mouse.click 으로 한다. element.click() 은 비신뢰 클릭이라
 * pointerdown 으로 날짜를 고르는 피커가 무시한다.
 */
export const CLICK_CALENDAR_DAY_SOURCE = String.raw`(el, payload) => {
  var year = payload.year;
  var month = payload.month;
  var day = payload.day;
  var key = payload.key;
  var pad = function (n) { return n < 10 ? "0" + n : String(n); };
  var titleRe = new RegExp(year + "\\s*년\\s*" + month + "\\s*월");

  function classNameOf(node) {
    if (node.getAttribute) {
      return (node.getAttribute("class") || "").toLowerCase();
    }
    return "";
  }

  function isOutsideClass(node) {
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

  function dayCells(panel) {
    var nodes = panel.querySelectorAll('button, [role="gridcell"], td, [data-date], [data-day], [data-iso]');
    var out = [];
    for (var i = 0; i < nodes.length; i += 1) {
      var node = nodes[i];
      var text = (node.textContent || "").replace(/\s+/g, " ").trim();
      if (!/^\d{1,2}$/.test(text) && !node.getAttribute("data-date") && !node.getAttribute("data-day") && !node.getAttribute("data-iso") && !node.getAttribute("title")) {
        continue;
      }
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
    var found = text.match(/\d{4}\s*년\s*\d{1,2}\s*월/g) || [];
    var uniq = {};
    for (var i = 0; i < found.length; i += 1) {
      uniq[found[i].replace(/\s+/g, "")] = true;
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

  function exactAttr(panel) {
    var sels = [
      '[data-date="' + key + '"]',
      '[data-day="' + key + '"]',
      '[data-iso="' + key + '"]',
      '[title="' + key + '"]',
    ];
    for (var i = 0; i < sels.length; i += 1) {
      var hit = panel.querySelector(sels[i]);
      if (hit && !isOutsideClass(hit)) return hit;
    }
    return null;
  }

  function exactAria(panel) {
    var labels = [
      year + "년 " + month + "월 " + day + "일",
      year + "-" + pad(month) + "-" + pad(day),
    ];
    var nodes = panel.querySelectorAll("[aria-label]");
    for (var i = 0; i < nodes.length; i += 1) {
      var label = (nodes[i].getAttribute("aria-label") || "").replace(/\s+/g, " ").trim();
      for (var j = 0; j < labels.length; j += 1) {
        if (label === labels[j] || label.indexOf(labels[j]) === 0) {
          if (!isOutsideClass(nodes[i])) return nodes[i];
        }
      }
    }
    return null;
  }

  function exactNumber(panel) {
    var cells = dayCells(panel);
    var wanted = String(day);
    for (var i = 0; i < cells.length; i += 1) {
      var node = cells[i];
      var text = (node.textContent || "").replace(/\s+/g, " ").trim();
      if (text !== wanted) continue;
      if (isOutsideClass(node)) continue;
      if (isOutsideByPosition(cells, node, day)) continue;
      return node;
    }
    return null;
  }

  var panel = monthPanel(el);
  if (!panel) return null;
  var target = exactAttr(panel) || exactAria(panel) || exactNumber(panel);
  if (!target) return null;
  if (target.closest) {
    var button = target.closest("button, [role='gridcell']");
    if (button) target = button;
  }
  var rect = target.getBoundingClientRect();
  if (!rect || rect.width < 1 || rect.height < 1) return null;
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}`;
