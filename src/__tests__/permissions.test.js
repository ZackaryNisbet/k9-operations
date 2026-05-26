import { describe, expect, it } from "vitest";
import {
  applyLeanPermissionOverrides,
  buildLeanPermissionMatrix,
  getUserLocationIds,
  hasAnyLeanPermission,
  hasEveryLeanPermission,
  hasLeanPermission,
  resolveLeanPermissionKeys,
  resolveLeanRoleKey,
} from "../shared/permissions";
import { LEAN_PERMISSION_AREAS, LEAN_PERMISSION_CATEGORIES, LEAN_PERMISSION_MATRIX, LEAN_ROLES } from "../shared/theme";

describe("lean permission aliases", () => {
  it("maps newer admin-style roles onto the lean permission matrix", () => {
    expect(resolveLeanRoleKey("admin")).toBe("location_admin");
    expect(resolveLeanRoleKey("regional")).toBe("multi_location_admin");
    expect(resolveLeanRoleKey("multi_loc_admin")).toBe("multi_location_admin");
    expect(resolveLeanRoleKey("developer")).toBe("enterprise_admin");
    expect(resolveLeanRoleKey("staff")).toBe("csr");
  });

  it("keeps the visible Lite role set aligned with createable team roles", () => {
    expect(LEAN_ROLES.map((role) => role.id)).toEqual([
      "pct",
      "csr",
      "supervisor",
      "manager",
      "location_admin",
      "enterprise_admin",
    ]);
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

  it("exposes split labor compliance permissions in the UI matrix", () => {
    const required = [
      "Labor Compliance View",
      "Labor Compliance Update Evidence",
      "Labor Compliance View PDFs",
      "Labor Compliance Manage Policy",
      "Labor Compliance Historical Cleanup",
    ];

    required.forEach((key) => {
      expect(LEAN_PERMISSION_AREAS).toContain(key);
    });

    const laborCategory = LEAN_PERMISSION_CATEGORIES.find((category) => category.key === "labor");
    expect(laborCategory?.permissions.map((permission) => permission.key)).toEqual(expect.arrayContaining(required));

    Object.values(LEAN_PERMISSION_MATRIX).forEach((permissions) => {
      required.forEach((key) => {
        expect(permissions).toHaveProperty(key);
      });
    });

    expect(hasLeanPermission({ role: "supervisor" }, "Labor Compliance View")).toBe(true);
    expect(hasLeanPermission({ role: "supervisor" }, "Labor Compliance View PDFs")).toBe(true);
    expect(hasLeanPermission({ role: "csr" }, "Labor Compliance View PDFs")).toBe(false);
    expect(hasLeanPermission({ role: "supervisor" }, "Labor Compliance Manage Policy")).toBe(false);
    expect(hasLeanPermission({ role: "manager" }, "Labor Compliance Manage Policy")).toBe(true);
    expect(hasLeanPermission({ role: "location_admin" }, "Labor Compliance Historical Cleanup")).toBe(true);
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

  it("treats Resort Upkeep Complete and Manage as sufficient Resort Upkeep Access", () => {
    try {
      applyLeanPermissionOverrides([
        { role_id: "manager", permission_key: "Resort Upkeep Access", granted: false },
        { role_id: "manager", permission_key: "Resort Upkeep Complete", granted: false },
        { role_id: "manager", permission_key: "Resort Upkeep Manage", granted: true },
        { role_id: "supervisor", permission_key: "Resort Upkeep Access", granted: false },
        { role_id: "supervisor", permission_key: "Resort Upkeep Complete", granted: true },
        { role_id: "supervisor", permission_key: "Resort Upkeep Manage", granted: false },
      ]);

      expect(hasLeanPermission({ role: "manager" }, "Resort Upkeep Access")).toBe(true);
      expect(hasLeanPermission({ role: "manager" }, "Resort Upkeep Complete")).toBe(true);
      expect(hasEveryLeanPermission({ role: "manager" }, ["Resort Upkeep Access", "Resort Upkeep Complete", "Resort Upkeep Manage"])).toBe(true);
      expect(hasLeanPermission({ role: "multi_loc_admin" }, "Resort Upkeep Manage")).toBe(true);
      expect(hasLeanPermission({ role: "supervisor" }, "Resort Upkeep Access")).toBe(true);
      expect(hasLeanPermission({ role: "supervisor" }, "Resort Upkeep Complete")).toBe(true);
      expect(hasLeanPermission({ role: "supervisor" }, "Resort Upkeep Manage")).toBe(false);
    } finally {
      applyLeanPermissionOverrides([]);
    }
  });

  it("applies lean role aliases when scoping accessible locations", () => {
    expect(getUserLocationIds({ role: "developer", location_id: "home" }, [])).toBeNull();
    expect(getUserLocationIds({ role: "regional", location_id: "home" }, [
      { role_code: "multi_loc_admin", location_id: "loc-a" },
      { role: "multi_location_admin", location_id: "loc-b" },
      { role_code: "manager", location_id: "loc-c" },
    ])).toEqual(["loc-a", "loc-b"]);
  });
});
