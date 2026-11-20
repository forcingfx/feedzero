/**
 * Settings → List: row layout, and filtering and grouping, with a live
 * sample row.
 */
import { Switch } from "@/components/ui/switch";
import { useAppStore } from "@/stores/app-store";
import { usePreferencesStore } from "@/stores/preferences-store";
import { ListPreview } from "../list-preview";
import { SegmentedControl, SettingRow, SettingsGroup, SizeStepper } from "../setting-row";
import type { ArticleImagePosition } from "@feedzero/core/types";
import { SIZE_STEPS } from "../size-steps";

const IMAGE_POSITIONS: { value: ArticleImagePosition; label: string }[] = [
  { value: "left", label: "Left" },
  { value: "right", label: "Right" },
];

export function ListTab() {
  const groupArticleFloods = useAppStore((s) => s.groupArticleFloods);
  const setGroupArticleFloods = useAppStore((s) => s.setGroupArticleFloods);
  const prefs = usePreferencesStore((s) => s.preferences);
  const updatePreferences = usePreferencesStore((s) => s.update);

  return (
    <div data-testid="list-tab" className="space-y-8 py-2">
      <SettingsGroup title="Row layout">
        <SettingRow
          label="List size"
          description="Row text and spacing, relative to your device's text size."
        >
          <SizeStepper
            label="List size"
            options={SIZE_STEPS}
            value={prefs.listTextSize ?? "medium"}
            onChange={(value) => void updatePreferences({ listTextSize: value })}
          />
        </SettingRow>
        <SettingRow
          label="Show article preview"
          description="Up to two lines of each article's opening text under its title."
        >
          <Switch
            aria-label="Show article preview"
            checked={prefs.showArticlePreview ?? true}
            onCheckedChange={(v) => void updatePreferences({ showArticlePreview: !!v })}
          />
        </SettingRow>
        <SettingRow
          label="Show feed icons"
          description="Source favicons before the feed name on article rows in All items and folder views."
        >
          <Switch
            aria-label="Show feed icons"
            checked={prefs.showArticleFeedIcons ?? true}
            onCheckedChange={(v) => void updatePreferences({ showArticleFeedIcons: !!v })}
          />
        </SettingRow>
        <ListPreview
          size={prefs.listTextSize ?? "medium"}
          showPreview={prefs.showArticlePreview ?? true}
          showFeedIcon={prefs.showArticleFeedIcons ?? true}
        />
        <SettingRow
          label="Show article images"
          description="Each article's lead image in the list. Images load through FeedZero's proxy, but each is still a request to that article's image host, which can then see the articles in your list."
        >
          <Switch
            aria-label="Show article images"
            checked={prefs.showArticleImages ?? false}
            onCheckedChange={(v) => void updatePreferences({ showArticleImages: !!v })}
          />
        </SettingRow>
        <SettingRow
          label="Image position"
          description="Put article images on the left or the right of each row."
        >
          <SegmentedControl
            label="Image position"
            options={IMAGE_POSITIONS}
            value={prefs.articleImagePosition ?? "left"}
            onChange={(value) => void updatePreferences({ articleImagePosition: value })}
          />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title="Filtering and grouping">
        <SettingRow
          label="Hide read articles"
          description="Show only unread items. The article you have open stays until you move on."
        >
          <Switch
            aria-label="Hide read articles"
            checked={prefs.hideReadArticles ?? false}
            onCheckedChange={(v) => void updatePreferences({ hideReadArticles: !!v })}
          />
        </SettingRow>
        <SettingRow
          label="Group article floods"
          description="Collapse runs of articles from one feed posted close together."
        >
          <Switch
            aria-label="Group article floods"
            checked={groupArticleFloods}
            onCheckedChange={(v) => setGroupArticleFloods(!!v)}
          />
        </SettingRow>
      </SettingsGroup>
    </div>
  );
}
