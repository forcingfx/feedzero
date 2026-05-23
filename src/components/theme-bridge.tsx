/**
 * One-way bridge from the encrypted preferences vault into next-themes.
 *
 * Boot order: next-themes' first-paint script runs in `<head>` before
 * React renders, so the *initial* theme comes from next-themes'
 * localStorage (its own cache, not synced). Once the DB opens and
 * `usePreferencesStore` hydrates with the vault row, this bridge sees
 * `preferences.theme` and calls `setTheme()` to align next-themes with
 * the synced value.
 *
 * The bridge intentionally does NOT push from next-themes back into the
 * vault — that direction is owned by ThemeToggle's click handler, which
 * calls both `setTheme()` and `usePreferencesStore.update({ theme })`
 * atomically. A push-from-next-themes path would create a write-amp
 * loop on cross-device pulls.
 *
 * Mount this once inside ThemeProvider; the component renders nothing.
 */

import { useEffect } from "react";
import { useTheme } from "next-themes";
import { usePreferencesStore } from "../stores/preferences-store";

export function ThemeBridge(): null {
  const { setTheme } = useTheme();
  const hydrated = usePreferencesStore((s) => s.hydrated);
  const vaultTheme = usePreferencesStore((s) => s.preferences.theme);

  useEffect(() => {
    // Don't disturb whatever next-themes inferred from its own localStorage
    // or the OS preference until the vault has actually been read.
    if (!hydrated) return;
    // A vault row with no explicit theme means "this user has never
    // toggled" — leave the local choice alone instead of forcing "system".
    if (!vaultTheme) return;
    setTheme(vaultTheme);
  }, [hydrated, vaultTheme, setTheme]);

  return null;
}
