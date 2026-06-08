// Enrichment events (the company program + each resort's own) are managed only by
// the enterprise-admin grouping; every other role gets a read-only view.
export const ENTERPRISE_ADMIN_ROLES = new Set(["enterprise_admin", "owner", "developer"]);
export const BRAND = {
  forest: "#14532D",
  lime: "#84CC16",
  limeSoft: "#D9F99D",
  slate900: "#0F172A",
  slate800: "#1E293B",
  slate600: "#475569",
  slate400: "#94A3B8",
  slate200: "#E2E8F0",
  slate50: "#F8FAFC",
  blue: "#2563EB",
  amber: "#F59E0B",
  rose: "#EC4899",
};
export const GRAPHIC_BUCKET = "enrichment-calendar-graphics";
export const K9_FONT_STACK = "'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
export const GRAPHIC_AUDIENCES = [
  { id: "customer", label: "Customer Graphic", description: "Client-facing K9 Resorts calendar created by marketing." },
  { id: "employee", label: "Employee Graphic", description: "Internal staff calendar graphic created by marketing." },
];
