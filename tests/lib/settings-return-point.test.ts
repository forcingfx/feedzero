import { describe, it, expect, beforeEach } from "vitest";
import {
  recallSettingsScroll,
  recallSettingsTab,
  rememberSettingsScroll,
  rememberSettingsTab,
} from "@/lib/settings-return-point";
import type { SettingsTab } from "@/lib/go-to-settings";

const TABS = ["reading", "list", "library", "sync-and-data", "subscription", "help"];
const isTab = (value: string | null): value is SettingsTab => value !== null && TABS.includes(value);

describe("settings return point", () => {
  beforeEach(() => sessionStorage.clear());

  it("recalls the tab that was remembered", () => {
    rememberSettingsTab("library");
    expect(recallSettingsTab(isTab)).toBe("library");
  });

  it("recalls nothing before any tab was opened", () => {
    expect(recallSettingsTab(isTab)).toBeNull();
  });

  it("drops a stored value that is not a tab any more", () => {
    sessionStorage.setItem("feedzero:settings-last-tab", "briefings");
    expect(recallSettingsTab(isTab)).toBeNull();
  });

  it("keeps a scroll offset per tab, starting each at the top", () => {
    expect(recallSettingsScroll("help")).toBe(0);
    rememberSettingsScroll("list", 420);
    expect(recallSettingsScroll("list")).toBe(420);
    expect(recallSettingsScroll("help")).toBe(0);
  });
});
