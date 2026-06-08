export function actorName(profile) {
  return profile?.full_name || profile?.name || profile?.email || "K9 Operations";
}

export function blankVendor(locationId) {
  return {
    location_id: locationId,
    business_name: "",
    business_address: "",
    website: "",
    has_contract: false,
    contract_effective_start: "",
    contract_effective_end: "",
    contact_info: [],
    notes: "",
    is_archived: false,
  };
}

export function blankLicense(locationId) {
  return {
    location_id: locationId,
    requirement_name: "",
    issuing_organization: "",
    status: "non_compliant",
    expiration_date: "",
    next_expected_date: "",
    cadence_months: "",
    contact_info: [],
    website_links: [],
    notes: "",
    is_active: true,
  };
}

export function primaryContact(contacts = []) {
  const contact = Array.isArray(contacts) ? contacts[0] || {} : {};
  return {
    name: String(contact.name || contact.contact_name || ""),
    role: String(contact.role || contact.title || ""),
    phone: String(contact.phone || contact.phone_number || ""),
    email: String(contact.email || ""),
    notes: String(contact.notes || contact.note || ""),
  };
}

export function primaryLink(links = []) {
  const link = Array.isArray(links) ? links[0] || {} : {};
  return {
    label: String(link.label || link.title || ""),
    url: String(link.url || link.href || link.website || ""),
  };
}

export function mergePrimaryContact(existing = [], contact) {
  const cleaned = {
    name: contact.name.trim(),
    role: contact.role.trim(),
    phone: contact.phone.trim(),
    email: contact.email.trim(),
    notes: contact.notes.trim(),
  };
  const rest = Array.isArray(existing) ? existing.slice(1) : [];
  return Object.values(cleaned).some(Boolean) ? [cleaned, ...rest] : rest;
}

export function mergePrimaryLink(existing = [], link) {
  const cleaned = {
    label: link.label.trim() || "Requirement link",
    url: link.url.trim(),
  };
  const rest = Array.isArray(existing) ? existing.slice(1) : [];
  return cleaned.url ? [cleaned, ...rest] : rest;
}

export function friendlyErrorMessage(error, fallback = "This Resort Upkeep section could not be loaded.") {
  const message = error?.message || String(error || "");
  if (/failed to fetch/i.test(message)) return `${fallback} Network access failed. Retry when the connection settles.`;
  return message || fallback;
}

export function withUpkeepTimeout(promise, message = "This Resort Upkeep request took too long to load.", ms = 12000) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
}

export function plural(value, single, many = `${single}s`) {
  return `${value} ${value === 1 ? single : many}`;
}

function fmtDueCompact(value) {
  if (!value) return "—";
  try {
    return new Date(`${String(value).slice(0, 10)}T12:00:00`).toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "2-digit" });
  } catch {
    return String(value);
  }
}

export function formatDueRange(item) {
  if (item.dueStart && item.dueEnd && item.dueStart !== item.dueEnd) {
    return `${fmtDueCompact(item.dueStart)} – ${fmtDueCompact(item.dueEnd)}`;
  }
  return fmtDueCompact(item.dueDate || item.dueEnd || item.dueStart);
}
