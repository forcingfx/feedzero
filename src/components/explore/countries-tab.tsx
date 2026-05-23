import { useState } from "react";
import type { GeneratedCatalog } from "@/lib/catalog-search.ts";
import { CategoryGrid, type GridItem } from "@/components/explore/category-grid.tsx";
import { CategoryDetail } from "@/components/explore/category-detail.tsx";
import type { Feed } from "@feedzero/core/types";

interface CountriesTabProps {
  catalog: GeneratedCatalog;
  subscribedFeeds: Feed[];
  selectedRowId: string | null;
  onSelectRow: (url: string) => void;
}

/** Browse-by-country tab. Single-level drill: country grid → feed list. */
export function CountriesTab({
  catalog,
  subscribedFeeds,
  selectedRowId,
  onSelectRow,
}: CountriesTabProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = catalog.countries.find((c) => c.id === selectedId);

  if (selected) {
    return (
      <CategoryDetail
        title={selected.name}
        subtitle={selected.emoji}
        feeds={selected.feeds}
        subscribedFeeds={subscribedFeeds}
        onBack={() => setSelectedId(null)}
        selectedRowId={selectedRowId}
        onSelectRow={onSelectRow}
      />
    );
  }

  const items: GridItem[] = catalog.countries.map((c) => ({
    id: c.id,
    label: c.name,
    sublabel: c.emoji,
    feedCount: c.feeds.filter((f) => f.healthy).length,
  }));

  return <CategoryGrid items={items} onSelect={setSelectedId} />;
}
