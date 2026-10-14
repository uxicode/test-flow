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

  function getNearbyText(el) {
    var maxLen = 40;
    // 필터 라벨이 트리거를 감싼 래퍼 바깥에 있는 경우가 많아 조상 몇 단계까지 올라가 본다.
    var cur = el;
    for (var depth = 0; depth < 3 && cur && cur !== document.body; depth += 1) {
      var prev = cur.previousElementSibling;
      if (prev && ["input", "select", "textarea", "button"].indexOf(prev.tagName.toLowerCase()) < 0) {
        var prevText = prev.textContent ? prev.textContent.trim() : "";
        if (prevText.length >= 1 && prevText.length <= maxLen) return prevText;
      }
      var parent = cur.parentElement;
      if (parent && parent !== document.body) {
        var clone = parent.cloneNode(true);
        clone.querySelectorAll("input,select,textarea,button").forEach(function (child) { child.remove(); });
        var parentText = clone.textContent ? clone.textContent.trim() : "";
        if (parentText.length >= 1 && parentText.length <= maxLen) return parentText;
      }
      cur = parent;
    }
    return null;
  }

  var DATE_TEXT = /\\d{4}[.\\-\\/]\\d{1,2}[.\\-\\/]\\d{1,2}/;

  function buttonText(el) {
    return (el.innerText || el.textContent || "").replace(/\\s+/g, " ").trim();
  }

  var ACTION_TEXT = /^(조회|검색|초기화|리셋|등록|저장|삭제|취소|확인|닫기|적용|추가|수정|편집|다운로드|엑셀|내보내기|업로드|로그아웃|이전|다음|처음|마지막|search|reset|submit|save|delete|cancel|close|apply|add|edit|prev|next)/i;

  /** 팝업(드롭다운·달력)을 여는 버튼인지. 조회·초기화 같은 일반 버튼은 제외한다. */
  function isPopupTrigger(el) {
    if (el.closest("nav, aside, header")) return false;
    var popup = el.getAttribute("aria-haspopup");
    if (popup && popup !== "false") return true;
    if (el.hasAttribute("aria-expanded")) return true;
    var text = buttonText(el);
    if (DATE_TEXT.test(text)) return true;
    return isLabeledFieldButton(el, text);
  }

  /**
   * ARIA 표시가 없는 디자인 드롭다운: 라벨(성별 등) 옆에 놓인, 값을 보여 주는 버튼.
   * 러너도 "라벨 그룹 안의 버튼"으로 같은 트리거를 찾는다.
   */
  function isLabeledFieldButton(el, text) {
    var type = (el.getAttribute("type") || "").toLowerCase();
    if (type === "submit" || type === "reset") return false;
    if (!text || text.length > 30 || /^\\d+$/.test(text) || ACTION_TEXT.test(text)) return false;
    if (el.closest('table, [role="grid"], [role="row"], [role="tablist"], [role="dialog"], [aria-label*="pagination" i], .pagination')) return false;
    var nearby = getNearbyText(el);
    return Boolean(nearby && nearby !== text);
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
    '[aria-haspopup="menu"]:not(select):not(input)',
    'button',
    '[role="button"]'
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
    var tag = el.tagName.toLowerCase();
    var isButton = tag === "button" || el.getAttribute("role") === "button";
    if (isButton && !isPopupTrigger(el)) return;
    seen.add(el);
    var text = isButton ? buttonText(el) : "";
    var rect = el.getBoundingClientRect();
    var nativeOptions = tag === "select"
      ? Array.prototype.map.call(el.options, function (option) { return option.text.trim(); }).filter(Boolean)
      : [];
    var ariaLabel = el.getAttribute("aria-label");
    var domId = el.getAttribute("id");
    var hasForwardLabel = Boolean(
      ariaLabel
      || (domId && document.querySelector('label[for="' + domId + '"]'))
      || el.getAttribute("aria-labelledby"),
    );
    // 버튼 글자는 현재 값(전체, 2026.10.01 ~ …)이라 라벨로 쓰지 않고 근처 텍스트를 먼저 쓴다.
    var nearbyText = hasForwardLabel ? null : getNearbyText(el);
    var label = isButton && !hasForwardLabel && nearbyText ? nearbyText : getAccessibleName(el);
    results.push({
      label: label,
      rawTag: tag,
      rawType: el.getAttribute("type"),
      rawRole: el.getAttribute("role"),
      ariaHaspopup: el.getAttribute("aria-haspopup"),
      testId: getTestId(el),
      ariaLabel: ariaLabel,
      labelText: null,
      placeholder: el.getAttribute("placeholder"),
      domId: domId,
      cssPath: computeCssPath(el),
      nativeOptions: nativeOptions,
      nearbyText: nearbyText,
      popupTrigger: isButton,
      dateText: isButton ? DATE_TEXT.test(text) : false,
      dateRangeText: isButton && DATE_TEXT.test(text)
        ? (text.match(new RegExp(DATE_TEXT.source, "g")) || []).length >= 2 || /~/.test(text)
        : false,
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
    });
  });
  return results;
})()`;
