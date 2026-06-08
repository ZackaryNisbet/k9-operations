// K9 Operations — RoleLayoutPage helpers
// Pure layout/workflow helpers extracted verbatim from RoleLayoutPage.jsx.
// No behavior change: same inputs, same outputs.

import { WORKFLOW_SECTION_MAP } from "../../../shared/theme";
import { ROLES, SECTIONS, WORKFLOW_DEFS } from "./constants";

export function cellKey(role, section) { return `${role}::${section}`; }

export function createEmptyLayout() {
  const items = {};
  ROLES.forEach(r => SECTIONS.forEach(s => { items[cellKey(r.id, s.id)] = []; }));
  return items;
}

export function buildDefaultWorkflowLayout() {
  const items = createEmptyLayout();
  ROLES.forEach(r => {
    const roleMap = WORKFLOW_SECTION_MAP[r.id] || {};
    Object.entries(roleMap).forEach(([wfId, sectionId]) => {
      const key = cellKey(r.id, sectionId);
      const wfDef = WORKFLOW_DEFS.find(w => w.id === wfId);
      if (!wfDef || !items[key]) return;
      items[key].push({
        task_id: `wf_${wfId}`,
        task_label: wfDef.label,
        item_type: "workflow",
        workflow_id: wfId,
        section: sectionId,
        role: r.id,
        sort_order: items[key].length,
        source: "workflow",
      });
    });
  });
  return items;
}

export function sanitizeLayoutState(items) {
  const next = createEmptyLayout();
  let duplicateCount = 0;

  Object.entries(items || {}).forEach(([key, value]) => {
    const rawList = Array.isArray(value) ? value : [];
    const [role = "", section = ""] = String(key).split("::");
    const seen = new Set();

    rawList.forEach((item) => {
      const taskId = String(item?.task_id || "").trim();
      if (!taskId) return;
      if (seen.has(taskId)) {
        duplicateCount += 1;
        return;
      }
      seen.add(taskId);
      if (!next[key]) next[key] = [];
      next[key].push({
        ...item,
        role: item?.role || role,
        section: item?.section || section,
        sort_order: next[key].length,
      });
    });
  });

  return { items: next, duplicateCount };
}

export function moveRoleLayoutItem(items, dragItem, targetRole, targetSection, targetIndex) {
  if (!dragItem) return { items, moved: false, reason: "missing_drag_item" };

  const { role: srcRole, section: srcSection, index: srcIndex, item } = dragItem;
  const srcKey = cellKey(srcRole, srcSection);
  const tgtKey = cellKey(targetRole, targetSection);
  const sourceList = (items?.[srcKey] || []).map((entry) => ({ ...entry }));
  const draggedItem = item || sourceList[srcIndex];

  if (!draggedItem || srcIndex < 0 || srcIndex >= sourceList.length) {
    return { items, moved: false, reason: "missing_source_item" };
  }

  const next = { ...(items || {}) };
  const targetList = srcKey === tgtKey ? sourceList : (items?.[tgtKey] || []).map((entry) => ({ ...entry }));

  if (srcKey !== tgtKey && targetList.some((existing) => existing.task_id === draggedItem.task_id)) {
    return { items, moved: false, reason: "duplicate_target" };
  }

  sourceList.splice(srcIndex, 1);
  const boundedIndex = targetIndex < 0
    ? targetList.length
    : Math.max(0, Math.min(targetIndex, targetList.length));
  const insertIndex = srcKey === tgtKey && srcIndex < boundedIndex ? boundedIndex - 1 : boundedIndex;
  const movedItem = {
    ...draggedItem,
    role: targetRole,
    section: targetSection,
  };

  if (srcKey === tgtKey) {
    sourceList.splice(insertIndex, 0, movedItem);
    next[srcKey] = sourceList;
  } else {
    targetList.splice(insertIndex, 0, movedItem);
    next[srcKey] = sourceList;
    next[tgtKey] = targetList;
  }

  [srcKey, tgtKey].forEach((key) => {
    (next[key] || []).forEach((entry, index) => {
      entry.sort_order = index;
      if (key === tgtKey) {
        entry.role = targetRole;
        entry.section = targetSection;
      }
      if (key === srcKey && key !== tgtKey) {
        entry.role = srcRole;
        entry.section = srcSection;
      }
    });
  });

  return { items: next, moved: true, movedItem };
}

export function isMissingReplaceRoleLayoutRpc(error) {
  const msg = `${error?.message || ""} ${error?.details || ""}`.toLowerCase();
  return error?.code === "PGRST202" || msg.includes("replace_role_page_config") || msg.includes("could not find the function");
}

// ─── Workflow Summary Helpers (exported for testing) ──────────────────────────
export function buildWorkflowSummary(cellItems, roles, sections, workflowDefs) {
  // Map each workflow to the set of roles that include it
  const wfRoleMap = {}; // { workflowId: Set<roleId> }
  workflowDefs.forEach(wf => { wfRoleMap[wf.id] = new Set(); });

  roles.forEach(r => {
    sections.forEach(s => {
      const key = `${r.id}::${s.id}`;
      (cellItems[key] || []).forEach(item => {
        if (item.item_type === "workflow" && item.workflow_id) {
          if (wfRoleMap[item.workflow_id]) {
            wfRoleMap[item.workflow_id].add(r.id);
          }
        }
      });
    });
  });

  const used = [];
  const unused = [];
  const shared = [];
  const singleRole = [];

  workflowDefs.forEach(wf => {
    const roleSet = wfRoleMap[wf.id];
    const roleCount = roleSet.size;
    if (roleCount === 0) {
      unused.push(wf);
    } else {
      used.push({ ...wf, roleCount, roles: [...roleSet] });
      if (roleCount > 1) {
        shared.push({ ...wf, roleCount, roles: [...roleSet] });
      } else {
        singleRole.push({ ...wf, roleCount, roles: [...roleSet] });
      }
    }
  });

  return { used, unused, shared, singleRole, wfRoleMap };
}
