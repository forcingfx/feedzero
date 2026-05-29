/**
 * Settings stage page — mounted inside the main feeds layout when the
 * route is `/settings`. Replaces the prior top-level `<SettingsDialog>`
 * modal: Settings is now a destination, not a transient overlay.
 *
 * The active tab is carried in the `?tab=` query param so the page is
 * deep-linkable and the browser back button walks tab history. Layout
 * matches `<StatsPage>` so the two stage destinations feel like a set.
 */
import { useEffect } from "react";
import { useSearchParams } from "react-router";
import { BrandMark } from "@/components/brand/brand-mark";
import { SettingsTabs } from "@/components/settings/settings-tabs";
import { isSelfHosted } from "@/core/features/self-hosted";
import type { SettingsTab } from "@/lib/go-to-settings";

const VALID_TABS: readonly SettingsTab[] = [
  "subscription",
  "sync-and-data",
  "reading",
  "help",
];

// Old tab names that point at content now hosted under a different slug.
// Keep them mapped so deep-links shared before the redesign still land in
// the right place after the merge into Subscription / Sync & Data /
// Reading.
const LEGACY_TAB_REDIRECTS: Record<string, SettingsTab> = {
  recovery: "subscription",
  data: "sync-and-data",
  briefings: "reading",
};

function isSettingsTab(value: string | null): value is SettingsTab {
  return value !== null && (VALID_TABS as readonly string[]).includes(value);
}

function defaultTab(): SettingsTab {
  // Self-hosters never see the Subscription tab, so default them to the
  // first tab they actually have.
  return isSelfHosted() ? "sync-and-data" : "subscription";
}

export function SettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const raw = searchParams.get("tab");
  const legacy = raw ? LEGACY_TAB_REDIRECTS[raw] : undefined;
  const activeTab: SettingsTab = legacy ?? (isSettingsTab(raw) ? raw : defaultTab());

  useEffect(() => {
    if (!legacy) return;
    const next = new URLSearchParams(searchParams);
    next.set("tab", legacy);
    setSearchParams(next, { replace: true });
  }, [legacy, searchParams, setSearchParams]);

  function handleTabChange(tab: SettingsTab) {
    const next = new URLSearchParams(searchParams);
    next.set("tab", tab);
    setSearchParams(next);
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 md:py-10">
      <header className="mb-6 flex items-center gap-2">
        <BrandMark className="size-6" alt="" />
        <h1 className="text-xl font-semibold">Settings</h1>
      </header>

      <SettingsTabs activeTab={activeTab} onTabChange={handleTabChange} />
    </div>
  );
}
