/**
 * In-page Settings tab strip + content switch.
 *
 * The presentational shell — takes the active tab as a prop and emits
 * change events to its parent. `<SettingsPage>` wires those to the URL
 * `?tab=` param so the user can deep-link and the browser back button
 * walks tab history.
 *
 * Tabs answer one question each:
 *   - Subscription : what plan am I on and how do I pay for it?
 *   - Recovery     : how do I get back in if I lose this device?
 *   - Data         : where does my data live, and how do I move it?
 *   - Reading      : how should articles be presented?
 *   - Help         : keyboard shortcuts, support, what's new.
 */
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { SubscriptionTab } from "./tabs/subscription-tab";
import { RecoveryTab } from "./tabs/recovery-tab";
import { DataTab } from "./tabs/data-tab";
import { ReadingTab } from "./tabs/reading-tab";
import { HelpTab } from "./tabs/help-tab";
import { useWhatsNew } from "@/hooks/use-whats-new";
import type { SettingsTab } from "@/lib/go-to-settings";

interface SettingsTabsProps {
  activeTab: SettingsTab;
  onTabChange: (tab: SettingsTab) => void;
}

export function SettingsTabs({ activeTab, onTabChange }: SettingsTabsProps) {
  const whatsNew = useWhatsNew();

  return (
    <div className="space-y-4">
      <ToggleGroup
        type="single"
        value={activeTab}
        onValueChange={(v) => v && onTabChange(v as SettingsTab)}
        className="justify-start flex-wrap"
      >
        <ToggleGroupItem value="subscription" aria-label="Subscription">
          Subscription
        </ToggleGroupItem>
        <ToggleGroupItem value="recovery" aria-label="Recovery">
          Recovery
        </ToggleGroupItem>
        <ToggleGroupItem value="data" aria-label="Data">
          Data
        </ToggleGroupItem>
        <ToggleGroupItem value="reading" aria-label="Reading">
          Reading
        </ToggleGroupItem>
        <ToggleGroupItem value="help" aria-label="Help">
          Help
        </ToggleGroupItem>
      </ToggleGroup>

      {activeTab === "subscription" && <SubscriptionTab />}
      {activeTab === "recovery" && <RecoveryTab />}
      {activeTab === "data" && <DataTab />}
      {activeTab === "reading" && <ReadingTab />}
      {activeTab === "help" && <HelpTab onWhatsNew={() => void whatsNew()} />}
    </div>
  );
}
