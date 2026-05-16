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
import { useSettingsStore, type SettingsTab } from "@/stores/settings-store";
import { closeSettings } from "@/lib/open-settings";

export function SettingsDialog() {
  const open = useSettingsStore((s) => s.open);
  const activeTab = useSettingsStore((s) => s.activeTab);
  const setActiveTab = useSettingsStore((s) => s.setActiveTab);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && closeSettings()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>

        <ToggleGroup
          type="single"
          value={activeTab}
          onValueChange={(v) => v && setActiveTab(v as SettingsTab)}
          className="justify-start"
        >
          <ToggleGroupItem value="account" aria-label="Account">
            Account
          </ToggleGroupItem>
          <ToggleGroupItem value="import" aria-label="Import feeds">
            Import
          </ToggleGroupItem>
          <ToggleGroupItem value="export" aria-label="Export feeds">
            Export
          </ToggleGroupItem>
        </ToggleGroup>

        {activeTab === "account" && <AccountTab />}
        {activeTab === "import" && <ImportView onClose={closeSettings} />}
        {activeTab === "export" && <ExportView />}
      </DialogContent>
    </Dialog>
  );
}
