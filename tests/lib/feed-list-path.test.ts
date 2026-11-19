import { describe, it, expect } from "vitest";
import { feedListPath } from "@/lib/feed-list-path.ts";

describe("feedListPath", () => {
  it("keeps a feed list route as it is", () => {
    expect(feedListPath("/feeds/all")).toBe("/feeds/all");
    expect(feedListPath("/feeds/f1")).toBe("/feeds/f1");
    expect(feedListPath("/feeds")).toBe("/feeds");
  });

  it("maps an article route to the list it was opened from", () => {
    expect(feedListPath("/feeds/f1/articles/a9")).toBe("/feeds/f1");
  });

  it("is null outside the Feeds section", () => {
    expect(feedListPath("/explore")).toBeNull();
    expect(feedListPath("/settings")).toBeNull();
    expect(feedListPath("/feedsomething")).toBeNull();
  });
});
