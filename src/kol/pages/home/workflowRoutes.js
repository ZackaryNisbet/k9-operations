const WORKFLOW_ROUTE_MAP = {
  bathing: { page: "ops-bathing" },
  pamper: { page: "ops-pamper" },
  enrichment: { page: "ops-svc" },
  ice_cream: { page: "ops-svc" },
  rooms: { page: "ops-rooms" },
  play: { page: "ops-pp" },
  "weekly-maintenance": { page: "ops-weekly-maintenance" },
  belongings: { page: "ops-belongings" },
  collars: { page: "ops-collars" },
  "lodging-transfer": { page: "ops-lodging-transfers" },
  "roll-call-opening": { page: "ops-roll-call-opening" },
  "roll-call-closing": { page: "ops-roll-call-closing" },
  "feeding-meds-am": { page: "ops-feeding-meds-am" },
  "feeding-meds-midday": { page: "ops-feeding-meds-midday" },
  "feeding-meds-pm": { page: "ops-feeding-meds-pm" },
  "feeding-report": { page: "ops-feeding-report" },
  meds: { page: "ops-medication-report" },
};

export function getWorkflowNavTarget(workflowId, title) {
  const target = WORKFLOW_ROUTE_MAP[workflowId];
  if (!target) return null;
  if (workflowId === "enrichment" || workflowId === "ice_cream") {
    return { page: target.page, params: { svcName: title } };
  }
  return target;
}
