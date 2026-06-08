// Scroll position/anchor helpers extracted from InventoryPage.jsx.

export function getWindowScrollPosition() {
  if (typeof window === "undefined") return null;
  return {
    x: window.scrollX || window.pageXOffset || 0,
    y: window.scrollY || window.pageYOffset || 0,
  };
}

export function restoreWindowScrollPosition(position) {
  if (!position || typeof window === "undefined" || typeof window.scrollTo !== "function") return;
  const restore = () => window.scrollTo(position.x, position.y);
  if (typeof window.requestAnimationFrame === "function") {
    window.requestAnimationFrame(() => {
      restore();
      window.requestAnimationFrame(restore);
    });
    return;
  }
  setTimeout(restore, 0);
}

export function getInventoryScrollAnchor() {
  if (typeof document === "undefined" || typeof window === "undefined") return null;
  const rows = Array.from(document.querySelectorAll("[data-inventory-row-id]"));
  const viewportHeight = window.innerHeight || 0;
  const target = rows
    .map((element) => ({ element, rect: element.getBoundingClientRect() }))
    .find(({ rect }) => rect.bottom > 88 && rect.top < viewportHeight - 40);
  if (!target) return null;
  return {
    rowId: target.element.getAttribute("data-inventory-row-id"),
    top: target.rect.top,
  };
}

export function restoreInventoryScrollAnchor(anchor, fallbackPosition) {
  if (!anchor || typeof document === "undefined" || typeof window === "undefined") {
    restoreWindowScrollPosition(fallbackPosition);
    return;
  }
  const restore = () => {
    const element = document.querySelector(`[data-inventory-row-id="${anchor.rowId}"]`);
    if (!element) {
      restoreWindowScrollPosition(fallbackPosition);
      return;
    }
    const delta = element.getBoundingClientRect().top - anchor.top;
    if (Math.abs(delta) > 1) {
      window.scrollBy(0, delta);
    }
  };
  if (typeof window.requestAnimationFrame === "function") {
    window.requestAnimationFrame(() => {
      restore();
      window.requestAnimationFrame(restore);
    });
    return;
  }
  setTimeout(restore, 0);
}
