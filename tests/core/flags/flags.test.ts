import { describe, it, expect } from "vitest";
import { isFlagEnabled, type FlagName } from "../../../src/core/flags/flags";

describe("isFlagEnabled", () => {
  it("returns false when the env var is unset", () => {
    expect(isFlagEnabled("MAINTENANCE_MODE", {})).toBe(false);
  });

  it("returns true when the env var is exactly \"1\"", () => {
    expect(isFlagEnabled("MAINTENANCE_MODE", { MAINTENANCE_MODE: "1" })).toBe(
      true,
    );
  });

  it("returns false when the env var is \"true\"", () => {
    expect(
      isFlagEnabled("MAINTENANCE_MODE", { MAINTENANCE_MODE: "true" }),
    ).toBe(false);
  });

  it("returns false when the env var is \"yes\"", () => {
    expect(
      isFlagEnabled("MAINTENANCE_MODE", { MAINTENANCE_MODE: "yes" }),
    ).toBe(false);
  });

  it("returns false when the env var is \"0\"", () => {
    expect(
      isFlagEnabled("MAINTENANCE_MODE", { MAINTENANCE_MODE: "0" }),
    ).toBe(false);
  });

  it("returns false when the env var is an arbitrary string", () => {
    expect(
      isFlagEnabled("MAINTENANCE_MODE", { MAINTENANCE_MODE: "anything-else" }),
    ).toBe(false);
  });

  it("returns false when the env var is empty string", () => {
    expect(isFlagEnabled("MAINTENANCE_MODE", { MAINTENANCE_MODE: "" })).toBe(
      false,
    );
  });

  it("treats every defined FlagName independently", () => {
    const names: FlagName[] = [
      "MAINTENANCE_MODE",
      "KILL_BRIDGES",
      "KILL_AI",
      "KILL_ALERTS",
      "KILL_FETCHERS",
      "KILL_SIGNUPS",
      "READONLY_SYNC",
    ];
    for (const name of names) {
      expect(isFlagEnabled(name, { [name]: "1" })).toBe(true);
      expect(isFlagEnabled(name, {})).toBe(false);
    }
  });
});
