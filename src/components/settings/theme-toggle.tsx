/**
 * Theme toggle for Settings → Reading.
 *
 * Backed by next-themes (already a dependency). Three options: light,
 * dark, system. System honors the user's OS color-scheme preference and
 * updates live when the OS flips. Per ADR 014 follow-up A7 — the
 * `next-themes` dependency was previously installed but unwired; this
 * surfaces it.
 *
 * Stylistically a radio group rather than a single toggle so the
 * "system" option is reachable (a binary toggle can't represent it).
 */
import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Monitor, Moon, Sun } from "lucide-react";

const OPTIONS = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "system", label: "System", Icon: Monitor },
] as const;

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  // SSR / first-paint guard: next-themes returns undefined for `theme` on
  // the server. Render after mount to avoid a hydration mismatch.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const current = mounted ? (theme ?? "system") : "system";

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className="grid grid-cols-3 gap-2"
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
            onClick={() => setTheme(value)}
            className={
              "flex flex-col items-center gap-1 rounded-md border p-3 text-xs transition-colors " +
              (selected
                ? "border-ring bg-accent text-accent-foreground"
                : "border-border bg-card text-muted-foreground hover:bg-accent/50")
            }
          >
            <Icon className="size-4" />
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}
