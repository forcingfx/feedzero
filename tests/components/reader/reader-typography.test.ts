import { describe, it, expect } from "vitest";
import { READER_WIDTH_PX, readerColumnClass, readerTextClass } from "@/components/reader/reader-typography.ts";

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

  it("readerTextClass carries text size and line spacing but no measure", () => {
    const cls = readerTextClass({ textSize: "large", lineHeight: "relaxed" });
    expect(cls).toContain("text-lg");
    expect(cls).toContain("leading-loose");
    expect(cls).not.toContain("max-w-");
  });

  it("READER_WIDTH_PX states each measure in pixels, matching its class", () => {
    // Tailwind's spacing unit is 4px: max-w-150 is 600px, and so on.
    expect(READER_WIDTH_PX).toEqual({ narrow: 600, medium: 720, wide: 960, full: null });
    for (const [width, px] of Object.entries(READER_WIDTH_PX)) {
      if (px === null) continue;
      expect(
        readerColumnClass({ textSize: "medium", width: width as never, lineHeight: "normal" }),
      ).toContain(`max-w-${px / 4}`);
    }
  });
});
