export function eventLinkRowsForEditor(draft = {}) {
  const rawLinks = Array.isArray(draft.details?.links) ? draft.details.links : [];
  if (rawLinks.length === 0) {
    return [{ id: "event_link_blank", url: "" }];
  }
  return rawLinks.map((row, index) => ({
    id: row?.id || `event_link_${index + 1}`,
    url: row?.url || row?.href || "",
  }));
}

export function getSafeEventLinkHref(url) {
  const raw = String(url || "").trim();
  if (!raw) return "";
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  try {
    const parsed = new URL(candidate);
    return ["http:", "https:", "mailto:", "tel:"].includes(parsed.protocol) ? parsed.href : "";
  } catch {
    return "";
  }
}
