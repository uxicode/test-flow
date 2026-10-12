/**
 * 브라우저 안에서 실행되는 셀렉터 선택 UI 스크립트.
 *
 * 문자열로 보관하는 이유: 함수로 넘기면 tsx/esbuild가 중첩 함수에 `__name` 헬퍼를 끼워 넣어
 * 브라우저에서 `ReferenceError: __name is not defined`가 발생한다.
 * `page.addInitScript`로 주입하므로 로그인 후 페이지 이동에도 유지된다.
 */
export const EMIT_BINDING_NAME = "__testflow_emit_selector";

export const INSPECT_BROWSER_SCRIPT = `
(() => {
  if (window.top !== window) return;
  if (window.__testflowInspectInstalled) return;
  window.__testflowInspectInstalled = true;

  var BANNER_ID = "__testflow_inspect_banner";
  var HIGHLIGHT_ID = "__testflow_inspect_highlight";
  var pendingSelector = "";
  var banner = null;
  var highlight = null;
  var preview = null;
  var applyBar = null;

  function compute(el) {
    if (el.id && /^[A-Za-z][A-Za-z0-9_-]*$/.test(el.id)) return "#" + el.id;
    var attrs = Array.prototype.slice.call(el.attributes);
    for (var i = 0; i < attrs.length; i += 1) {
      if (attrs[i].name.indexOf("data-") === 0) {
        return attrs[i].value ? "[" + attrs[i].name + '="' + attrs[i].value + '"]' : "[" + attrs[i].name + "]";
      }
    }
    var role = el.getAttribute("role");
    if (role) return '[role="' + role + '"]';
    var ariaLabel = el.getAttribute("aria-label");
    if (ariaLabel) return '[aria-label="' + ariaLabel + '"]';
    if (el.className && typeof el.className === "string") {
      var classes = el.className.trim().split(/\\s+/).filter(function (c) {
        return c && c.indexOf(":") < 0 && c.indexOf("/") < 0;
      });
      var semantic = classes.filter(function (c) {
        return /menu|dropdown|popover|select|list|dialog|modal|panel|container|content|box/i.test(c);
      });
      if (semantic.length > 0) return semantic.map(function (c) { return "." + c; }).join("");
      if (classes.length > 0 && classes.length <= 3) return classes.map(function (c) { return "." + c; }).join("");
    }
    var tag = el.tagName.toLowerCase();
    if (el.classList.length > 0) {
      var first = el.classList[0];
      if (first && first.indexOf(":") < 0 && first.indexOf("/") < 0) return tag + "." + first;
    }
    return tag;
  }

  function isInsideBanner(node) {
    return Boolean(node && node.closest && node.closest("#" + BANNER_ID));
  }

  function loginFormVisible() {
    var field = document.querySelector('input[type="password"]');
    if (!field) return false;
    var rect = field.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function styled(el, css) {
    el.style.cssText = css;
    return el;
  }

  function emit(value) {
    var fn = window.${EMIT_BINDING_NAME};
    if (typeof fn === "function") fn(value);
  }

  function showPending(selector) {
    pendingSelector = selector;
    preview.textContent = selector;
    applyBar.style.display = "flex";
    highlight.style.display = "none";
  }

  function clearPending() {
    pendingSelector = "";
    preview.textContent = "";
    applyBar.style.display = "none";
  }

  function mount() {
    if (document.getElementById(BANNER_ID)) return;

    banner = styled(document.createElement("div"),
      "position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:2147483647;" +
      "background:rgba(15,23,42,.96);color:#f8fafc;padding:10px 16px;border-radius:12px;" +
      "border:1px solid rgba(139,92,246,.6);box-shadow:0 10px 30px rgba(0,0,0,.6);" +
      "font:13px -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;" +
      "display:flex;flex-direction:column;gap:8px;max-width:min(92vw,560px);user-select:none;");
    banner.id = BANNER_ID;

    var head = styled(document.createElement("div"), "display:flex;align-items:center;gap:12px;");
    var hint = document.createElement("div");
    hint.innerHTML =
      '<b style="color:#a78bfa">셀렉터 추출기</b> 요소를 <b style="color:#38bdf8">클릭</b>해 고른 뒤 ' +
      '<b style="color:#34d399">적용하기</b>를 누르세요. ' +
      '<span style="opacity:.7;font-size:12px">(드롭다운을 열려면 Shift+클릭)</span>';
    var cancelBtn = styled(document.createElement("button"),
      "background:rgba(239,68,68,.2);border:1px solid rgba(239,68,68,.5);color:#fca5a5;" +
      "padding:4px 10px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600;white-space:nowrap;");
    cancelBtn.textContent = "취소";
    cancelBtn.type = "button";
    cancelBtn.onclick = function () { emit(""); };
    head.appendChild(hint);
    head.appendChild(cancelBtn);

    applyBar = styled(document.createElement("div"),
      "display:none;flex-direction:column;gap:8px;padding-top:8px;border-top:1px solid rgba(148,163,184,.35);");
    preview = styled(document.createElement("code"),
      "display:block;font-size:11px;color:#e2e8f0;background:rgba(2,6,23,.8);" +
      "padding:6px 8px;border-radius:6px;word-break:break-all;");
    var actions = styled(document.createElement("div"), "display:flex;gap:8px;");
    var applyBtn = styled(document.createElement("button"),
      "background:rgba(34,197,94,.25);border:1px solid rgba(34,197,94,.6);color:#86efac;" +
      "padding:6px 14px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:700;");
    applyBtn.textContent = "적용하기";
    applyBtn.type = "button";
    applyBtn.onclick = function () { if (pendingSelector) emit(pendingSelector); };
    var reselectBtn = styled(document.createElement("button"),
      "background:rgba(148,163,184,.15);border:1px solid rgba(148,163,184,.4);color:#cbd5e1;" +
      "padding:6px 10px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600;");
    reselectBtn.textContent = "다시 선택";
    reselectBtn.type = "button";
    reselectBtn.onclick = clearPending;
    actions.appendChild(applyBtn);
    actions.appendChild(reselectBtn);
    applyBar.appendChild(preview);
    applyBar.appendChild(actions);

    banner.appendChild(head);
    banner.appendChild(applyBar);
    document.body.appendChild(banner);

    highlight = styled(document.createElement("div"),
      "position:fixed;pointer-events:none;z-index:2147483646;border:2px solid #8b5cf6;" +
      "background:rgba(139,92,246,.15);border-radius:4px;display:none;");
    highlight.id = HIGHLIGHT_ID;
    document.body.appendChild(highlight);

    if (pendingSelector) showPending(pendingSelector);
  }

  window.addEventListener("mousemove", function (event) {
    if (!highlight || pendingSelector || loginFormVisible()) return;
    var target = document.elementFromPoint(event.clientX, event.clientY);
    if (!target || isInsideBanner(target) || target.id === HIGHLIGHT_ID) {
      highlight.style.display = "none";
      return;
    }
    var rect = target.getBoundingClientRect();
    highlight.style.display = "block";
    highlight.style.left = rect.left + "px";
    highlight.style.top = rect.top + "px";
    highlight.style.width = rect.width + "px";
    highlight.style.height = rect.height + "px";
  }, true);

  // 클릭은 "선택"만 한다. 실제 확정은 [적용하기] 버튼에서만 일어난다.
  window.addEventListener("click", function (event) {
    if (event.shiftKey || !banner) return;
    var target = event.target;
    if (!target || isInsideBanner(target) || loginFormVisible()) return;
    event.preventDefault();
    event.stopPropagation();
    showPending(compute(target));
  }, true);

  if (document.body) mount();
  else document.addEventListener("DOMContentLoaded", mount);
})();
`;
