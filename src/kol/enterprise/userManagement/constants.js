export const LOCATION_SCOPED_ROLES = new Set(["pct", "csr", "supervisor", "manager", "location_admin"]);

export const ROLE_OPTIONS = [
  { id: "pct", label: "PCT", scope: "Location" },
  { id: "csr", label: "CSR", scope: "Location" },
  { id: "supervisor", label: "Supervisor", scope: "Location" },
  { id: "manager", label: "Manager", scope: "Location" },
  { id: "location_admin", label: "Location Admin", scope: "Location" },
  { id: "enterprise_admin", label: "Enterprise Admin", scope: "Enterprise" },
];

export const USER_FILTER_OP_LABELS = {
  is: "is",
  isNot: "is not",
};
