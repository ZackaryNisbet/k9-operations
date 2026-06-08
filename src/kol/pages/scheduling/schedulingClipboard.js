// K9 Operations — Scheduling clipboard helpers
// Pure clipboard helpers extracted verbatim from SchedulingPage.jsx.

function copyWithClipboardEvent({ text, html }) {
  if (typeof document === "undefined" || typeof window === "undefined") return false;

  let eventHandled = false;
  const handleCopy = (event) => {
    if (!event.clipboardData) return;
    event.clipboardData.setData("text/plain", text);
    if (html) {
      event.clipboardData.setData("text/html", html);
    }
    event.preventDefault();
    eventHandled = true;
  };

  const selection = window.getSelection?.();
  const previousRanges = [];
  if (selection) {
    for (let index = 0; index < selection.rangeCount; index += 1) {
      previousRanges.push(selection.getRangeAt(index).cloneRange());
    }
  }

  const marker = document.createElement("span");
  marker.textContent = "copy";
  marker.style.position = "fixed";
  marker.style.left = "-9999px";
  marker.style.top = "0";
  document.body.appendChild(marker);
  document.addEventListener("copy", handleCopy);

  try {
    if (selection) {
      const range = document.createRange();
      range.selectNodeContents(marker);
      selection.removeAllRanges();
      selection.addRange(range);
    }
    return document.execCommand("copy") && eventHandled;
  } finally {
    document.removeEventListener("copy", handleCopy);
    document.body.removeChild(marker);
    if (selection) {
      selection.removeAllRanges();
      previousRanges.forEach((range) => selection.addRange(range));
    }
  }
}

function copyWithTextarea(text) {
  if (typeof document === "undefined") return false;

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  const copied = document.execCommand("copy");
  document.body.removeChild(textarea);
  return copied;
}

export async function copySchedulingNarrativeToClipboard({ text, html }) {
  let lastError = null;

  if (
    typeof navigator !== "undefined"
    && navigator.clipboard?.write
    && typeof ClipboardItem !== "undefined"
    && typeof Blob !== "undefined"
    && html
  ) {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([text], { type: "text/plain" }),
        }),
      ]);
      return;
    } catch (err) {
      lastError = err;
    }
  }

  if (copyWithClipboardEvent({ text, html })) {
    return;
  }

  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch (err) {
      lastError = err;
    }
  }

  if (copyWithTextarea(text)) {
    return;
  }

  throw lastError || new Error("Clipboard copy failed");
}
