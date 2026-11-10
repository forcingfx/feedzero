/**
 * Theme toggle for Settings → Reading.
 *
 * Backed by next-themes (already a dependency). Three options: light,
 * dark, system. System honors the user's OS color-scheme preference and
 * updates live when the OS flips. Per ADR 014 follow-up A7 — the
 * `next-themes` dependency was previously installed but unwired; this
 * surfaces it.
 *
 * The selection writes through to `usePreferencesStore` so the choice
 * rides the encrypted vault to other devices (ADR 022 follow-up). The
 * companion `<ThemeBridge>` mounted at the app root applies the value in
 * the other direction (vault → next-themes) after a cross-device pull.
 *
 * A radio group rather than a single toggle so the "system" option is
 * reachable; drawn like the other segmented controls on the page.
 */
import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Monitor, Moon, Sun } from "lucide-react";
import { usePreferencesStore } from "../../stores/preferences-store";
import type { UserPreferences } from "@feedzero/core/types";

type ThemeValue = NonNullable<UserPreferences["theme"]>;

const OPTIONS: ReadonlyArray<{
  value: ThemeValue;
  label: string;
  Icon: typeof Sun;
}> = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "system", label: "System", Icon: Monitor },
];

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  // SSR / first-paint guard: next-themes returns undefined for `theme` on
  // the server. Render after mount to avoid a hydration mismatch.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const current = mounted ? (theme ?? "system") : "system";

  function handleSelect(value: ThemeValue): void {
    // Update next-themes first so the visual change is immediate, then
    // persist through the preferences store. The store's `update` is
    // async (DB write + debounced sync push) but the user-visible
    // outcome lands on the synchronous setTheme call.
    setTheme(value);
    void usePreferencesStore.getState().update({ theme: value });
  }

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className="flex rounded-md border border-border overflow-hidden w-fit"
    >
      {OPTIONS.map(({ value, label, Icon }) => {
        const selected = current === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={label}
            onClick={() => handleSelect(value)}
            className={
              "flex items-center gap-1.5 px-3 py-1.5 text-xs transition-colors " +
              (selected
                ? "bg-foreground text-background font-medium"
                : "text-muted-foreground hover:text-foreground")
            }
          >
            <Icon className="size-3.5" />
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}
