import { describe, it, expect } from "vitest";
import { readerColumnClass } from "@/components/reader/reader-typography.ts";

describe("readerColumnClass", () => {
  it("combines the measure, text size and line spacing of the three preferences", () => {
    const cls = readerColumnClass({ textSize: "large", width: "wide", lineHeight: "compact" });
    expect(cls).toContain("text-lg");
    expect(cls).toContain("max-w-240");
    expect(cls).toContain("leading-normal");
  });

  it("adds no text size class at medium, the inherited body size", () => {
    const cls = readerColumnClass({ textSize: "medium", width: "medium", lineHeight: "normal" });
    expect(cls).not.toMatch(/\btext-(sm|lg|xl)\b/);
    expect(cls).toContain("max-w-180");
    expect(cls).toContain("leading-relaxed");
  });
});
