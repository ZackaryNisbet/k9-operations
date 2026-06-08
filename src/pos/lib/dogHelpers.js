import { getSimulatedNow } from "./format";

// Dog age compliance check
const getDogAgeCompliance = (dog, policies, reservations) => {
  const pol = policies || {};
  if (pol.ageCheckEnabled === false) return { ok: true };
  const dob = dog.fields?.dob;
  if (!dob) return { ok: true };
  const b = new Date(dob + "T00:00:00"), now = getSimulatedNow(); // Time Travel aware
  let ageYears = now.getFullYear() - b.getFullYear();
  if (now.getMonth() < b.getMonth() || (now.getMonth() === b.getMonth() && now.getDate() < b.getDate())) ageYears--;
  const maxAge = pol.maxDogAge ?? 13;
  if (ageYears <= maxAge) return { ok: true, age: ageYears };
  // Over age limit — check grandfathering
  if (pol.grandfatherEnabled !== false) {
    const threshold = pol.grandfatherVisitThreshold ?? 10;
    const completedVisits = (reservations || []).filter(r => r.dogId === dog.id && (r.status === "checked-out" || r.status === "checked-in")).length;
    if (completedVisits >= threshold) return { ok: true, age: ageYears, grandfathered: true, visits: completedVisits };
  }
  return { ok: false, age: ageYears, reason: `Dog is ${ageYears} years old (max: ${maxAge})` };
};

// Spay/neuter compliance: intact dogs ≥10 months with group-play tags must be Private Play
const getSpayNeuterCompliance = (dog) => {
  const sn = dog.fields?.spayed_neutered;
  const isFixed = sn === "Neutered" || sn === "Spayed";
  if (isFixed) return { ok: true, status: sn };
  // Intact or unknown — check age
  const dob = dog.fields?.dob;
  if (!dob) return { ok: true, status: sn || "Unknown" };
  const b = new Date(dob + "T00:00:00"), now = getSimulatedNow(); // Time Travel aware
  let months = (now.getFullYear() - b.getFullYear()) * 12 + (now.getMonth() - b.getMonth());
  if (now.getDate() < b.getDate()) months--;
  if (months < 10) return { ok: true, status: "Intact", ageMonths: months };
  // ≥10 months and intact — check tags
  const tags = dog.tags || [];
  const hasGroupTag = tags.includes("tag_eval") || tags.includes("tag_lp") || tags.includes("tag_sp");
  const hasPrivateTag = tags.includes("tag_pp");
  if (hasPrivateTag) return { ok: true, status: "Intact", ageMonths: months, privatePlay: true };
  if (hasGroupTag) return { ok: false, status: "Intact", ageMonths: months, reason: "Intact dog \u226510 months must be Private Play" };
  return { ok: true, status: sn || "Intact", ageMonths: months };
};

// Dog age from dob
const calcAge = (dob) => {
  if (!dob) return null;
  const b = new Date(dob + "T00:00:00"), now = getSimulatedNow(); // Time Travel aware
  let y = now.getFullYear() - b.getFullYear();
  let m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) { y--; m += 12; }
  if (now.getDate() < b.getDate()) m--;
  if (m < 0) m += 12;
  if (y >= 1) return `${y}y${m > 0 ? ` ${m}m` : ""}`;
  return `${m}m`;
};

// Spay/neuter label
const fixedLabel = (dog) => {
  if (!dog.fields.sex) return "";
  const sn = dog.fields.spayed_neutered;
  if (typeof sn === "string" && sn) return sn;
  // Legacy boolean support
  if (dog.fields.sex === "Female") return sn ? "Spayed" : "Intact";
  return sn ? "Neutered" : "Intact";
};
// Dog daycare size: override > weight-based auto-classification (35 lb threshold)
const getDogDaycareSize = (dog) => {
  if (dog.daycareGroupOverride) return dog.daycareGroupOverride;
  const w = parseInt(dog.fields.weight);
  if (!w || isNaN(w)) return "large"; // default if no weight
  return w < 35 ? "small" : "large";
};

export { getDogAgeCompliance, getSpayNeuterCompliance, calcAge, fixedLabel, getDogDaycareSize };
