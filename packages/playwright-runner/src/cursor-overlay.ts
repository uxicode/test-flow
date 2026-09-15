export const CURSOR_OVERLAY_SCRIPT = `
(() => {
  if (window.__testflowCursorReady) return;
  window.__testflowCursorReady = true;
  const el = document.createElement("div");
  el.id = "testflow-virtual-cursor";
  el.style.position = "fixed";
  el.style.width = "18px";
  el.style.height = "18px";
  el.style.borderRadius = "50%";
  el.style.border = "2px solid #38bdf8";
  el.style.background = "rgba(56,189,248,0.35)";
  el.style.zIndex = "2147483647";
  el.style.pointerEvents = "none";
  el.style.transform = "translate(-50%, -50%)";
  el.style.left = "8px";
  el.style.top = "8px";
  el.style.transition = "left 160ms linear, top 160ms linear";
  document.documentElement.appendChild(el);
  window.__testflowMoveCursor = (x, y) => {
    el.style.left = x + "px";
    el.style.top = y + "px";
  };
})();
`;
