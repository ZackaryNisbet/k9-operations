import { describe, it, expect } from "vitest";
import { findOpsManualAnswer } from "../pos/opsManual.js";

const KB = [
  { keywords: ["hours", "operating hours", "open", "close", "what time"], title: "Hours of Operation", answer: "7am-7pm" },
  { keywords: ["collar", "collar system", "blue collar", "identification", "id"], title: "Collar Color System", answer: "Blue = small dog" },
  { keywords: ["dress", "uniform", "dress code", "name badge", "shoes"], title: "Dress Code", answer: "Black pants" },
  { keywords: ["belongings", "items", "toys", "blanket", "bring"], title: "Guest Belongings", answer: "No blankets" },
];

describe("findOpsManualAnswer", () => {
  it("matches on a multi-word keyword phrase", () => {
    expect(findOpsManualAnswer(KB, "what's the dress code here?")?.title).toBe("Dress Code");
  });

  it("matches on a specific single keyword", () => {
    expect(findOpsManualAnswer(KB, "explain the collar colors")?.title).toBe("Collar Color System");
    expect(findOpsManualAnswer(KB, "are you open right now")?.title).toBe("Hours of Operation");
    expect(findOpsManualAnswer(KB, "can guests bring toys")?.title).toBe("Guest Belongings");
  });

  it("defers live-data questions to the edge function (returns null)", () => {
    expect(findOpsManualAnswer(KB, "what's my revenue this month?")).toBeNull();
    expect(findOpsManualAnswer(KB, "how many dogs are due today?")).toBeNull();
    expect(findOpsManualAnswer(KB, "show me today's schedule")).toBeNull();
    expect(findOpsManualAnswer(KB, "list all open balances")).toBeNull();
  });

  it("ignores short/generic single-word keywords to avoid false positives", () => {
    // "id" (< 4 chars) must not trigger a match on its own.
    expect(findOpsManualAnswer([{ keywords: ["id"], title: "ID", answer: "x" }], "what is the id")).toBeNull();
  });

  it("returns null when nothing relevant matches", () => {
    expect(findOpsManualAnswer(KB, "tell me a joke")).toBeNull();
  });

  it("handles empty / invalid input", () => {
    expect(findOpsManualAnswer(KB, "")).toBeNull();
    expect(findOpsManualAnswer(KB, null)).toBeNull();
    expect(findOpsManualAnswer(null, "hours")).toBeNull();
  });
});
