import { describe, it, expect } from "vitest";
import { createBriefing } from "../../../src/core/storage/schema.ts";

describe("createBriefing", () => {
  it("fills in id + timestamps + the required defaults", () => {
    const before = Date.now();
    const result = createBriefing({
      name: "EU AI Act enforcement",
      prompt: "Track enforcement actions under the EU AI Act.",
    });
    const after = Date.now();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.name).toBe("EU AI Act enforcement");
    expect(result.value.prompt).toBe(
      "Track enforcement actions under the EU AI Act.",
    );
    expect(result.value.lastRunAt).toBeNull();
    expect(result.value.lastReport).toBeNull();
    expect(result.value.staleArticleCount).toBe(0);
    expect(result.value.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(result.value.createdAt).toBeGreaterThanOrEqual(before);
    expect(result.value.createdAt).toBeLessThanOrEqual(after);
  });

  it("trims surrounding whitespace from the name", () => {
    const result = createBriefing({
      name: "  Climate policy  ",
      prompt: "EU climate disclosure rules.",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.name).toBe("Climate policy");
  });

  it("rejects an empty name (sidebar would render an invisible row)", () => {
    const result = createBriefing({ name: "", prompt: "Anything." });
    expect(result.ok).toBe(false);
  });

  it("rejects whitespace-only names", () => {
    const result = createBriefing({ name: "   ", prompt: "Anything." });
    expect(result.ok).toBe(false);
  });

  it("rejects an empty prompt (briefings without a question have no shape)", () => {
    const result = createBriefing({ name: "Anything", prompt: "" });
    expect(result.ok).toBe(false);
  });

  it("rejects whitespace-only prompts", () => {
    const result = createBriefing({ name: "Anything", prompt: "   " });
    expect(result.ok).toBe(false);
  });
});
