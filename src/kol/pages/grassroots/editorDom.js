export function createGrassrootsClientUuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function scrollGrassrootsEditorIntoView(element) {
  if (!element || typeof window === "undefined") return;
  const findScrollParent = (node) => {
    let current = node?.parentElement || null;
    while (current && current !== document.body) {
      const style = window.getComputedStyle(current);
      if (/(auto|scroll)/.test(style.overflowY) && current.scrollHeight > current.clientHeight + 8) {
        return current;
      }
      current = current.parentElement;
    }
    return null;
  };
  const isCompact = typeof window.matchMedia === "function" && window.matchMedia("(max-width: 760px)").matches;
  const headerOffset = isCompact ? 76 : 92;
  const scrollParent = findScrollParent(element);
  const viewportHeight = scrollParent?.clientHeight || window.innerHeight || document.documentElement.clientHeight || 0;
  const rect = element.getBoundingClientRect();
  const availableHeight = Math.max(320, viewportHeight - headerOffset - 24);
  const topOffset = rect.height <= availableHeight
    ? Math.max(headerOffset, Math.floor((viewportHeight - rect.height) / 2))
    : headerOffset;
  if (scrollParent) {
    const parentRect = scrollParent.getBoundingClientRect();
    const top = Math.max(0, scrollParent.scrollTop + rect.top - parentRect.top - topOffset);
    scrollParent.scrollTo({ top, behavior: "smooth" });
    return;
  }
  const top = Math.max(0, window.scrollY + rect.top - topOffset);
  window.scrollTo({ top, behavior: "smooth" });
}
