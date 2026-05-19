import { describe, expect, it } from "vitest";
import { buildSettingsSections } from "../kol/pages/SettingsPage.jsx";

function cardIds(sections) {
  return sections.flatMap((section) => section.cards.map((card) => card.id));
}

describe("buildSettingsSections", () => {
  it("hides analytics-only settings in base Lite mode", () => {
    const ids = cardIds(buildSettingsSections({ analyticsMode: false }));

    expect(ids).not.toContain("ignite-settings");
    expect(ids).not.toContain("ignite-parser");
    expect(ids).not.toContain("checklist-templates");
    expect(ids).not.toContain("required-fields");
    expect(ids).not.toContain("lapsed-thresholds");
    expect(ids).toContain("weather-location");
  });

  it("keeps analytics-only settings available in analytics mode", () => {
    const ids = cardIds(buildSettingsSections({ analyticsMode: true }));

    expect(ids).toContain("ignite-settings");
    expect(ids).toContain("ignite-parser");
    expect(ids).toContain("checklist-templates");
    expect(ids).toContain("required-fields");
    expect(ids).toContain("lapsed-thresholds");
  });
});
