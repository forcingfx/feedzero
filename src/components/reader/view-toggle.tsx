import { Loader2 } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group.tsx";
import { Kbd } from "@/components/ui/kbd.tsx";

export type ViewMode = "feed" | "extracted";
export type ExtractionStatus = "idle" | "extracting" | "available" | "failed";

interface ViewToggleProps {
  activeMode: string;
  extractionStatus: ExtractionStatus;
  onModeChange: (mode: ViewMode) => void;
}

export function ViewToggle({
  activeMode,
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
          Full text
          <Kbd className="ml-1.5">h</Kbd>
        </ToggleGroupItem>
      </ToggleGroup>
    </div>
  );
}
