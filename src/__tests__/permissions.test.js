import { describe, expect, it } from "vitest";
import {
  applyLeanPermissionOverrides,
  buildLeanPermissionMatrix,
  hasAnyLeanPermission,
  hasEveryLeanPermission,
  hasLeanPermission,
  resolveActiveLeanRoles,
  resolveLeanPermissionKeys,
  resolveLeanRoleKey,
} from "../shared/permissions";

describe("lean permission aliases", () => {
  it("maps newer admin-style roles onto the lean permission matrix", () => {
    expect(resolveLeanRoleKey("admin")).toBe("location_admin");
    expect(resolveLeanRoleKey("regional")).toBe("multi_location_admin");
    expect(resolveLeanRoleKey("developer")).toBe("enterprise_admin");
    expect(resolveLeanRoleKey("staff")).toBe("csr");
  });

  it("treats Labor Management as an alias of the legacy Training Management permission", () => {
    expect(resolveLeanPermissionKeys("Labor Management")).toEqual(["Labor Management", "Training Management"]);
    expect(resolveLeanPermissionKeys("Training Management")).toEqual(["Training Management", "Labor Management"]);
  });

  it("grants labor access through the legacy training permission key", () => {
    expect(hasLeanPermission({ role: "supervisor" }, "Labor Management")).toBe(true);
    expect(hasLeanPermission({ role: "admin" }, "Labor Management")).toBe(true);
    expect(hasLeanPermission({ role: "developer" }, "Labor Management")).toBe(true);
    expect(hasLeanPermission({ role: "csr" }, "Labor Management")).toBe(false);
  });

  it("keeps default role capabilities granular inside shared modules", () => {
    expect(hasLeanPermission({ role: "pct" }, "Checkout TV Access")).toBe(true);
    expect(hasLeanPermission({ role: "pct" }, "Inventory Count On Hand")).toBe(false);
    expect(hasLeanPermission({ role: "csr" }, "Photos Upload")).toBe(true);
    expect(hasLeanPermission({ role: "supervisor" }, "Inventory Count On Hand")).toBe(true);
    expect(hasLeanPermission({ role: "supervisor" }, "Inventory Edit Catalog")).toBe(false);
    expect(hasLeanPermission({ role: "manager" }, "Inventory Edit Catalog")).toBe(true);
    expect(hasLeanPermission({ role: "manager" }, "Labor Manage Interviews")).toBe(true);
  });

  it("builds a permission matrix from persisted lite permission overrides without mutating defaults", () => {
    const matrix = buildLeanPermissionMatrix([
      { role_id: "csr", permission_key: "Inventory Management", granted: true },
      { role_id: "supervisor", permission_key: "Inventory Edit Catalog", granted: true },
      { role_id: "manager", permission_key: "Labor Manage Interviews", granted: false },
    ]);

    expect(matrix.csr["Inventory Management"]).toBe(true);
    expect(matrix.supervisor["Inventory Edit Catalog"]).toBe(true);
    expect(matrix.manager["Labor Manage Interviews"]).toBe(false);
    expect(hasLeanPermission({ role: "csr" }, "Inventory Management")).toBe(false);
    expect(hasLeanPermission({ role: "supervisor" }, "Inventory Edit Catalog")).toBe(false);
  });

  it("applies saved overrides to app-wide permission checks and can reset to defaults", () => {
    try {
      applyLeanPermissionOverrides([
        { role_id: "csr", permission_key: "Inventory Management", granted: true },
        { role_id: "csr", permission_key: "Inventory Count On Hand", granted: true },
      ]);

      expect(hasEveryLeanPermission({ role: "csr" }, ["Inventory Management", "Inventory Count On Hand"])).toBe(true);
      expect(hasAnyLeanPermission({ role: "pct" }, ["Inventory Count On Hand", "Checkout TV Access"])).toBe(true);
    } finally {
      applyLeanPermissionOverrides([]);
    }

    expect(hasLeanPermission({ role: "csr" }, "Inventory Management")).toBe(false);
  });

  it("resolves visible permission roles from active team membership", () => {
    const roles = resolveActiveLeanRoles({
      memberRows: [
        { role: "pct", is_active: true },
        { role: "csr", is_active: true },
        { role: "multi_location_admin", is_active: false },
      ],
      profile: { role: "manager", is_active: true },
    }).map((role) => role.id);

    expect(roles).toEqual(["pct", "csr", "manager", "enterprise_admin"]);
    expect(roles).not.toContain("multi_location_admin");
  });

  it("keeps enterprise admin visible as the locked full-access role", () => {
    const roles = resolveActiveLeanRoles({
      memberRows: [{ role: "role_staff", is_active: true }],
      profile: null,
    }).map((role) => role.id);

    expect(roles).toEqual(["csr", "enterprise_admin"]);
  });
});
