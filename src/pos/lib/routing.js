// ─── POS Base Path ──────────────────────────────────────────────────────────
// All POS routes live under /pos. This constant is prepended by buildUrl()
// and stripped by parseUrl() so the rest of the app is unaware of the prefix.
const POS_BASE = "/pos";

// ─── URL Routing ────────────────────────────────────────────────────────────
const PAGE_SLUGS = {
  dashboard:"dashboard", reservations:"lodging", clients:"lifecycle", "client-detail":"client", "dog-detail":"dog",
  "new-client":"new-client", "new-dog":"new-dog", "new-reservation":"new-reservation", "unified-new":"new",
  messages:"messages", payments:"payments", operations:"operations",
  "ops-opening":"ops/opening", "ops-fe":"ops/front-end", "ops-be":"ops/back-end", "ops-rooms":"ops/rooms",
  "ops-pictures":"ops/pictures", "ops-pp":"ops/private-play", "ops-closing":"ops/closing",
  management:"management", "mgmt-attendance":"management/attendance", "mgmt-audit-log":"management/audit-log",
  eod:"eod", ai:"ai", settings:"settings", "evaluation-form":"evaluation", "online-bookings":"bookings",
  "settings-team":"settings/team-management", "settings-roles":"settings/roles",
  "settings-fields":"settings/fields", "settings-tags":"settings/tags", "settings-vaccines":"settings/vaccines",
  "settings-agreements":"settings/agreements", "settings-questionnaire":"settings/questionnaire",
  "settings-pricing":"settings/pricing", "settings-packages":"settings/packages", "settings-discounts":"settings/discounts", "settings-dropdowns":"settings/dropdowns",
  "settings-eod":"settings/eod", "settings-daily-ops":"settings/daily-ops", "settings-run-card":"settings/run-card",
  "settings-resort-info":"settings/resort-info", "settings-facility":"settings/facility", "settings-rooms":"settings/rooms",
  "settings-closed-dates":"settings/closed-dates", "settings-policies":"settings/policies", "settings-compliance-rules":"settings/compliance-rules",
  "settings-booking-settings":"settings/booking-settings", "settings-vets":"settings/vets",
  "settings-legal":"settings/legal", "settings-hotkeys":"settings/hotkeys", "settings-reset":"settings/reset",
  "enterprise-locations":"locations", "enterprise-operations":"oversight", "enterprise-packages":"packages", "enterprise-users":"users", "enterprise-management":"management",
};
const SLUG_TO_PAGE = {};
Object.entries(PAGE_SLUGS).forEach(([k,v]) => { if (!k.startsWith("enterprise-")) SLUG_TO_PAGE[v] = k; });
const ENT_SLUG_TO_PAGE = { locations:"enterprise-locations", oversight:"enterprise-operations", packages:"enterprise-packages", users:"enterprise-users", management:"enterprise-management" };

function buildUrl(locSlug, pg, prms, dataRef) {
  const slug = PAGE_SLUGS[pg] || pg;
  if (locSlug === "enterprise") return `${POS_BASE}/enterprise/${slug}`;
  if (pg === "client-detail" && prms?.clientId && dataRef) {
    const c = (dataRef.clients||[]).find(cl => cl.id === prms.clientId);
    const phone = c?.fields?.phone?.replace(/\D/g,"");
    if (phone) return `${POS_BASE}/${locSlug}/client/${phone}`;
  }
  if (pg === "dog-detail" && prms?.clientId && prms?.dogId && dataRef) {
    const c = (dataRef.clients||[]).find(cl => cl.id === prms.clientId);
    const d = (dataRef.dogs||[]).find(dg => dg.id === prms.dogId);
    const phone = c?.fields?.phone?.replace(/\D/g,"");
    if (phone && d) return `${POS_BASE}/${locSlug}/client/${phone}/${encodeURIComponent((d.fields?.name||"dog").toLowerCase())}`;
  }
  return `${POS_BASE}/${locSlug}/${slug}`;
}

function parseUrl(pathname, dataRef) {
  // Strip the POS base prefix before parsing
  let cleanPath = pathname;
  if (cleanPath.startsWith(POS_BASE)) cleanPath = cleanPath.slice(POS_BASE.length) || "/";
  const parts = cleanPath.replace(/^\/+|\/+$/g,"").split("/").filter(Boolean);
  if (parts.length === 0) return { locSlug: "demo", page: "dashboard", params: {} };
  const locSlug = parts[0];
  if (locSlug === "enterprise") {
    const epSlug = parts.slice(1).join("/") || "locations";
    const pg = ENT_SLUG_TO_PAGE[epSlug] || "enterprise-locations";
    return { locSlug: "enterprise", page: pg, params: {} };
  }
  if (parts.length === 1) return { locSlug, page: "dashboard", params: {} };
  // Client detail: /demo/client/5551234567
  if (parts[1] === "client" && parts[2]) {
    const phone = parts[2];
    if (parts[3] && dataRef) {
      // Dog detail: /demo/client/5551234567/duke
      const c = (dataRef.clients||[]).find(cl => (cl.fields?.phone||"").replace(/\D/g,"") === phone);
      if (c) {
        const dogName = decodeURIComponent(parts[3]).toLowerCase();
        const dogs = (dataRef.dogs||[]).filter(d => d.fields?.owner_id === c.id || (dataRef.reservations||[]).some(r => r.clientId === c.id && r.dogId === d.id));
        const dog = dogs.find(d => (d.fields?.name||"").toLowerCase() === dogName) || dogs[0];
        if (dog) return { locSlug, page: "dog-detail", params: { clientId: c.id, dogId: dog.id } };
      }
    }
    if (dataRef) {
      const c = (dataRef.clients||[]).find(cl => (cl.fields?.phone||"").replace(/\D/g,"") === phone);
      if (c) return { locSlug, page: "client-detail", params: { clientId: c.id } };
    }
    return { locSlug, page: "clients", params: {} };
  }
  const pgSlug = parts.slice(1).join("/");
  const pg = SLUG_TO_PAGE[pgSlug] || "dashboard";
  return { locSlug, page: pg, params: {} };
}

export { POS_BASE, PAGE_SLUGS, SLUG_TO_PAGE, ENT_SLUG_TO_PAGE, buildUrl, parseUrl };
