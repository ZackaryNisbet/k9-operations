import { DEF_REQUIRED_VACCINES } from "../constants/vaccines";
import { getSimulatedNow } from "./format";

// Vaccine status: returns {ok:bool, expired:[], missing:[], expiringSoon:[], graceperiod:[]}
const getVaxStatus = (dog, requiredVaccines, policies) => {
  const rv = requiredVaccines || DEF_REQUIRED_VACCINES;
  const pol = policies || {};
  const graceDays = pol.vaccineGraceDays ?? 7;
  const warningDays = pol.vaccineWarningDays ?? 30;
  const now = getSimulatedNow(); // Time Travel aware
  const expired = [], missing = [], expiringSoon = [], graceperiod = [];
  for (const vId of rv) {
    const val = dog.fields[vId];
    if (!val) { missing.push(vId); continue; }
    const d = new Date(val + "T00:00:00");
    const diffMs = d - now;
    const diffDays = diffMs / 86400000;
    if (diffDays < 0) {
      // Expired — check if within grace period
      if (graceDays > 0 && Math.abs(diffDays) <= graceDays) graceperiod.push(vId);
      else expired.push(vId);
    } else if (diffDays < warningDays) {
      expiringSoon.push(vId);
    }
  }
  return { ok: expired.length === 0 && missing.length === 0, expired, missing, expiringSoon, graceperiod };
};

export { getVaxStatus };
