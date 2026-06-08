// ─── Required Fields Matrix Helpers ─────────────────────────────────────────
const ACTION_LEVELS = ["create", "tour", "eval", "reservation"];
const ACTION_LABELS = { create: "Create Record", tour: "Book Tour", eval: "Book Eval", reservation: "Book Reservation" };

function isFieldRequired(field, action) {
  const rf = field.requiredFor || (field.required ? ["create"] : []);
  if (rf.length === 0) return false;
  const minLevel = Math.min(...rf.map(a => ACTION_LEVELS.indexOf(a)).filter(i => i >= 0));
  return ACTION_LEVELS.indexOf(action) >= minLevel;
}

function validateFields(dataFields, values, action) {
  const errs = {};
  dataFields.forEach(f => {
    if (isFieldRequired(f, action) && !values[f.id]) errs[f.id] = "Required";
  });
  return errs;
}

function migrateFieldsToMatrix(fields, defaults) {
  // Build lookup from defaults for known fields
  const defMap = {};
  (defaults || []).forEach(d => { defMap[d.id] = d.requiredFor || []; });
  return fields.map(f => {
    // If field still has old `required` boolean, it needs migration
    if (typeof f.required === "boolean" || !f.requiredFor) {
      if (defMap[f.id] && defMap[f.id].length > 0) {
        const { required, ...rest } = f;
        return { ...rest, requiredFor: defMap[f.id] };
      }
      const { required, ...rest } = f;
      return { ...rest, requiredFor: f.required ? ["create"] : (f.requiredFor || []) };
    }
    // Already migrated correctly (has requiredFor, no required boolean) — but fix
    // fields that were migrated with old cumulative logic (e.g. ["create","tour"] → ["tour"])
    if (f.requiredFor && f.requiredFor.length > 1 && defMap[f.id]) {
      // Keep only the minimum level (which is the actual requirement)
      const minIdx = Math.min(...f.requiredFor.map(a => ACTION_LEVELS.indexOf(a)).filter(i => i >= 0));
      return { ...f, requiredFor: [ACTION_LEVELS[minIdx]] };
    }
    return f;
  });
}

export { ACTION_LEVELS, ACTION_LABELS, isFieldRequired, validateFields, migrateFieldsToMatrix };
