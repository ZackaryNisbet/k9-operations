import { asArray, formatLocationAddress } from "../companyDirectoryModel";

export function makeOptions(values) {
  return values
    .filter(Boolean)
    .map((value) => ({ value, label: value }));
}

export function getLocationAssignment(data, locationId, responsibilityType) {
  return data.people.find((person) => (
    asArray(person.locations).some((location) => (
      location.id === locationId && location.responsibility_type === responsibilityType
    ))
  )) || null;
}

export function formatResortState(location) {
  return location.state_code || location.region_label || "Needs data";
}

export function buildResortRows(data) {
  return data.locations.map((location) => {
    const gm = getLocationAssignment(data, location.id, "general_manager");
    const regional = getLocationAssignment(data, location.id, "regional_manager");
    return {
      location,
      state: formatResortState(location),
      address: formatLocationAddress(location) || "Needs address data",
      generalManager: gm,
      regionalManager: regional,
    };
  });
}

export function buildTreeRows(people, directReportsByManager) {
  const peopleWithManager = new Set();
  directReportsByManager.forEach((reports) => reports.forEach((person) => peopleWithManager.add(person.id)));
  const roots = people.filter((person) => !peopleWithManager.has(person.id) && person.directory_status !== "inactive");
  const rows = [];
  function walk(person, depth) {
    rows.push({ person, depth });
    (directReportsByManager.get(person.id) || []).forEach((report) => walk(report, depth + 1));
  }
  roots.forEach((person) => walk(person, 0));
  return rows;
}
