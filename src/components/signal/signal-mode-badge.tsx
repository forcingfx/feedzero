/**
 * Chip showing which Signal mode is active. Tapping it opens Signal's
 * settings (`SignalSettingsDialog`, mounted by the Signal page), where
 * the mode is changed. Mode is a global preference; the badge is the read
 * at a glance and the way in to the write.
 */
import { Cpu, Sparkles } from "lucide-react";
import { useSignalMode } from "@/lib/signal-mode-preference";
import { useSignalSettingsOpen } from "./signal-settings-dialog";

export function SignalModeBadge() {
  const [, setSettingsOpen] = useSignalSettingsOpen();
  const [mode] = useSignalMode();
  const Icon = mode === "ai" ? Sparkles : Cpu;
  const label = mode === "ai" ? "AI" : "Local";
  return (
    <button
      type="button"
      data-testid="signal-mode-badge"
      aria-label={`Signal settings (mode: ${label})`}
      onClick={() => setSettingsOpen(true)}
      className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
    >
      <Icon className="size-3" aria-hidden />
      <span>{label}</span>
    </button>
  );
}
