# Enterprise (multi‑location)

Cross‑location views for operators who run more than one facility. In the base
edition these live under `src/kol/enterprise/` and are reached by selecting the
**Enterprise** location in the sidebar (`/enterprise/*`); POS has parallel screens in
`src/pos/pages/Enterprise*Page.jsx`.

- **Access:** gated by the `Enterprise View` permission (`PAGE_PERMISSION_MAP` in
  `KolApp.jsx`); the Company Directory + Org Chart are universal authenticated surfaces.
- **Scoping:** `getUserLocationIds` (`shared/permissions.js`) decides which locations a
  user sees (`null` = all, for enterprise admins).

## Pages (base edition — `src/kol/enterprise/`)

### Volume / Ops Matrix — `/enterprise/operations`
- **Purpose:** cross‑location operations + volume rollups (also `performance`, `vendors`, `licenses` views).
- **Files:** `src/kol/enterprise/OpsMatrix.jsx`.
- **Backend:** enterprise aggregation over `rpc("get_locations_ops_data")` (+ `enterpriseAggregation.js`).

### Attendance — `/enterprise/attendance`
- **Purpose:** attendance across locations.
- **Files:** `src/kol/enterprise/Attendance.jsx`.
- **Backend:** aggregation RPCs over per‑location attendance.

### Company Directory + Org Chart — `/enterprise/directory`, `/enterprise/org-chart`
- **Purpose:** people directory and an interactive org chart.
- **Files:** `src/kol/enterprise/CompanyDirectory.jsx`; `useEnterpriseDirectory` hook; `companyDirectoryModel.js` (org‑chart model).
- **Backend:** `enterprise_directory_people_safe` (PII‑safe view), `enterprise_directory_locations`, `enterprise_directory_person_locations`, `enterprise_directory_edges`, `enterprise_directory_data_gaps`.

### Locations — `/enterprise/locations`
- **Purpose:** location administration.
- **Files:** `src/kol/enterprise/Locations.jsx`.
- **Backend:** `locations` + location config RPCs.

### User Management — `/enterprise/users`
- **Purpose:** cross‑location users + roles.
- **Files:** `src/kol/enterprise/UserManagement.jsx`.
- **Backend:** `rpc("list_enterprise_users")`, `rpc("manage_lite_team_member")`, `lite_profiles`.

## POS counterparts
`src/pos/pages/EnterpriseOperationsPage.jsx`, `EnterpriseLocationsPage.jsx`,
`EnterpriseUsersPage.jsx`, `EnterprisePackagesPage.jsx`, `EnterpriseManagementPage.jsx` —
same domains over the POS `useData` layer + enterprise RPCs.

> Note the `*_safe` directory view: server‑side masking is the canonical way this app
> keeps PII out of broad surfaces — the same principle behind [Demo Mode](Demo-Mode.md).
