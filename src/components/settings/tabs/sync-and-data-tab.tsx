/**
 * Sync & Data tab — sync controls, import/export, danger zone.
 *
 * Brings every "data lifecycle" concern into one place:
 *   - Cloud sync toggle (gated by license tier on hosted; by /api/sync
 *     reachability when self-hosted)
 *   - Passphrase-recovery note (shown only when sync is enabled)
 *   - Delete all data and reset app (always clickable — independent of
 *     licensing; matches user spec)
 *   - OPML / URL-list import + export (rendered side-by-side at ≥md)
 */
import { DataSyncSection } from "@/components/settings/data-sync-section";
import { ImportView } from "@/components/settings/import-view";
import { ExportView } from "@/components/settings/export-view";
import { OrphanedFeedsNotice } from "@/components/settings/orphaned-feeds-notice";

export function SyncAndDataTab() {
  return (
    <div className="space-y-4 py-2">
      <DataSyncSection />

      {/* Only renders when feed.folderId references a missing folder.
          Invisible on the common path; surfaces during half-applied
          sync states so users aren't confused by "missing" feeds. */}
      <OrphanedFeedsNotice />

      <div className="grid gap-4 md:grid-cols-2">
        <ImportExportCard title="Import">
          <ImportView onClose={() => undefined} />
        </ImportExportCard>
        <ImportExportCard title="Export">
          <ExportView />
        </ImportExportCard>
      </div>
    </div>
  );
}

function ImportExportCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-card p-4 space-y-3">
      <h3 className="text-sm font-semibold">{title}</h3>
      {children}
    </div>
  );
}
