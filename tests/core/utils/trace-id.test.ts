import { describe, it, expect } from "vitest";
import { newTraceId } from "@/utils/trace-id";

describe("newTraceId", () => {
  it("returns a string starting with 'req_'", () => {
    const id = newTraceId();
    expect(id.startsWith("req_")).toBe(true);
  });

  it("has at least 8 random hex chars after the prefix (so collisions are rare)", () => {
    const id = newTraceId();
    const random = id.slice("req_".length);
    expect(random.length).toBeGreaterThanOrEqual(8);
    expect(/^[0-9a-f]+$/.test(random)).toBe(true);
  });

  it("generates distinct ids across calls (pseudo-randomness sanity)", () => {
    const set = new Set<string>();
    for (let i = 0; i < 100; i++) set.add(newTraceId());
    // 100 calls, expect 100 distinct ids (probabilistically — 8 hex chars
    // gives 4 billion possibilities, collision in 100 draws negligible)
    expect(set.size).toBe(100);
  });

  it("contains no PII-like characters (no @, no dots, no slashes)", () => {
    // Defensive shape assertion. The format is opaque random — guarantees
    // no caller mistakes a stable identifier (email/path/etc) for a traceId.
    const id = newTraceId();
    expect(id).not.toMatch(/[@./]/);
  });
});
