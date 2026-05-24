import { Sparkles, Cpu } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  useSignalAIHidden,
  useSignalMode,
  type SignalMode,
} from "@/lib/signal-mode-preference";

/**
 * Toggle between the on-device ML overview and the AI-generated one.
 *
 * Off-by-default. Hidden entirely when the user opts out of seeing the
 * toggle via Settings → Briefings → "Hide AI Signal mode" (rendered
 * inside this component so the page-level caller doesn't have to
 * thread the preference).
 *
 * AI mode is BYO-key. Cost is on the user. The hover/aria copy reminds
 * the user that AI mode hits Anthropic so the implications are
 * surfaced at the choice site, not just buried in Settings.
 */
export function SignalModeToggle() {
  const [hidden] = useSignalAIHidden();
  const [mode, setMode] = useSignalMode();

  if (hidden) return null;

  return (
    <ToggleGroup
      type="single"
      value={mode}
      onValueChange={(v) => {
        if (!v) return;
        setMode(v as SignalMode);
      }}
      size="sm"
      aria-label="Signal mode"
    >
      <ToggleGroupItem
        value="ml"
        aria-label="Local frequency engine"
        title="On-device frequency engine — no LLM, no third-party calls."
      >
        <Cpu className="size-3.5" />
        <span className="ml-1 text-xs">Local</span>
      </ToggleGroupItem>
      <ToggleGroupItem
        value="ai"
        aria-label="AI overview"
        title="AI-generated overview via your Anthropic key. Counts against your token bill."
      >
        <Sparkles className="size-3.5" />
        <span className="ml-1 text-xs">AI</span>
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
