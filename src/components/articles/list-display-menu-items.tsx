import {
  DropdownMenuCheckboxItem,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu.tsx";
import { usePreferencesStore } from "@/stores/preferences-store.ts";
import { SIZE_STEPS } from "@/components/settings/size-steps.ts";

/** Keep the menu open: the point is to watch the list change behind it. */
function staysOpen(event: Event) {
  event.preventDefault();
}

/**
 * "Display" section for a list menu: row size and what each row shows,
 * changed while the list is on screen. The same preferences as
 * Settings → List. Size is two menu items, not an embedded stepper,
 * so it stays reachable by the menu's own arrow-key navigation.
 */
export function ListDisplayMenuItems() {
  const prefs = usePreferencesStore((s) => s.preferences);
  const update = usePreferencesStore((s) => s.update);

  const index = Math.max(
    0,
    SIZE_STEPS.findIndex((step) => step.value === (prefs.listTextSize ?? "medium")),
  );
  const stepTo = (next: number) => {
    const step = SIZE_STEPS[next];
    if (step) void update({ listTextSize: step.value });
  };

  return (
    <>
      <DropdownMenuSeparator />
      <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
        Display · {SIZE_STEPS[index]?.label} size
      </DropdownMenuLabel>
      <DropdownMenuItem
        disabled={index === SIZE_STEPS.length - 1}
        onSelect={staysOpen}
        onClick={() => stepTo(index + 1)}
      >
        <span aria-hidden="true" className="mr-1.5 w-3.5 text-center text-base font-semibold leading-none">
          A
        </span>
        Larger rows
      </DropdownMenuItem>
      <DropdownMenuItem disabled={index === 0} onSelect={staysOpen} onClick={() => stepTo(index - 1)}>
        <span aria-hidden="true" className="mr-1.5 w-3.5 text-center text-xs font-semibold leading-none">
          A
        </span>
        Smaller rows
      </DropdownMenuItem>
      <DropdownMenuCheckboxItem
        checked={prefs.showArticlePreview ?? true}
        onSelect={staysOpen}
        onCheckedChange={(checked) => void update({ showArticlePreview: checked })}
      >
        Article previews
      </DropdownMenuCheckboxItem>
      <DropdownMenuCheckboxItem
        checked={prefs.showArticleImages ?? false}
        onSelect={staysOpen}
        onCheckedChange={(checked) => void update({ showArticleImages: checked })}
      >
        Article images
      </DropdownMenuCheckboxItem>
    </>
  );
}
