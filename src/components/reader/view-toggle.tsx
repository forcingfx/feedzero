import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group.tsx";

interface ViewToggleProps {
  modes: string[];
  activeMode: string;
  onModeChange: (mode: "feed" | "extracted") => void;
}

export function ViewToggle({
  modes,
  activeMode,
  onModeChange,
}: ViewToggleProps) {
  if (modes.length <= 1) return null;

  return (
    <ToggleGroup
      type="single"
      variant="outline"
      value={activeMode}
      onValueChange={(value) => {
        if (value) onModeChange(value as "feed" | "extracted");
      }}
      className="mb-4 shadow-sm"
    >
      {modes.map((mode) => (
        <ToggleGroupItem key={mode} value={mode}>
          {mode === "feed" ? "Feed" : "Extracted"}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
