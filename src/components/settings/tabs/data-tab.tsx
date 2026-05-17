/**
 * Data tab — sync controls, import/export, danger zone.
 *
 * Brings together every "data lifecycle" concern in one place:
 *   - Cloud sync enable/disable, restore from cloud, log out
 *   - OPML / URL-list import + export (rendered side-by-side at ≥md)
 *   - Danger zone (delete all data — gated for free tier only)
 *   - [PR C] Lost-passphrase callout
 */
import { DataSyncSection } from "@/components/settings/data-sync-section";
import { ImportView } from "@/components/settings/import-view";
import { ExportView } from "@/components/settings/export-view";
import { LostPassphrasePanel } from "@/components/settings/tabs/lost-passphrase-panel";

export function DataTab() {
  return (
    <div className="space-y-4 py-2">
      <DataSyncSection />

      <LostPassphrasePanel />

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
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <h3 className="text-sm font-semibold">{title}</h3>
      {children}
    </div>
  );
}
