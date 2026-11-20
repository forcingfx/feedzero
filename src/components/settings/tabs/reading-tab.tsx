/**
 * Settings → Reading: the theme, and how an article looks when it is
 * open. What the article list shows is the List tab; retention,
 * organising and rules are the Library tab; Signal's settings are on the
 * Signal page. One tab used to hold all of it, about 17 controls.
 */
import { usePreferencesStore } from "@/stores/preferences-store";
import type { OpenArticlesIn, ReaderLineHeight, ReaderWidth } from "@feedzero/core/types";
import { ThemeToggle } from "../theme-toggle";
import { ReadingPreview } from "../reading-preview";
import { SegmentedControl, SettingRow, SettingsGroup, SizeStepper } from "../setting-row";
import { SIZE_STEPS } from "../size-steps";

export const READER_WIDTHS: { value: ReaderWidth; label: string }[] = [
  { value: "narrow", label: "Narrow" },
  { value: "medium", label: "Medium" },
  { value: "wide", label: "Wide" },
  { value: "full", label: "Full" },
];

const OPEN_ARTICLES_IN: { value: OpenArticlesIn; label: string }[] = [
  { value: "feed", label: "Feed text" },
  { value: "full-text", label: "Full text" },
];

export const LINE_HEIGHTS: { value: ReaderLineHeight; label: string }[] = [
  { value: "compact", label: "Compact" },
  { value: "normal", label: "Normal" },
  { value: "relaxed", label: "Relaxed" },
];

export function ReadingTab() {
  const prefs = usePreferencesStore((s) => s.preferences);
  const updatePreferences = usePreferencesStore((s) => s.update);

  return (
    <div data-testid="reading-tab" className="space-y-8 py-2">
      <SettingsGroup title="Appearance">
        <SettingRow label="Theme" description="Light, dark, or follow your system.">
          <ThemeToggle />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title="Article">
        <SettingRow
          label="Text size"
          description="Article text, relative to your device's text size."
        >
          <SizeStepper
            label="Text size"
            options={SIZE_STEPS}
            value={prefs.readerTextSize ?? "medium"}
            onChange={(value) => void updatePreferences({ readerTextSize: value })}
          />
        </SettingRow>
        <SettingRow label="Line spacing" description="Space between lines of article text.">
          <SegmentedControl
            label="Line spacing"
            options={LINE_HEIGHTS}
            value={prefs.readerLineHeight ?? "normal"}
            onChange={(value) => void updatePreferences({ readerLineHeight: value })}
          />
        </SettingRow>
        <SettingRow label="Reading width" description="How wide the article column gets.">
          <SegmentedControl
            label="Reading width"
            options={READER_WIDTHS}
            value={prefs.readerWidth ?? "medium"}
            onChange={(value) => void updatePreferences({ readerWidth: value })}
          />
        </SettingRow>
        <ReadingPreview
          textSize={prefs.readerTextSize ?? "medium"}
          width={prefs.readerWidth ?? "medium"}
          lineHeight={prefs.readerLineHeight ?? "normal"}
        />
        <SettingRow
          label="Open articles in"
          description="Full text fetches the whole article from the publisher when you open it. A folder or feed can choose differently in its own settings."
        >
          <SegmentedControl
            label="Open articles in"
            options={OPEN_ARTICLES_IN}
            value={prefs.openArticlesIn ?? "feed"}
            onChange={(value) => void updatePreferences({ openArticlesIn: value })}
          />
        </SettingRow>
      </SettingsGroup>
    </div>
  );
}
