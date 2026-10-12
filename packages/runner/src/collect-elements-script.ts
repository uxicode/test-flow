/**
 * 브라우저에서 대화형 요소를 수집하는 스크립트.
 * 함수로 page.evaluate에 넘기면 tsx가 중첩 함수에 `__name`을 끼워 넣어
 * `ReferenceError: __name is not defined`가 난다. 문자열은 변환되지 않는다.
 */
export const COLLECT_ELEMENTS_SCRIPT = `(() => {
  function getAccessibleName(el) {
    var ariaLabel = el.getAttribute("aria-label");
    if (ariaLabel && ariaLabel.trim()) return ariaLabel.trim();

    var labelledby = el.getAttribute("aria-labelledby");
    if (labelledby) {
      var parts = labelledby.split(/\\s+/).map(function (id) {
        var node = document.getElementById(id);
        return node && node.textContent ? node.textContent.trim() : "";
      }).filter(Boolean);
      if (parts.length) return parts.join(" ");
    }

    var id = el.getAttribute("id");
    if (id) {
      try {
        var lbl = document.querySelector('label[for="' + CSS.escape(id) + '"]');
        if (lbl && lbl.textContent && lbl.textContent.trim()) return lbl.textContent.trim();
      } catch (error) {
        /* ignore */
      }
    }

    var wrapping = el.closest("label");
    if (wrapping && wrapping !== el) {
      var clone = wrapping.cloneNode(true);
      clone.querySelectorAll("input,select,textarea").forEach(function (child) { child.remove(); });
      var text = clone.textContent ? clone.textContent.trim() : "";
      if (text) return text;
    }

    if (el.tagName === "BUTTON" || el.getAttribute("role") === "button") {
      var txt = (el.innerText && el.innerText.trim()) || (el.getAttribute("title") || "").trim() || "";
      if (txt) return txt;
    }

    return (el.getAttribute("placeholder") || "").trim()
      || (el.getAttribute("title") || "").trim()
      || (el.getAttribute("name") || "").trim()
      || "";
  }

  function isVisible(el) {
    var rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;
    if (rect.bottom < 0 || rect.top > window.innerHeight) return false;
    if (rect.right < 0 || rect.left > window.innerWidth) return false;
    try {
      var style = window.getComputedStyle(el);
      if (style.visibility === "hidden" || style.display === "none" || style.opacity === "0") return false;
    } catch (error) {
      return false;
    }
    return true;
  }

  function getTestId(el) {
    return el.getAttribute("data-testid")
      || el.getAttribute("data-test")
      || el.getAttribute("data-cy")
      || el.getAttribute("data-qa")
      || null;
  }

  function computeCssPath(el) {
    var id = el.getAttribute("id");
    if (id && /^[A-Za-z][\\w-]*$/.test(id)) return "#" + id;

    var testId = getTestId(el);
    if (testId) return '[data-testid="' + testId + '"]';

    var parts = [];
    var cur = el;
    var depth = 0;
    while (cur && cur !== document.body && depth < 6) {
      var tag = cur.tagName.toLowerCase();
      var cid = cur.getAttribute("id");
      if (cid && /^[A-Za-z][\\w-]*$/.test(cid)) {
        parts.unshift("#" + cid);
        break;
      }
      var ctid = getTestId(cur);
      if (ctid) {
        parts.unshift('[data-testid="' + ctid + '"]');
        break;
      }
      var parent = cur.parentElement;
      if (parent) {
        var siblings = Array.prototype.filter.call(parent.children, function (sibling) {
          return sibling.tagName === cur.tagName;
        });
        if (siblings.length > 1) parts.unshift(tag + ":nth-of-type(" + (siblings.indexOf(cur) + 1) + ")");
        else parts.unshift(tag);
      } else {
        parts.unshift(tag);
      }
      cur = parent;
      depth += 1;
    }
    return parts.join(" > ");
  }

  var seen = new Set();
  var results = [];
  var selectors = [
    'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="image"])',
    "textarea",
    "select",
    '[role="combobox"]:not(input)',
    '[role="radio"]:not(input)',
    '[role="checkbox"]:not(input)',
    '[aria-haspopup="listbox"]:not(select):not(input)',
    '[aria-haspopup="menu"]:not(select):not(input)'
  ];
  var allEls = new Set();
  selectors.forEach(function (sel) {
    try {
      document.querySelectorAll(sel).forEach(function (el) { allEls.add(el); });
    } catch (error) {
      /* ignore */
    }
  });

  allEls.forEach(function (el) {
    if (seen.has(el) || !isVisible(el)) return;
    seen.add(el);
    var tag = el.tagName.toLowerCase();
    var rect = el.getBoundingClientRect();
    var nativeOptions = tag === "select"
      ? Array.prototype.map.call(el.options, function (option) { return option.text.trim(); }).filter(Boolean)
      : [];
    results.push({
      label: getAccessibleName(el),
      rawTag: tag,
      rawType: el.getAttribute("type"),
      rawRole: el.getAttribute("role"),
      ariaHaspopup: el.getAttribute("aria-haspopup"),
      testId: getTestId(el),
      ariaLabel: el.getAttribute("aria-label"),
      labelText: null,
      placeholder: el.getAttribute("placeholder"),
      domId: el.getAttribute("id"),
      cssPath: computeCssPath(el),
      nativeOptions: nativeOptions,
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
    });
  });
  return results;
})()`;
