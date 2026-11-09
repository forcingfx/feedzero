import { describe, it, expect } from "vitest";
import { shouldOpenInFullText } from "@/core/extractor/open-in-full-text";
import type { Feed, Folder } from "@feedzero/core/types";

function feed(overrides: Partial<Feed> = {}): Feed {
  return {
    id: "f1",
    url: "https://example.com/feed",
    title: "Example",
    description: "",
    siteUrl: "https://example.com",
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

function folder(id: string, overrides: Partial<Folder> = {}): Folder {
  return { id, name: id, createdAt: 0, ...overrides };
}

/**
 * Issue #341's sibling #342: "an option to always fetch the full text".
 * Most specific setting wins: the feed's own toggle, then the nearest
 * folder that sets a choice, then the app-wide preference.
 */
describe("shouldOpenInFullText", () => {
  it("follows the app-wide preference when nothing more specific is set", () => {
    expect(shouldOpenInFullText(feed(), [], "full-text")).toBe(true);
    expect(shouldOpenInFullText(feed(), [], "feed")).toBe(false);
    expect(shouldOpenInFullText(feed(), [], undefined)).toBe(false);
  });

  it("opens in full text when the feed itself prefers it, whatever else says", () => {
    const folders = [folder("news", { openArticlesIn: "feed" })];
    const f = feed({ preferFullText: true, folderId: "news" });
    expect(shouldOpenInFullText(f, folders, "feed")).toBe(true);
  });

  it("lets a folder override the app-wide preference in both directions", () => {
    const toFull = [folder("news", { openArticlesIn: "full-text" })];
    expect(shouldOpenInFullText(feed({ folderId: "news" }), toFull, "feed")).toBe(true);

    const toFeed = [folder("news", { openArticlesIn: "feed" })];
    expect(shouldOpenInFullText(feed({ folderId: "news" }), toFeed, "full-text")).toBe(false);
  });

  it("inherits from the nearest ancestor folder that sets a choice", () => {
    const folders = [
      folder("world", { openArticlesIn: "full-text" }),
      folder("europe", { parentId: "world" }),
    ];
    expect(shouldOpenInFullText(feed({ folderId: "europe" }), folders, "feed")).toBe(true);
  });

  it("falls back to the app-wide preference when the folder no longer exists", () => {
    expect(shouldOpenInFullText(feed({ folderId: "gone" }), [], "full-text")).toBe(true);
  });

  it("stops walking on a parent cycle instead of looping forever", () => {
    const folders = [folder("a", { parentId: "b" }), folder("b", { parentId: "a" })];
    expect(shouldOpenInFullText(feed({ folderId: "a" }), folders, "feed")).toBe(false);
  });

  it("follows the app-wide preference for an article whose feed is unknown", () => {
    expect(shouldOpenInFullText(undefined, [], "full-text")).toBe(true);
  });
});
