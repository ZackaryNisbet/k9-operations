export function getProductHref(product) {
  const url = String(product?.url || "").trim();
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  if (/^(www\.)?[\w.-]+\.[a-z]{2,}([/?#].*)?$/i.test(url)) return `https://${url}`;
  return "";
}

export function getLinkHost(href) {
  try {
    return new URL(href).hostname.replace(/^www\./, "");
  } catch {
    return "External link";
  }
}

export function getLinkedProducts(events = []) {
  const seen = new Set();
  return events.flatMap((event) => (event.products || []).map((product) => ({ ...product, eventTitle: event.title })))
    .filter((product) => {
      const href = getProductHref(product);
      const key = `${href}|${String(product.name || "").toLowerCase()}`;
      if (!href || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}
