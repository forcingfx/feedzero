/**
 * Settings → Reading. Rows under four headings:
 *   Appearance (theme, type), Reading (how articles open and what the
 *   list shows), Feeds (organising), Signal.
 *
 * AutoOrganize stays as its own modal; this tab is the launcher.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useAppStore } from "@/stores/app-store";
import { useFeedStore } from "@/stores/feed-store";
import { usePreferencesStore } from "@/stores/preferences-store";
import type {
  OpenArticlesIn,
  ReaderLineHeight,
  ReaderTextSize,
  ReaderWidth,
} from "@feedzero/core/types";
import { AutoOrganizeDialog } from "@/components/folders/auto-organize-dialog";
import { ThemeToggle } from "../theme-toggle";
import { RulesAuditPanel } from "./rules-audit-panel";
import { SignalSection } from "../signal-section";
import { ArticleRetentionSetting } from "../article-retention-setting";
import { SegmentedControl, SettingRow, SettingsGroup } from "../setting-row";

const TEXT_SIZES: { value: ReaderTextSize; label: string }[] = [
  { value: "small", label: "Small" },
  { value: "medium", label: "Medium" },
  { value: "large", label: "Large" },
  { value: "x-large", label: "Extra large" },
];

const READER_WIDTHS: { value: ReaderWidth; label: string }[] = [
  { value: "narrow", label: "Narrow" },
  { value: "medium", label: "Medium" },
  { value: "wide", label: "Wide" },
  { value: "full", label: "Full" },
];

const OPEN_ARTICLES_IN: { value: OpenArticlesIn; label: string }[] = [
  { value: "feed", label: "Feed text" },
  { value: "full-text", label: "Full text" },
];

const LINE_HEIGHTS: { value: ReaderLineHeight; label: string }[] = [
  { value: "compact", label: "Compact" },
  { value: "normal", label: "Normal" },
  { value: "relaxed", label: "Relaxed" },
];

export function ReadingTab() {
  const groupArticleFloods = useAppStore((s) => s.groupArticleFloods);
  const setGroupArticleFloods = useAppStore((s) => s.setGroupArticleFloods);
  const prefs = usePreferencesStore((s) => s.preferences);
  const updatePreferences = usePreferencesStore((s) => s.update);
  const hasFeeds = useFeedStore((s) => s.feeds.length > 0);
  const [autoOrganizeOpen, setAutoOrganizeOpen] = useState(false);

  return (
    <div className="space-y-8 py-2">
      <SettingsGroup title="Appearance">
        <SettingRow label="Theme" description="Light, dark, or follow your system.">
          <ThemeToggle />
        </SettingRow>
        <SettingRow label="Text size" description="Body text size in the reader.">
          <SegmentedControl
            label="Text size"
            options={TEXT_SIZES}
            value={prefs.readerTextSize ?? "medium"}
            onChange={(value) => void updatePreferences({ readerTextSize: value })}
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
        <SettingRow label="Line spacing" description="Space between lines of article text.">
          <SegmentedControl
            label="Line spacing"
            options={LINE_HEIGHTS}
            value={prefs.readerLineHeight ?? "normal"}
            onChange={(value) => void updatePreferences({ readerLineHeight: value })}
          />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title="Reading">
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
          label="Show feed icons"
          description="Source favicons on article rows in All items and folder views."
        >
          <Switch
            aria-label="Show feed icons"
            checked={prefs.showArticleFeedIcons ?? true}
            onCheckedChange={(v) => void updatePreferences({ showArticleFeedIcons: !!v })}
          />
        </SettingRow>
        <SettingRow
          label="Show article images"
          description="Each article's lead image in the list. Images load through FeedZero's proxy, but each is still a request to that article's image host, so it learns what you are reading."
        >
          <Switch
            aria-label="Show article images"
            checked={prefs.showArticleImages ?? false}
            onCheckedChange={(v) => void updatePreferences({ showArticleImages: !!v })}
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
        <ArticleRetentionSetting />
      </SettingsGroup>

      <SettingsGroup title="Feeds">
        {hasFeeds && (
          <SettingRow
            label="Auto-organize feeds"
            description="Group your feeds into topic folders. You can rename topics, add keywords, and remove ones that don't fit."
          >
            <Button type="button" variant="outline" size="sm" onClick={() => setAutoOrganizeOpen(true)}>
              Auto-organize…
            </Button>
          </SettingRow>
        )}
        <RulesAuditPanel />
      </SettingsGroup>

      <SignalSection />

      <AutoOrganizeDialog open={autoOrganizeOpen} onOpenChange={setAutoOrganizeOpen} />
    </div>
  );
}
