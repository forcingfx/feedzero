/**
 * Reading preferences — Settings → Reading tab.
 *
 * Folds in the reading-adjacent items that used to live in the sidebar
 * SettingsMenu dropdown:
 *   - Group article floods (toggle, persists via useAppStore)
 *   - Auto-organize feeds (button → existing AutoOrganizeDialog)
 *
 * AutoOrganize stays as its own modal — the multi-step flow wants its
 * own surface. Reading tab is the launcher.
 */
import { useState } from "react";
import {
  CheckCheck,
  Image as ImageIcon,
  Layers,
  MoveHorizontal,
  Type,
  Wand2,
  Palette,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/stores/app-store";
import { useFeedStore } from "@/stores/feed-store";
import { usePreferencesStore } from "@/stores/preferences-store";
import type { ReaderTextSize, ReaderWidth } from "@feedzero/core/types";

const TEXT_SIZES: { value: ReaderTextSize; label: string }[] = [
  { value: "small", label: "Small" },
  { value: "medium", label: "Medium" },
  { value: "large", label: "Large" },
];

const READER_WIDTHS: { value: ReaderWidth; label: string }[] = [
  { value: "narrow", label: "Narrow" },
  { value: "medium", label: "Medium" },
  { value: "wide", label: "Wide" },
];
import { AutoOrganizeDialog } from "@/components/folders/auto-organize-dialog";
import { ThemeToggle } from "../theme-toggle";
import { RulesAuditPanel } from "./rules-audit-panel";
import { SignalSection } from "../signal-section";

export function ReadingTab() {
  const groupArticleFloods = useAppStore((s) => s.groupArticleFloods);
  const setGroupArticleFloods = useAppStore((s) => s.setGroupArticleFloods);
  const readerTextSize = usePreferencesStore(
    (s) => s.preferences.readerTextSize ?? "medium",
  );
  const readerWidth = usePreferencesStore(
    (s) => s.preferences.readerWidth ?? "medium",
  );
  const hideReadArticles = usePreferencesStore(
    (s) => s.preferences.hideReadArticles ?? false,
  );
  const showArticleFeedIcons = usePreferencesStore(
    (s) => s.preferences.showArticleFeedIcons ?? true,
  );
  const updatePreferences = usePreferencesStore((s) => s.update);
  const hasFeeds = useFeedStore((s) => s.feeds.length > 0);
  const [autoOrganizeOpen, setAutoOrganizeOpen] = useState(false);

  return (
    <div className="space-y-4 py-2">
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Palette className="size-4 text-muted-foreground" />
          <p className="text-sm font-medium">Theme</p>
        </div>
        <p className="text-xs text-muted-foreground">
          Light, dark, or follow your system.
        </p>
        <ThemeToggle />
      </div>

      <SegmentedPreference
        icon={<Type className="size-4 text-muted-foreground" />}
        title="Text size"
        description="Body text size in the reader."
        options={TEXT_SIZES}
        value={readerTextSize}
        onChange={(value) => void updatePreferences({ readerTextSize: value })}
      />

      <SegmentedPreference
        icon={<MoveHorizontal className="size-4 text-muted-foreground" />}
        title="Reading width"
        description="How wide the article column gets before it stops growing."
        options={READER_WIDTHS}
        value={readerWidth}
        onChange={(value) => void updatePreferences({ readerWidth: value })}
      />

      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <CheckCheck className="size-4 text-muted-foreground shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-medium">Hide read articles</p>
              <p className="text-xs text-muted-foreground">
                Show only unread items, so the list empties as you work
                through it. The article you have open stays put until you
                move on.
              </p>
            </div>
          </div>
          <Switch
            aria-label="Hide read articles"
            checked={hideReadArticles}
            onCheckedChange={(v) =>
              void updatePreferences({ hideReadArticles: !!v })
            }
          />
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <ImageIcon className="size-4 text-muted-foreground shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-medium">Show feed icons</p>
              <p className="text-xs text-muted-foreground">
                Source favicons on article rows in All items and folder
                views. Feed names stay either way.
              </p>
            </div>
          </div>
          <Switch
            aria-label="Show feed icons"
            checked={showArticleFeedIcons}
            onCheckedChange={(v) =>
              void updatePreferences({ showArticleFeedIcons: !!v })
            }
          />
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Layers className="size-4 text-muted-foreground shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-medium">Group article floods</p>
              <p className="text-xs text-muted-foreground">
                Collapse runs of articles from the same feed posted close
                together so they don&apos;t crowd the timeline.
              </p>
            </div>
          </div>
          <Switch
            aria-label="Group article floods"
            checked={groupArticleFloods}
            onCheckedChange={(v) => setGroupArticleFloods(!!v)}
          />
        </div>
      </div>

      {hasFeeds && (
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Wand2 className="size-4 text-muted-foreground" />
            <p className="text-sm font-medium">Auto-organize feeds</p>
          </div>
          <p className="text-xs text-muted-foreground">
            Group your feeds into topic folders automatically. You can rename
            topics, add keywords, and remove ones that don&apos;t fit.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setAutoOrganizeOpen(true)}
          >
            <Wand2 className="mr-2 size-4" />
            Auto-organize feeds…
          </Button>
        </div>
      )}

      <SignalSection />

      <RulesAuditPanel />

      <AutoOrganizeDialog
        open={autoOrganizeOpen}
        onOpenChange={setAutoOrganizeOpen}
      />
    </div>
  );
}

/**
 * One labelled card holding a segmented (single-choice) preference.
 *
 * `role="group"` + `aria-label` matter beyond a11y hygiene: the tab now
 * carries two segmented controls that both offer a "Medium" option, so
 * without the grouping neither a screen reader nor a test can say which
 * "Medium" it means.
 */
function SegmentedPreference<T extends string>({
  icon,
  title,
  description,
  options,
  value,
  onChange,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        {icon}
        <p className="text-sm font-medium">{title}</p>
      </div>
      <p className="text-xs text-muted-foreground">{description}</p>
      <div
        role="group"
        aria-label={title}
        className="flex rounded-md border border-border overflow-hidden w-fit"
      >
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
            className={cn(
              "px-3 py-1.5 text-xs transition-colors",
              value === option.value
                ? "bg-foreground text-background font-medium"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
