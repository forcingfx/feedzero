import { describe, it, expect, expectTypeOf } from "vitest";
import type { UserPreferences } from "@feedzero/core/types";
import { DEFAULT_PREFERENCES } from "@feedzero/core/types";

/**
 * Type-shape tripwire for the synced preferences record. The runtime
 * tests for the db accessors, vault round-trip, and store live elsewhere;
 * this file documents the contract every consumer depends on.
 */
describe("UserPreferences type + DEFAULT_PREFERENCES", () => {
  it("DEFAULT_PREFERENCES carries every consolidated preference", () => {
    expect(DEFAULT_PREFERENCES).toEqual({
      feedSortMode: "name",
      feedCustomOrder: [],
      folderCustomOrder: [],
      articleSortMode: "newest",
      groupArticleFloods: true,
      theme: "system",
    });
  });

  it("UserPreferences accepts a non-default theme value", () => {
    const withTheme: UserPreferences = {
      ...DEFAULT_PREFERENCES,
      theme: "dark",
    };
    expect(withTheme.theme).toBe("dark");
  });

  it("DEFAULT_PREFERENCES is assignable to UserPreferences", () => {
    expectTypeOf(DEFAULT_PREFERENCES).toMatchTypeOf<UserPreferences>();
  });
});
