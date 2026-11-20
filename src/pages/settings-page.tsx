/**
 * Settings stage page — mounted inside the main feeds layout when the
 * route is `/settings`. Replaces the prior top-level `<SettingsDialog>`
 * modal: Settings is now a destination, not a transient overlay.
 *
 * The active tab is carried in the `?tab=` query param so the page is
 * deep-linkable and the browser back button walks tab history. Layout
 * matches `<StatsPage>` so the two stage destinations feel like a set.
 */
import { useEffect, useLayoutEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { BrandMark } from "@/components/brand/brand-mark";
import { SettingsTabs } from "@/components/settings/settings-tabs";
import type { SettingsTab } from "@/lib/go-to-settings";
import {
  recallSettingsScroll,
  recallSettingsTab,
  rememberSettingsScroll,
  rememberSettingsTab,
} from "@/lib/settings-return-point";

const VALID_TABS: readonly SettingsTab[] = [
  "reading",
  "list",
  "library",
  "sync-and-data",
  "subscription",
  "help",
];

// Old tab names that point at content now hosted under a different slug.
// Keep them mapped so deep-links shared before the redesign still land in
// the right place after the merge into Subscription / Sync & Data /
// Reading.
const LEGACY_TAB_REDIRECTS: Record<string, SettingsTab> = {
  recovery: "subscription",
  data: "sync-and-data",
};

/**
 * `?tab=briefings` once opened the Signal settings inside the Reading
 * tab. Those settings now live on the Signal page, so the old link goes
 * there instead of to a tab that no longer holds them.
 */
const SIGNAL_SETTINGS_PATH = "/signal?settings=open";

function isSettingsTab(value: string | null): value is SettingsTab {
  return value !== null && (VALID_TABS as readonly string[]).includes(value);
}

function defaultTab(): SettingsTab {
  // Reading is what people open Settings to change; the price list is
  // one tab away (audit 2026-Q4). Same default for self-hosters.
  return "reading";
}

/** The element that scrolls the Settings page: `<main>` on a phone, the ScrollArea viewport on desktop. */
function findScroller(el: HTMLElement | null): HTMLElement | null {
  return el?.closest<HTMLElement>("[data-radix-scroll-area-viewport], main") ?? null;
}

export function SettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const raw = searchParams.get("tab");
  const legacy = raw ? LEGACY_TAB_REDIRECTS[raw] : undefined;
  // A bare /settings (the tab bar, the sidebar link) reopens the tab the
  // user left; a link that names a tab wins.
  const remembered = raw === null ? recallSettingsTab(isSettingsTab) : null;
  const activeTab: SettingsTab =
    legacy ?? (isSettingsTab(raw) ? raw : (remembered ?? defaultTab()));

  const navigate = useNavigate();
  const wantsSignalSettings = raw === "briefings";
  useEffect(() => {
    if (wantsSignalSettings) navigate(SIGNAL_SETTINGS_PATH, { replace: true });
  }, [wantsSignalSettings, navigate]);

  // Put a redirected or remembered tab in the URL, so the address always
  // names the tab on screen.
  const tabForUrl = legacy ?? remembered;
  useEffect(() => {
    if (!tabForUrl) return;
    const next = new URLSearchParams(searchParams);
    next.set("tab", tabForUrl);
    setSearchParams(next, { replace: true });
  }, [tabForUrl, searchParams, setSearchParams]);

  useEffect(() => {
    if (!wantsSignalSettings) rememberSettingsTab(activeTab);
  }, [activeTab, wantsSignalSettings]);

  // Scroll position: restored once, when the page mounts on the tab the
  // user left, and recorded as they scroll. Switching tabs by hand starts
  // the new tab at the top, like any tab strip.
  const pageRef = useRef<HTMLDivElement>(null);
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;
  useLayoutEffect(() => {
    const scroller = findScroller(pageRef.current);
    if (!scroller) return;
    scroller.scrollTop = recallSettingsScroll(activeTabRef.current);
    const record = () => rememberSettingsScroll(activeTabRef.current, scroller.scrollTop);
    scroller.addEventListener("scroll", record, { passive: true });
    return () => scroller.removeEventListener("scroll", record);
  }, []);

  function handleTabChange(tab: SettingsTab) {
    const next = new URLSearchParams(searchParams);
    next.set("tab", tab);
    setSearchParams(next);
    rememberSettingsScroll(tab, 0);
    const scroller = findScroller(pageRef.current);
    if (scroller) scroller.scrollTop = 0;
  }

  return (
    <div ref={pageRef} className="mx-auto w-full max-w-4xl px-4 py-6 md:py-10">
      <header className="mb-6 flex items-center gap-2">
        <BrandMark className="size-6" alt="" />
        <h1 className="text-xl font-semibold">Settings</h1>
      </header>

      <SettingsTabs activeTab={activeTab} onTabChange={handleTabChange} />
    </div>
  );
}
