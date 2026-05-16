import { Cloud, Loader2, CloudAlert } from "lucide-react";
import { useSyncStore } from "@/stores/sync-store";
import { Switch } from "@/components/ui/switch";
import { requestSyncSetup } from "@/lib/request-sync-setup";

export function SyncStatusChip() {
  const status = useSyncStore((s) => s.status);

  const isOn = status === "synced" || status === "syncing";
  const isError = status === "error";
  const isSyncing = status === "syncing";

  function handleToggle() {
    // Gated: free users hit UpgradeDialog instead of starting a flow they
    // can't complete. See src/lib/request-sync-setup.ts.
    requestSyncSetup();
  }

  return (
    <button
      onClick={handleToggle}
      className="flex items-center gap-2 w-full rounded-md px-2 py-1.5 text-xs text-muted-foreground font-normal hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
    >
      {isSyncing ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : isError ? (
        <CloudAlert className="size-3.5 text-destructive" />
      ) : (
        <Cloud className="size-3.5" />
      )}
      <span className="flex-1 text-left">Cloud sync</span>
      <Switch
        size="sm"
        checked={isOn}
        onCheckedChange={handleToggle}
        onClick={(e) => e.stopPropagation()}
        className={isError ? "data-[state=checked]:bg-destructive" : ""}
      />
    </button>
  );
}
