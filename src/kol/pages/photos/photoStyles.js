// K9 Operations — PhotosPage CSS keyframes
// Injects the photo grid/viewer animation styles into <head> exactly once.
// Side-effect-on-import module: importing it performs the (idempotent) injection,
// preserving the original module-load behavior of PhotosPage.jsx.

// ─── CSS Keyframes (injected once) ──────────────────────────────────────────
const STYLE_ID = "k9-photos-magic-styles";
if (typeof document !== "undefined" && !document.getElementById(STYLE_ID)) {
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    @keyframes k9PhotoCheckPop {
      0% { transform: scale(0); opacity: 0; }
      50% { transform: scale(1.3); }
      100% { transform: scale(1); opacity: 1; }
    }
    @keyframes k9PhotoShimmer {
      0% { background-position: -200% 0; }
      100% { background-position: 200% 0; }
    }
    @keyframes k9PhotoFadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    @keyframes k9PhotoSlideUp {
      from { transform: translateY(100%); }
      to { transform: translateY(0); }
    }
    @keyframes k9PhotoSlideDown {
      from { transform: translateY(0); }
      to { transform: translateY(100%); }
    }
    .k9-photo-grid-img {
      background-color: #f3f4f6;
      will-change: transform;
    }
    .k9-fullscreen-viewer {
      position: fixed; inset: 0; z-index: 9999;
      background: rgba(0,0,0,0.95);
      display: flex; flex-direction: column;
      touch-action: pan-y;
    }
    .k9-photo-transition {
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }
    .k9-bottom-sheet {
      animation: k9PhotoSlideUp 0.3s cubic-bezier(0.4, 0, 0.2, 1) forwards;
    }
    .k9-browse-panel {
      animation: k9PhotoSlideUp 0.35s cubic-bezier(0.4, 0, 0.2, 1) forwards;
    }
  `;
  document.head.appendChild(style);
}
