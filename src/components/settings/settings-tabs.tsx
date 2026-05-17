/**
 * In-page Settings tab strip + content switch.
 *
 * The presentational shell — takes the active tab as a prop and emits
 * change events to its parent. `<SettingsPage>` wires those to the URL
 * `?tab=` param so the user can deep-link and the browser back button
 * walks tab history.
 *
 * Tabs match the prior dialog set (account / reading / help / import /
 * export). PR B will rename them along the new taxonomy.
 */
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ImportView } from "./import-view";
import { ExportView } from "./export-view";
import { AccountTab } from "./account-tab";
import { ReadingTab } from "./reading-tab";
import { HelpTab } from "./help-tab";
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
        <ToggleGroupItem value="account" aria-label="Account">
          Account
        </ToggleGroupItem>
        <ToggleGroupItem value="reading" aria-label="Reading">
          Reading
        </ToggleGroupItem>
        <ToggleGroupItem value="help" aria-label="Help">
          Help
        </ToggleGroupItem>
        <ToggleGroupItem value="import" aria-label="Import feeds">
          Import
        </ToggleGroupItem>
        <ToggleGroupItem value="export" aria-label="Export feeds">
          Export
        </ToggleGroupItem>
      </ToggleGroup>

      {activeTab === "account" && <AccountTab />}
      {activeTab === "reading" && <ReadingTab />}
      {activeTab === "help" && <HelpTab onWhatsNew={() => void whatsNew()} />}
      {activeTab === "import" && <ImportView onClose={() => onTabChange("account")} />}
      {activeTab === "export" && <ExportView />}
    </div>
  );
}
