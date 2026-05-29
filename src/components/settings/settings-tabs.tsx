/**
 * In-page Settings tab strip + content switch.
 *
 * The presentational shell — takes the active tab as a prop and emits
 * change events to its parent. `<SettingsPage>` wires those to the URL
 * `?tab=` param so the user can deep-link and the browser back button
 * walks tab history.
 *
 * Tabs answer one question each:
 *   - Subscription  : what plan am I on, and how do I activate / pay for it?
 *   - Sync & Data   : where does my data live, and how do I move it?
 *   - Reading       : how should articles be presented? (includes Signal)
 *   - Help          : keyboard shortcuts, support, what's new.
 *
 * The dedicated "Briefings" tab was folded into Reading → Signal in
 * May 2026 — Signal is the brand for every cross-feed intelligence
 * feature (local frequency engine, AI overview, saved briefings), so a
 * separate tab named after one modality stopped earning its slot.
 * Legacy `?tab=briefings` deep-links redirect to Reading at the page
 * layer (see settings-page.tsx).
 *
 * Self-hosters never see Subscription (their tier check is bypassed by
 * `isSelfHosted()` — there's no billing UI to surface).
 */
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { SubscriptionTab } from "./tabs/subscription-tab";
import { SyncAndDataTab } from "./tabs/sync-and-data-tab";
import { ReadingTab } from "./tabs/reading-tab";
import { HelpTab } from "./tabs/help-tab";
import { useWhatsNew } from "@/hooks/use-whats-new";
import { isSelfHosted } from "@/core/features/self-hosted";
import type { SettingsTab } from "@/lib/go-to-settings";

interface SettingsTabsProps {
  activeTab: SettingsTab;
  onTabChange: (tab: SettingsTab) => void;
}

export function SettingsTabs({ activeTab, onTabChange }: SettingsTabsProps) {
  const whatsNew = useWhatsNew();
  const showSubscription = !isSelfHosted();

  return (
    <div className="space-y-4">
      <ToggleGroup
        type="single"
        value={activeTab}
        onValueChange={(v) => v && onTabChange(v as SettingsTab)}
        className="justify-start flex-wrap"
      >
        {showSubscription && (
          <ToggleGroupItem value="subscription" aria-label="Subscription">
            Subscription
          </ToggleGroupItem>
        )}
        <ToggleGroupItem value="sync-and-data" aria-label="Sync and data">
          Sync &amp; Data
        </ToggleGroupItem>
        <ToggleGroupItem value="reading" aria-label="Reading">
          Reading
        </ToggleGroupItem>
        <ToggleGroupItem value="help" aria-label="Help">
          Help
        </ToggleGroupItem>
      </ToggleGroup>

      {activeTab === "subscription" && showSubscription && <SubscriptionTab />}
      {activeTab === "sync-and-data" && <SyncAndDataTab />}
      {activeTab === "reading" && <ReadingTab />}
      {activeTab === "help" && <HelpTab onWhatsNew={() => void whatsNew()} />}
    </div>
  );
}
