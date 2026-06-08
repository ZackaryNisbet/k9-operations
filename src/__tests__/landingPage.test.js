import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The K9Operations.com marketing one-pager (src/LandingPage.jsx) once carried rich
// feature sections that were left unrendered, so the live page degraded to a bare
// hero + sign-in that never explained the product. These guards keep the
// explanatory content actually mounted and the sign-in/contact paths intact.
const source = readFileSync(new URL("../LandingPage.jsx", import.meta.url), "utf8");

describe("LandingPage marketing content", () => {
  it("mounts the rich marketing components (not dead code)", () => {
    expect(source).toContain("PLATFORM_PILLARS.map");
    expect(source).toContain("<DataFlowAnimation />");
    expect(source).toContain("CAPABILITIES.map");
    expect(source).toContain("STEPS.map");
  });

  it("explains what the product does in plain language", () => {
    expect(source).toMatch(/operations platform for boarding/i);
    expect(source).toContain("Customer Lifecycle");
    expect(source).toContain("Daily Operations");
    expect(source).toContain("Front of House");
    expect(source).toContain("Reporting & Intelligence");
  });

  it("keeps the sign-in and contact paths", () => {
    expect(source).toContain("/login");
    expect(source).toContain("zack.nisbet@k9operations.com");
  });
});
