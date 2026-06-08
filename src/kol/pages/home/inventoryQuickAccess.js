import { C } from "../../../shared/theme";

export function buildInventoryQuickAccessState(snapshot, overdueInfo) {
  const isCompleted = !!snapshot?.completed_at || snapshot?.status === "completed";
  if (isCompleted) {
    return {
      desc: "Current cycle complete",
      badge: { label: "Complete", bg: C.sucLt, color: C.suc },
    };
  }
  if (overdueInfo.isOverdue) {
    return {
      desc: "Inventory count overdue",
      badge: { label: `${overdueInfo.daysOverdue}d overdue`, bg: "#FEF2F2", color: "#DC2626" },
    };
  }
  if (overdueInfo.isDueToday) {
    return {
      desc: "Inventory count due today",
      badge: { label: "Due today", bg: C.warnLt, color: C.warn },
    };
  }
  return {
    desc: "Current cycle in progress",
    badge: { label: "On track", bg: C.priLt, color: C.pri },
  };
}
