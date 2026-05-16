import { useState } from "react";
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

type SettingsView = "import" | "export" | "account";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const [view, setView] = useState<SettingsView>("import");

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setView("import");
    }
    onOpenChange(nextOpen);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>

        <ToggleGroup
          type="single"
          value={view}
          onValueChange={(v) => v && setView(v as SettingsView)}
          className="justify-start"
        >
          <ToggleGroupItem value="import" aria-label="Import feeds">
            Import
          </ToggleGroupItem>
          <ToggleGroupItem value="export" aria-label="Export feeds">
            Export
          </ToggleGroupItem>
          <ToggleGroupItem value="account" aria-label="Account">
            Account
          </ToggleGroupItem>
        </ToggleGroup>

        {view === "import" && <ImportView onClose={() => onOpenChange(false)} />}
        {view === "export" && <ExportView />}
        {view === "account" && <AccountTab />}
      </DialogContent>
    </Dialog>
  );
}
