import { CloudOff, Cloud, Loader2, CloudAlert } from "lucide-react";
import { useSyncStore, type SyncStatus } from "@/stores/sync-store";

const STATUS_CONFIG = {
  "local-only": { icon: CloudOff, label: "Local only" },
  syncing: { icon: Loader2, label: "Syncing..." },
  synced: { icon: Cloud, label: "Synced" },
  error: { icon: CloudAlert, label: "Sync error" },
} as const;

const STATUS_COLOR_CLASS: Record<SyncStatus, string> = {
  "local-only": "text-sync-local bg-sync-local-bg",
  syncing: "text-muted-foreground bg-muted",
  synced: "text-sync-synced bg-sync-synced-bg",
  error: "text-sync-error bg-sync-error-bg",
};

export function SyncStatusChip() {
  const status = useSyncStore((s) => s.status);
  const setDialogOpen = useSyncStore((s) => s.setDialogOpen);

  const config = STATUS_CONFIG[status];
  const Icon = config.icon;
  const colorClass = STATUS_COLOR_CLASS[status];

  return (
    <button
      onClick={() => setDialogOpen(true)}
      className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors w-full ${colorClass}`}
    >
      <Icon
        className={`size-3.5 ${status === "syncing" ? "animate-spin" : ""}`}
      />
      <span>{config.label}</span>
    </button>
  );
}
