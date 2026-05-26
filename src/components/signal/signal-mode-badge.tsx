/**
 * Read-only chip showing which Signal mode is active, with a click
 * affordance into Settings → Reading → Signal.
 *
 * Replaces the in-page ToggleGroup that used to live in the page
 * header. The toggle moved to Settings because Signal mode is a
 * global preference, not a per-visit choice — but the user still
 * needs to know which mode they're looking at without opening
 * Settings. This badge is the read at a glance; Settings is the
 * write.
 */
import { useNavigate } from "react-router";
import { Cpu, Sparkles } from "lucide-react";
import { useSignalMode } from "@/lib/signal-mode-preference";
import { goToSettings } from "@/lib/go-to-settings";

export function SignalModeBadge() {
  const navigate = useNavigate();
  const [mode] = useSignalMode();
  const Icon = mode === "ai" ? Sparkles : Cpu;
  const label = mode === "ai" ? "AI" : "Local";
  return (
    <button
      type="button"
      data-testid="signal-mode-badge"
      onClick={() => goToSettings(navigate, "reading")}
      title="Signal mode (change in Settings → Reading)"
      className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
    >
      <Icon className="size-3" aria-hidden />
      <span>{label}</span>
    </button>
  );
}
