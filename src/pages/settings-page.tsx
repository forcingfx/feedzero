/**
 * Settings stage page — mounted inside the main feeds layout when the
 * route is `/settings`. Replaces the prior top-level `<SettingsDialog>`
 * modal: Settings is now a destination, not a transient overlay.
 *
 * The active tab is carried in the `?tab=` query param so the page is
 * deep-linkable and the browser back button walks tab history. Layout
 * matches `<StatsPage>` so the two stage destinations feel like a set.
 */
import { useSearchParams } from "react-router";
import { BrandMark } from "@/components/brand/brand-mark";
import { SettingsTabs } from "@/components/settings/settings-tabs";
import type { SettingsTab } from "@/lib/go-to-settings";

const VALID_TABS: readonly SettingsTab[] = [
  "subscription",
  "recovery",
  "data",
  "reading",
  "help",
];

function isSettingsTab(value: string | null): value is SettingsTab {
  return value !== null && (VALID_TABS as readonly string[]).includes(value);
}

export function SettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const raw = searchParams.get("tab");
  const activeTab: SettingsTab = isSettingsTab(raw) ? raw : "subscription";

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
