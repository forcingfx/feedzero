import { ExternalLink } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group.tsx";
import { Kbd } from "@/components/ui/kbd.tsx";

export type ViewMode = "feed" | "extracted" | "original";

interface ViewToggleProps {
  modes: string[];
  activeMode: string;
  articleLink?: string;
  onModeChange: (mode: ViewMode) => void;
}

export function ViewToggle({
  modes,
  activeMode,
  articleLink,
  onModeChange,
}: ViewToggleProps) {
  // Always show if there's a link (for Original) or multiple content modes
  if (modes.length <= 1 && !articleLink) return null;

  return (
    <div className="flex items-center gap-2 mb-4">
      <ToggleGroup
        type="single"
        variant="outline"
        value={activeMode}
        onValueChange={(value) => {
          if (value) onModeChange(value as ViewMode);
        }}
        className="shadow-sm"
      >
        {modes.map((mode) => (
          <ToggleGroupItem key={mode} value={mode}>
            {mode === "feed" ? "Feed" : "Extracted"}
            {mode === "extracted" && <Kbd className="ml-1.5">E</Kbd>}
          </ToggleGroupItem>
        ))}
        {articleLink && (
          <ToggleGroupItem value="original" asChild>
            <a href={articleLink} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="size-3" />
              Original
              <Kbd className="ml-1.5">O</Kbd>
            </a>
          </ToggleGroupItem>
        )}
      </ToggleGroup>
    </div>
  );
}
