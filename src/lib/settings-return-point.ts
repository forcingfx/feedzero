import type { SettingsTab } from "@/lib/go-to-settings";

/**
 * Where the user was in Settings when they left, so coming back lands on
 * the same screen: the tab, and how far down it they had scrolled.
 *
 * The tab bar's Settings button and the sidebar link both go to a bare
 * `/settings`; without this every return opened Reading at the top. Kept
 * for the browser tab's session only. A link that names a tab still wins.
 */
const LAST_TAB_KEY = "feedzero:settings-last-tab";

/** Scroll offsets by tab. In memory: a reload starts each tab at the top. */
const scrollOffsets = new Map<SettingsTab, number>();

export function rememberSettingsTab(tab: SettingsTab): void {
  try {
    sessionStorage.setItem(LAST_TAB_KEY, tab);
  } catch { /* storage unavailable: Settings just opens on its default */ }
}

/** The tab last open, or null when none is remembered or it is no longer a tab. */
export function recallSettingsTab(isTab: (value: string | null) => value is SettingsTab): SettingsTab | null {
  try {
    const stored = sessionStorage.getItem(LAST_TAB_KEY);
    return isTab(stored) ? stored : null;
  } catch {
    return null;
  }
}

export function rememberSettingsScroll(tab: SettingsTab, offset: number): void {
  scrollOffsets.set(tab, offset);
}

export function recallSettingsScroll(tab: SettingsTab): number {
  return scrollOffsets.get(tab) ?? 0;
}
