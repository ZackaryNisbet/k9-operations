import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import LocationSelector from "../shared/LocationSelector";

describe("LocationSelector", () => {
  it("renders a loading fallback when role filtering leaves no locations yet", () => {
    const element = (
      <LocationSelector
        currentLocation="cherry-hill"
        onLocationChange={() => {}}
        collapsed={false}
        allLocations={[]}
        profile={{ role: "manager" }}
      />
    );

    expect(() => renderToStaticMarkup(element)).not.toThrow();
    expect(renderToStaticMarkup(element)).toContain("Loading location");
  });

  it("keeps the collapsed selector safe during the same loading gap", () => {
    const element = (
      <LocationSelector
        currentLocation="cherry-hill"
        onLocationChange={() => {}}
        collapsed
        allLocations={[]}
        profile={{ role: "manager" }}
      />
    );

    expect(() => renderToStaticMarkup(element)).not.toThrow();
  });
});
