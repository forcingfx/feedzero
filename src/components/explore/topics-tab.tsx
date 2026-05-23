import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import type { CatalogSection, GeneratedCatalog } from "@/lib/catalog-search.ts";
import { Button } from "@/components/ui/button.tsx";
import { CategoryGrid, type GridItem } from "@/components/explore/category-grid.tsx";
import { CategoryDetail } from "@/components/explore/category-detail.tsx";
import type { Feed } from "@feedzero/core/types";

interface TopicsTabProps {
  catalog: GeneratedCatalog;
  subscribedFeeds: Feed[];
  selectedRowId: string | null;
  onSelectRow: (url: string) => void;
}

/**
 * Browse-by-topic tab. Two-level drill: section grid → subcategory
 * grid → feed list. Sections with a single subcategory skip the
 * intermediate grid and go straight to feeds.
 */
export function TopicsTab({
  catalog,
  subscribedFeeds,
  selectedRowId,
  onSelectRow,
}: TopicsTabProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = catalog.sections.find((s) => s.id === selectedId);

  if (selected) {
    return (
      <SectionDetail
        section={selected}
        subscribedFeeds={subscribedFeeds}
        onBack={() => setSelectedId(null)}
        selectedRowId={selectedRowId}
        onSelectRow={onSelectRow}
      />
    );
  }

  const items: GridItem[] = catalog.sections.map((s) => ({
    id: s.id,
    label: s.name,
    sublabel: s.emoji,
    feedCount: s.subcategories.reduce(
      (sum, sub) => sum + sub.feeds.filter((f) => f.healthy).length,
      0,
    ),
  }));

  return <CategoryGrid items={items} onSelect={setSelectedId} />;
}

function SectionDetail({
  section,
  subscribedFeeds,
  onBack,
  selectedRowId,
  onSelectRow,
}: {
  section: CatalogSection;
  subscribedFeeds: Feed[];
  onBack: () => void;
  selectedRowId?: string | null;
  onSelectRow?: (url: string) => void;
}) {
  const [selectedSubId, setSelectedSubId] = useState<string | null>(null);
  const selectedSub = section.subcategories.find((s) => s.id === selectedSubId);

  if (selectedSub) {
    return (
      <CategoryDetail
        title={selectedSub.name}
        feeds={selectedSub.feeds}
        subscribedFeeds={subscribedFeeds}
        onBack={() => setSelectedSubId(null)}
        selectedRowId={selectedRowId}
        onSelectRow={onSelectRow}
      />
    );
  }

  if (section.subcategories.length === 1) {
    return (
      <CategoryDetail
        title={section.name}
        subtitle={section.emoji}
        feeds={section.subcategories[0].feeds}
        subscribedFeeds={subscribedFeeds}
        onBack={onBack}
        selectedRowId={selectedRowId}
        onSelectRow={onSelectRow}
      />
    );
  }

  const items: GridItem[] = section.subcategories.map((sub) => ({
    id: sub.id,
    label: sub.name,
    feedCount: sub.feeds.filter((f) => f.healthy).length,
  }));

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="size-4" />
          Back
        </Button>
      </div>
      <h2 className="text-lg font-medium mb-4">
        <span className="mr-1.5">{section.emoji}</span>
        {section.name}
      </h2>
      <CategoryGrid items={items} onSelect={setSelectedSubId} />
    </div>
  );
}
