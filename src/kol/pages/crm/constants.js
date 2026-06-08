// Shared style/token constants for the CRM page (src/kol/pages/CrmPage.jsx).
import { C } from "../../../shared/theme";

export const SECTION_LABEL = {
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: C.textMut,
  marginBottom: 6,
};

// Health-pill tone → color map, shared by HealthBadge and the detail modal.
export const HEALTH_COLORS = { success: C.suc, warning: C.warn, danger: C.dan, neutral: C.textMut };
