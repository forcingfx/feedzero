/**
 * Generic grid used by Topics, Countries, and any future tile-based tab
 * (use cases, feed packs, bridge sources). Each cell shows a label,
 * optional emoji prefix, and feed count.
 */

export interface GridItem {
  id: string;
  label: string;
  sublabel?: string;
  feedCount: number;
}

interface CategoryGridProps {
  items: GridItem[];
  onSelect: (id: string) => void;
}

export function CategoryGrid({ items, onSelect }: CategoryGridProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {items.map((item) => (
        <button
          key={item.id}
          onClick={() => onSelect(item.id)}
          className="rounded-lg border p-4 text-left hover:bg-muted/50 transition-colors"
        >
          <div className="font-medium text-sm">
            {item.sublabel && <span className="mr-1.5">{item.sublabel}</span>}
            {item.label}
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            {item.feedCount} {item.feedCount === 1 ? "feed" : "feeds"}
          </div>
        </button>
      ))}
    </div>
  );
}
