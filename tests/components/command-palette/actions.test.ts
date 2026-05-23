import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildCommandActions } from "@/components/command-palette/actions.ts";
import { useFeedStore } from "@/stores/feed-store.ts";
import { useArticleStore } from "@/stores/article-store.ts";

const navigate = vi.fn();
const setTheme = vi.fn();
const refreshAll = vi.fn();
const markAllAsRead = vi.fn();

function findAction(id: string) {
  return buildCommandActions({
    navigate,
    theme: { setTheme },
  }).find((a) => a.id === id);
}

describe("buildCommandActions", () => {
  beforeEach(() => {
    navigate.mockReset();
    setTheme.mockReset();
    refreshAll.mockReset();
    markAllAsRead.mockReset();
    useFeedStore.setState({ refreshAll } as never);
    useArticleStore.setState({ markAllAsRead } as never);
  });

  it("returns a deterministic, non-empty list", () => {
    const actions = buildCommandActions({
      navigate,
      theme: { setTheme },
    });
    expect(actions.length).toBeGreaterThan(5);
    // ids are unique
    const ids = actions.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("groups every action under one of the canonical groups", () => {
    const allowed = new Set([
      "Navigate",
      "Feeds",
      "Read",
      "Appearance",
      "Account",
    ]);
    for (const action of buildCommandActions({
      navigate,
      theme: { setTheme },
    })) {
      expect(allowed.has(action.group)).toBe(true);
    }
  });

  describe("navigation actions", () => {
    it.each([
      ["go-feeds", "/feeds"],
      ["go-explore", "/explore"],
      ["go-signal", "/signal"],
      ["go-stats", "/stats"],
    ])("%s navigates to %s", (id, path) => {
      findAction(id)?.run();
      expect(navigate).toHaveBeenCalledWith(path);
    });
  });

  describe("feed actions", () => {
    it("add-feed navigates to /explore with focus=search query", () => {
      findAction("add-feed")?.run();
      expect(navigate).toHaveBeenCalledWith("/explore?focus=search");
    });

    it("refresh-all calls feed-store.refreshAll", () => {
      findAction("refresh-all")?.run();
      expect(refreshAll).toHaveBeenCalledTimes(1);
    });
  });

  describe("read actions", () => {
    it("mark-all-read calls article-store.markAllAsRead", () => {
      findAction("mark-all-read")?.run();
      expect(markAllAsRead).toHaveBeenCalledTimes(1);
    });

    it("toggle-sidebar dispatches the established CustomEvent", () => {
      const spy = vi.spyOn(document, "dispatchEvent");
      findAction("toggle-sidebar")?.run();
      const dispatched = spy.mock.calls[0]?.[0] as CustomEvent;
      expect(dispatched.type).toBe("feedzero:toggle-sidebar");
      spy.mockRestore();
    });
  });

  describe("appearance actions", () => {
    it.each([
      ["theme-light", "light"],
      ["theme-dark", "dark"],
      ["theme-system", "system"],
    ])("%s calls setTheme(%s)", (id, mode) => {
      findAction(id)?.run();
      expect(setTheme).toHaveBeenCalledWith(mode);
    });
  });

  describe("account actions", () => {
    it.each([
      ["open-settings", "/settings"],
      ["open-subscription", "/settings?tab=subscription"],
      ["open-sync", "/settings?tab=sync-and-data"],
      ["open-shortcuts", "/settings?tab=help"],
    ])("%s navigates to %s", (id, path) => {
      findAction(id)?.run();
      expect(navigate).toHaveBeenCalledWith(path);
    });
  });

  it("each action carries an icon for the palette to render", () => {
    for (const action of buildCommandActions({
      navigate,
      theme: { setTheme },
    })) {
      expect(action.icon).toBeDefined();
    }
  });

  it("each action carries a non-empty label", () => {
    for (const action of buildCommandActions({
      navigate,
      theme: { setTheme },
    })) {
      expect(action.label.length).toBeGreaterThan(0);
    }
  });
});
