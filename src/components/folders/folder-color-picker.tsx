import { FOLDER_COLORS } from "@/lib/folder-colors.ts";

interface FolderColorPickerProps {
  value: string | undefined;
  onChange: (color: string | undefined) => void;
}

/**
 * 8-swatch color picker for folders. Click toggles — selecting the
 * current color clears it (back to default). Extracted from the
 * original sidebar dropdown so it can be reused in the folder
 * settings dialog without duplication.
 */
export function FolderColorPicker({ value, onChange }: FolderColorPickerProps) {
  return (
    <div data-testid="folder-color-picker" className="flex gap-1.5 flex-wrap">
      {FOLDER_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          className="size-7 rounded-full border-2 transition-transform hover:scale-110 focus-visible:ring-1 focus-visible:ring-offset-1"
          style={{
            backgroundColor: c,
            borderColor: value === c ? "#fff" : "transparent",
            outline: value === c ? `2px solid ${c}` : undefined,
          }}
          aria-label={`Set folder color ${c}`}
          aria-pressed={value === c}
          onClick={() => onChange(value === c ? undefined : c)}
        />
      ))}
    </div>
  );
}
