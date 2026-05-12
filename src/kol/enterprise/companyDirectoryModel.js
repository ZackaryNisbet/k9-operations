export const DIRECTORY_PHOTO_BUCKET = "enterprise-directory-photos";

export function asArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

export function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

export function initials(name = "") {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "K9";
}

export function personSortName(person) {
  return String(person?.display_name || "").localeCompare(String(person?.title || ""));
}

export function formatDirectoryStatus(status) {
  if (status === "inactive") return "Inactive";
  if (status === "needs_data") return "Needs data";
  return "Active";
}

export function isVacantRole(person) {
  return normalizeText(person?.person_type) === "vacant_role";
}

export function getPersonLocations(person) {
  return asArray(person?.locations);
}

export function getDisplayLocations(person) {
  const locations = getPersonLocations(person);
  const manualLocations = locations.filter((location) => location.responsibility_type === "directory_location");
  return manualLocations.length ? manualLocations : locations;
}

export function formatLocations(person) {
  const locations = getDisplayLocations(person);
  if (!locations.length) return "Corporate";
  return locations.map((location) => location.display_name).filter(Boolean).join(", ") || "Corporate";
}

export function formatLocationAddress(location) {
  return [
    location?.address_line1,
    location?.address_line2,
    [location?.city, location?.state_code, location?.postal_code].filter(Boolean).join(", "),
  ]
    .filter(Boolean)
    .join(" ");
}

export function getPrimaryManager(person) {
  const managers = asArray(person?.managers);
  return managers.find((manager) => manager.is_primary) || managers[0] || null;
}

export function getPrimaryManagerId(person) {
  return getPrimaryManager(person)?.id || "";
}

export function formatManagers(person) {
  const managers = asArray(person?.managers);
  if (!managers.length) return "No manager";
  return managers.map((manager) => manager.display_name).filter(Boolean).join(", ");
}

export function buildEdgesByParent(edges = []) {
  const map = new Map();
  asArray(edges).forEach((edge) => {
    if (!edge?.parent_person_id || !edge?.child_person_id || edge.relationship_type !== "reports_to") return;
    const rows = map.get(edge.parent_person_id) || [];
    rows.push(edge);
    map.set(edge.parent_person_id, rows);
  });
  return map;
}

export function buildEdgesByChild(edges = []) {
  const map = new Map();
  asArray(edges).forEach((edge) => {
    if (!edge?.parent_person_id || !edge?.child_person_id || edge.relationship_type !== "reports_to") return;
    const rows = map.get(edge.child_person_id) || [];
    rows.push(edge);
    map.set(edge.child_person_id, rows);
  });
  return map;
}

export function buildDirectReportsByManager(people = [], edges = []) {
  const peopleById = new Map(asArray(people).map((person) => [person.id, person]));
  const directReports = new Map();

  asArray(edges)
    .filter((edge) => edge.relationship_type === "reports_to" && edge.is_primary !== false)
    .forEach((edge) => {
      const child = peopleById.get(edge.child_person_id);
      if (!child) return;
      const rows = directReports.get(edge.parent_person_id) || [];
      rows.push(child);
      directReports.set(edge.parent_person_id, rows);
    });

  directReports.forEach((rows) => {
    rows.sort((a, b) => String(a.display_name || "").localeCompare(String(b.display_name || "")));
  });

  return directReports;
}

export function wouldCreateCycle({ childId, managerId, edges = [] }) {
  if (!childId || !managerId) return false;
  if (childId === managerId) return true;

  const edgesByParent = buildEdgesByParent(edges);
  const stack = [childId];
  const visited = new Set();

  while (stack.length) {
    const current = stack.pop();
    if (!current || visited.has(current)) continue;
    visited.add(current);

    const children = edgesByParent.get(current) || [];
    for (const edge of children) {
      if (edge.child_person_id === managerId) return true;
      stack.push(edge.child_person_id);
    }
  }

  return false;
}

export function getManagerValidation({ people = [], edges = [], childId, managerId }) {
  if (!managerId) return { valid: true, reason: "" };
  if (childId && childId === managerId) {
    return { valid: false, reason: "A person cannot report to themselves." };
  }
  const manager = asArray(people).find((person) => person.id === managerId);
  if (!manager) return { valid: false, reason: "Manager was not found." };
  if (manager.directory_status === "inactive") {
    return { valid: false, reason: "Inactive people cannot be selected as managers." };
  }
  if (wouldCreateCycle({ childId, managerId, edges })) {
    return { valid: false, reason: "That move would create a reporting cycle." };
  }
  return { valid: true, reason: "" };
}

export function searchPeople(people = [], filters = {}) {
  const query = normalizeText(filters.query);
  const title = normalizeText(filters.title);
  const location = normalizeText(filters.location);
  const manager = normalizeText(filters.manager);
  const status = normalizeText(filters.status);
  const department = normalizeText(filters.department);

  return asArray(people).filter((person) => {
    const locationNames = getDisplayLocations(person).map((item) => item.display_name).join(" ");
    const managerNames = asArray(person.managers).map((item) => item.display_name).join(" ");
    const haystack = normalizeText([
      person.display_name,
      person.title,
      person.department,
      person.email,
      person.work_phone,
      locationNames,
      managerNames,
      person.directory_status,
      person.person_type,
    ].join(" "));

    if (query && !haystack.includes(query)) return false;
    if (title && !normalizeText(person.title).includes(title)) return false;
    if (department && !normalizeText(person.department).includes(department)) return false;
    if (location && !normalizeText(locationNames).includes(location)) return false;
    if (manager && !normalizeText(managerNames).includes(manager)) return false;
    if (status && normalizeText(person.directory_status) !== status) return false;
    return true;
  });
}

export function buildPersonKey(displayName, existingKeys = []) {
  const base = normalizeText(displayName)
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 54) || "directory-person";

  const used = new Set(existingKeys.filter(Boolean));
  if (!used.has(base)) return base;

  for (let index = 2; index < 999; index += 1) {
    const candidate = `${base}-${index}`;
    if (!used.has(candidate)) return candidate;
  }

  return `${base}-${Date.now().toString(36)}`;
}
