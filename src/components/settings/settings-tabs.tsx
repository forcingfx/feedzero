/**
 * In-page Settings tab strip + content switch.
 *
 * The presentational shell — takes the active tab as a prop and emits
 * change events to its parent. `<SettingsPage>` wires those to the URL
 * `?tab=` param so the user can deep-link and the browser back button
 * walks tab history.
 *
 * Tabs answer one question each:
 *   - Reading       : how should an open article look?
 *   - List          : what should the article list show?
 *   - Library       : how long are articles kept, and how are feeds organised?
 *   - Sync & Data   : where does my data live, and how do I move it?
 *   - Subscription  : what plan am I on, and how do I activate / pay for it?
 *   - Help          : keyboard shortcuts, support, what's new.
 *
 * Signal's settings are on the Signal page (its mode badge opens them).
 * Legacy `?tab=briefings` deep-links go there (see settings-page.tsx).
 *
 * Self-hosters never see Subscription (their tier check is bypassed by
 * `isSelfHosted()` — there's no billing UI to surface).
 */
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { SubscriptionTab } from "./tabs/subscription-tab";
import { SyncAndDataTab } from "./tabs/sync-and-data-tab";
import { ReadingTab } from "./tabs/reading-tab";
import { ListTab } from "./tabs/list-tab";
import { LibraryTab } from "./tabs/library-tab";
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
      {/* One row that scrolls sideways: six tabs do not fit a phone, and
          wrapping them into a block pushed the settings down the page.
          The negative margin lets the row scroll to the screen edge.
          `w-auto` is what makes it scroll at all: ToggleGroup is `w-fit`
          by default, so the row grew to its content's width and pushed
          the whole page sideways instead (bug, 2026-11-20). */}
      <ToggleGroup
        type="single"
        value={activeTab}
        onValueChange={(v) => v && onTabChange(v as SettingsTab)}
        className="-mx-4 w-auto justify-start overflow-x-auto px-4 [scrollbar-width:none] [&>*]:shrink-0"
      >
        {/* Reading, List and Library first: they are what people open
            Settings to change. Subscription sits after the data controls
            (audit 2026-Q4). */}
        <ToggleGroupItem value="reading" aria-label="Reading">
          Reading
        </ToggleGroupItem>
        <ToggleGroupItem value="list" aria-label="List">
          List
        </ToggleGroupItem>
        <ToggleGroupItem value="library" aria-label="Library">
          Library
        </ToggleGroupItem>
        <ToggleGroupItem value="sync-and-data" aria-label="Sync and data">
          Sync &amp; Data
        </ToggleGroupItem>
        {showSubscription && (
          <ToggleGroupItem value="subscription" aria-label="Subscription">
            Subscription
          </ToggleGroupItem>
        )}
        <ToggleGroupItem value="help" aria-label="Help">
          Help
        </ToggleGroupItem>
      </ToggleGroup>

      {activeTab === "subscription" && showSubscription && <SubscriptionTab />}
      {activeTab === "sync-and-data" && <SyncAndDataTab />}
      {activeTab === "reading" && <ReadingTab />}
      {activeTab === "list" && <ListTab />}
      {activeTab === "library" && <LibraryTab />}
      {activeTab === "help" && <HelpTab onWhatsNew={() => void whatsNew()} />}
    </div>
  );
}
