import { describe, expect, it } from "vitest";
import { hasLeanPermission, resolveLeanPermissionKeys, resolveLeanRoleKey } from "../shared/permissions";

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
});
