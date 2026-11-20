import { useIsDesktop } from "@/hooks/use-media-query.ts";
import { usePreferencesStore } from "@/stores/preferences-store.ts";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover.tsx";
import { SegmentedControl, SizeStepper } from "@/components/settings/setting-row.tsx";
import { LINE_HEIGHTS, READER_WIDTHS, SIZE_STEPS } from "@/components/settings/size-steps.ts";

/** One labelled control inside the menu. */
function MenuRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

/**
 * The reader's "Aa" menu: text size, line spacing and width, changed
 * while the article they affect is on screen. The same preferences as
 * Settings → Reading; this is the place to reach them mid-read.
 *
 * Width is desktop only. On a phone the article fills the screen at
 * every width, so the control would do nothing there.
 */
export function ReaderTypeMenu({ triggerClassName }: { triggerClassName?: string }) {
  const isDesktop = useIsDesktop();
  const prefs = usePreferencesStore((s) => s.preferences);
  const update = usePreferencesStore((s) => s.update);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" aria-label="Text settings" className={triggerClassName}>
          <span aria-hidden="true" className="text-xs font-semibold max-lg:text-sm">
            Aa
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        role="dialog"
        aria-label="Text settings"
        align="start"
        className="w-auto min-w-64 space-y-3 p-3"
      >
        <MenuRow label="Text size">
          <SizeStepper
            label="Text size"
            options={SIZE_STEPS}
            value={prefs.readerTextSize ?? "medium"}
            onChange={(value) => void update({ readerTextSize: value })}
          />
        </MenuRow>
        <MenuRow label="Line spacing">
          <SegmentedControl
            label="Line spacing"
            options={LINE_HEIGHTS}
            value={prefs.readerLineHeight ?? "normal"}
            onChange={(value) => void update({ readerLineHeight: value })}
          />
        </MenuRow>
        {isDesktop && (
          <MenuRow label="Width">
            <SegmentedControl
              label="Reading width"
              options={READER_WIDTHS}
              value={prefs.readerWidth ?? "medium"}
              onChange={(value) => void update({ readerWidth: value })}
            />
          </MenuRow>
        )}
      </PopoverContent>
    </Popover>
  );
}
