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
      value={activeMode}
      onValueChange={(value) => {
        if (value) onModeChange(value as "feed" | "extracted");
      }}
      className="mb-md"
    >
      {modes.map((mode) => (
        <ToggleGroupItem key={mode} value={mode} className="text-sm">
          {mode === "feed" ? "Feed" : "Extracted"}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
