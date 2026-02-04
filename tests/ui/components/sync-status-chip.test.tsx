import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { SyncStatusChip } from "@/components/sync/sync-status-chip";
import { useSyncStore } from "@/stores/sync-store";
import type { SyncStatus } from "@/stores/sync-store";

describe("SyncStatusChip", () => {
  beforeEach(() => {
    useSyncStore.setState({
      status: "local-only",
      passphrase: null,
      lastSyncedAt: null,
      error: null,
    });
  });

  const STATUS_EXPECTED_CLASSES: Record<SyncStatus, { text: string; bg: string }> = {
    "local-only": { text: "text-sync-local", bg: "bg-sync-local-bg" },
    syncing: { text: "text-muted-foreground", bg: "bg-muted" },
    synced: { text: "text-sync-synced", bg: "bg-sync-synced-bg" },
    error: { text: "text-sync-error", bg: "bg-sync-error-bg" },
  };

  for (const [status, expected] of Object.entries(STATUS_EXPECTED_CLASSES)) {
    it(`renders with ${expected.text} and ${expected.bg} classes for "${status}" status`, () => {
      useSyncStore.setState({ status: status as SyncStatus });
      render(<SyncStatusChip />);

      const button = screen.getByRole("button");
      expect(button.className).toContain(expected.text);
      expect(button.className).toContain(expected.bg);
    });
  }

  const STATUS_LABELS: Record<SyncStatus, string> = {
    "local-only": "Local only",
    syncing: "Syncing...",
    synced: "Synced",
    error: "Sync error",
  };

  for (const [status, label] of Object.entries(STATUS_LABELS)) {
    it(`renders "${label}" label for "${status}" status`, () => {
      useSyncStore.setState({ status: status as SyncStatus });
      render(<SyncStatusChip />);

      expect(screen.getByText(label)).toBeDefined();
    });
  }
});
