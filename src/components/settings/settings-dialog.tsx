/**
 * Unified Settings dialog.
 *
 * Driven by useSettingsStore — no props. Mounted once at App level; any
 * caller anywhere in the tree can open it via openSettings(tab?) from
 * @/lib/open-settings. Default landing tab is "account" because that's
 * where tier / billing / sync / upgrade live.
 *
 * Phase A still shows the original three tabs (account / import / export);
 * Phase B expands to (account / reading / data / help) and folds in the
 * SyncSetupDialog and UpgradeDialog content as sections inside Account.
 */
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ImportView } from "./import-view";
import { ExportView } from "./export-view";
import { AccountTab } from "./account-tab";
import { ReadingTab } from "./reading-tab";
import { HelpTab } from "./help-tab";
import { useSettingsStore, type SettingsTab } from "@/stores/settings-store";
import { closeSettings } from "@/lib/open-settings";
import { useWhatsNew } from "@/hooks/use-whats-new";

export function SettingsDialog() {
  const open = useSettingsStore((s) => s.open);
  const activeTab = useSettingsStore((s) => s.activeTab);
  const setActiveTab = useSettingsStore((s) => s.setActiveTab);
  const whatsNew = useWhatsNew();

  // Close dialog before navigating so the user lands on the changelog
  // feed without a stale Settings dialog still visible.
  async function handleWhatsNew() {
    closeSettings();
    await whatsNew();
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && closeSettings()}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>

        <ToggleGroup
          type="single"
          value={activeTab}
          onValueChange={(v) => v && setActiveTab(v as SettingsTab)}
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
        {activeTab === "help" && <HelpTab onWhatsNew={handleWhatsNew} />}
        {activeTab === "import" && <ImportView onClose={closeSettings} />}
        {activeTab === "export" && <ExportView />}
      </DialogContent>
    </Dialog>
  );
}
