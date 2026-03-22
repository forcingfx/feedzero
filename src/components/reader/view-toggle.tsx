import { ExternalLink, Loader2 } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group.tsx";
import { Kbd } from "@/components/ui/kbd.tsx";

export type ViewMode = "feed" | "extracted" | "original";
export type ExtractionStatus = "idle" | "extracting" | "available" | "failed";

interface ViewToggleProps {
  activeMode: string;
  articleLink?: string;
  extractionStatus: ExtractionStatus;
  onModeChange: (mode: ViewMode) => void;
}

/**
 * Always-visible toolbar for switching between content modes.
 * All three buttons are always rendered — never hidden.
 */
export function ViewToggle({
  activeMode,
  articleLink,
  extractionStatus,
  onModeChange,
}: ViewToggleProps) {
  const extractedDisabled =
    extractionStatus === "extracting" || extractionStatus === "failed";

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
        <ToggleGroupItem value="feed">Feed</ToggleGroupItem>

        <ToggleGroupItem
          value="extracted"
          disabled={extractedDisabled}
          title={
            extractionStatus === "failed"
              ? "Extraction didn't find additional content"
              : extractionStatus === "extracting"
                ? "Extracting full article…"
                : undefined
          }
        >
          {extractionStatus === "extracting" ? (
            <Loader2 className="size-3 animate-spin mr-1" />
          ) : null}
          Extracted
          <Kbd className="ml-1.5">E</Kbd>
        </ToggleGroupItem>

        <ToggleGroupItem
          value="original"
          disabled={!articleLink}
          title={!articleLink ? "No link available" : undefined}
          asChild={!!articleLink}
        >
          {articleLink ? (
            <a href={articleLink} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="size-3" />
              Original
              <Kbd className="ml-1.5">O</Kbd>
            </a>
          ) : (
            <>
              <ExternalLink className="size-3" />
              Original
              <Kbd className="ml-1.5">O</Kbd>
            </>
          )}
        </ToggleGroupItem>
      </ToggleGroup>
    </div>
  );
}
