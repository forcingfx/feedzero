/**
 * Chip showing which Signal mode is active. Tapping it opens Signal's
 * settings in a dialog, on the page they change.
 *
 * The settings used to be a section of Settings → Reading: the badge was
 * the read at a glance and Settings, a tab away, was the write. That tab
 * had grown to about 17 controls, and Signal's were the ones with no
 * bearing on reading. Mode is still a global preference; it is just set
 * from here now.
 *
 * Open state is the `?settings=open` search param, not component state,
 * so the legacy `/settings?tab=briefings` link can land on the open
 * dialog and the browser's back button closes it.
 */
import { useSearchParams } from "react-router";
import { Cpu, Sparkles } from "lucide-react";
import { useSignalMode } from "@/lib/signal-mode-preference";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SignalSection } from "@/components/settings/signal-section";

const SETTINGS_PARAM = "settings";
const SETTINGS_OPEN = "open";

export function SignalModeBadge() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [mode] = useSignalMode();
  const Icon = mode === "ai" ? Sparkles : Cpu;
  const label = mode === "ai" ? "AI" : "Local";
  const settingsOpen = searchParams.get(SETTINGS_PARAM) === SETTINGS_OPEN;

  function setSettingsOpen(open: boolean) {
    const next = new URLSearchParams(searchParams);
    if (open) next.set(SETTINGS_PARAM, SETTINGS_OPEN);
    else next.delete(SETTINGS_PARAM);
    setSearchParams(next);
  }

  return (
    <>
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
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Signal settings</DialogTitle>
            <DialogDescription>
              Cross-feed intelligence: the local frequency engine, an optional AI overview, and
              saved briefings.
            </DialogDescription>
          </DialogHeader>
          <SignalSection />
        </DialogContent>
      </Dialog>
    </>
  );
}
