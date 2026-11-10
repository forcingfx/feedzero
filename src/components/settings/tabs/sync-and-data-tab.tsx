/**
 * Sync & Data tab: Cloud sync, then import/export, then the danger zone.
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
import { SettingsGroup } from "@/components/settings/setting-row";

export function SyncAndDataTab() {
  return (
    <div className="py-2">
      <DataSyncSection>
        {/* Only renders when feed.folderId references a missing folder.
            Invisible on the common path; surfaces during half-applied
            sync states so users aren't confused by "missing" feeds. */}
        <OrphanedFeedsNotice />

        <div className="grid gap-8 md:grid-cols-2">
          <ImportExportCard title="Import">
            <ImportView onClose={() => undefined} />
          </ImportExportCard>
          <ImportExportCard title="Export">
            <ExportView />
          </ImportExportCard>
        </div>
      </DataSyncSection>
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
    <SettingsGroup title={title} className="min-w-0">
      <div className="py-3">{children}</div>
    </SettingsGroup>
  );
}
