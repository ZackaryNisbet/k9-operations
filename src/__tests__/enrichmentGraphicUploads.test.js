import { describe, expect, it } from "vitest";
import {
  buildGraphicStoragePath,
  getGraphicContentType,
  getGraphicExtension,
  isAllowedGraphicFile,
} from "../kol/enrichments/enrichmentGraphicUploads";

describe("enrichment graphic upload helpers", () => {
  it("accepts a valid PDF calendar even when the browser omits the MIME type", () => {
    const file = { name: "May Employee Calendar.pdf", type: "" };

    expect(isAllowedGraphicFile(file)).toBe(true);
    expect(getGraphicExtension(file)).toBe("pdf");
    expect(getGraphicContentType(file)).toBe("application/pdf");
  });

  it("normalizes JPEG extensions and infers upload content type from file name", () => {
    const file = { name: "customer-calendar.JPEG", type: "application/octet-stream" };

    expect(isAllowedGraphicFile(file)).toBe(true);
    expect(getGraphicExtension(file)).toBe("jpg");
    expect(getGraphicContentType(file)).toBe("image/jpeg");
  });

  it("builds a stable month-scoped storage path without raw slash segments", () => {
    const file = { name: "customer calendar.png", type: "image/png" };

    expect(buildGraphicStoragePath("cherry/hill", "2026-05-01", "customer/internal", file)).toBe("cherry_hill/2026-05-01/customer_internal.png");
  });

  it("rejects unsupported calendar upload formats", () => {
    expect(isAllowedGraphicFile({ name: "calendar.svg", type: "image/svg+xml" })).toBe(false);
    expect(getGraphicContentType({ name: "calendar.svg", type: "image/svg+xml" })).toBe("application/octet-stream");
  });
});
