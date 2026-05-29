/**
 * Settings → Reading → Signal section.
 *
 * Signal is FeedZero's umbrella brand for cross-feed intelligence
 * (the local /signal Topics view, the AI overview, saved briefings).
 * This section consolidates every Signal-related preference in one
 * place: mode selection (Local vs AI), and — when AI mode is on —
 * the Anthropic key, preferred model, and nightly-refresh opt-in.
 *
 * The contents used to live in a dedicated "Briefings" Settings tab.
 * Folding them into Reading reduces the tab count and matches the
 * brand: there is no separate "Briefings" product, only Signal in
 * its different modalities.
 */
import { useEffect, useState } from "react";
import { CheckCircle2, Cpu, KeyRound, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/toggle-group";
import {
  getAnthropicKey,
  setAnthropicKey,
  clearAnthropicKey,
} from "@/core/storage/secrets";
import {
  BRIEFING_MODELS,
  isBriefingModelId,
} from "@/core/briefings/models";
import { useBriefingModelPreference } from "@/lib/briefing-model-preference";
import {
  useSignalMode,
  useSignalNightlyRefresh,
  type SignalMode,
} from "@/lib/signal-mode-preference";

export function SignalSection() {
  const [mode, setMode] = useSignalMode();

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-4">
      <header className="flex items-center gap-2">
        <Sparkles className="size-4 text-muted-foreground" />
        <h2 className="text-sm font-medium">Signal</h2>
      </header>
      <p className="text-xs text-muted-foreground">
        Cross-feed intelligence — the local frequency engine, an optional
        AI overview, and saved briefings.
      </p>

      <ModePanel mode={mode} setMode={setMode} />

      {mode === "ai" ? (
        <>
          <AnthropicKeyPanel />
          <ModelPanel />
          <NightlyRefreshPanel />
        </>
      ) : null}
    </div>
  );
}

function ModePanel({
  mode,
  setMode,
}: {
  mode: SignalMode;
  setMode: (mode: SignalMode) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Mode</p>
      <p className="text-xs text-muted-foreground">
        Local runs entirely on-device — no LLM, no third-party calls.
        AI uses your Anthropic key to generate the overview and saved
        briefings.
      </p>
      <ToggleGroup
        type="single"
        value={mode}
        onValueChange={(v) => {
          if (!v) return;
          setMode(v as SignalMode);
        }}
        size="sm"
        aria-label="Signal mode"
        className="justify-start"
      >
        <ToggleGroupItem
          value="ml"
          aria-label="Local"
          title="On-device frequency engine — no LLM, no third-party calls."
        >
          <Cpu className="size-3.5" />
          <span className="ml-1 text-xs">Local</span>
        </ToggleGroupItem>
        <ToggleGroupItem
          value="ai"
          aria-label="AI"
          title="AI-generated overview via your Anthropic key. Counts against your token bill."
        >
          <Sparkles className="size-3.5" />
          <span className="ml-1 text-xs">AI</span>
        </ToggleGroupItem>
      </ToggleGroup>
    </div>
  );
}

function AnthropicKeyPanel() {
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [keyInput, setKeyInput] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      const result = await getAnthropicKey();
      setHasKey(result.ok ? result.value !== null : false);
    })();
  }, []);

  async function handleSave() {
    setSaving(true);
    const result = await setAnthropicKey(keyInput);
    setSaving(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setKeyInput("");
    setHasKey(true);
    toast.success("Anthropic API key saved");
  }

  async function handleClear() {
    const result = await clearAnthropicKey();
    if (!result.ok) {
      toast.error("Couldn't clear the key");
      return;
    }
    setHasKey(false);
    toast.success("Anthropic API key removed");
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <KeyRound className="size-4 text-muted-foreground" />
        <p className="text-sm font-medium">Anthropic API key</p>
        {hasKey === true ? (
          <span className="flex items-baseline gap-1 text-xs text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="size-3" />
            saved
          </span>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">
        The AI overview and saved briefings call Anthropic with a key
        you supply. The key is encrypted at rest in your vault. On every
        call your key + payload transit FeedZero's relay
        (<code>/api/briefing</code>) on the way to{" "}
        <code>api.anthropic.com</code> — the relay forwards the bytes,
        neither logs nor persists them, and never inspects the contents.
        Get a key at{" "}
        <a
          href="https://console.anthropic.com/settings/keys"
          target="_blank"
          rel="noreferrer noopener"
          className="underline"
        >
          console.anthropic.com
        </a>
        .
      </p>
      <div className="flex gap-2">
        <Input
          type="password"
          placeholder="sk-ant-..."
          value={keyInput}
          onChange={(e) => setKeyInput(e.target.value)}
          autoComplete="off"
          data-1p-ignore
        />
        <Button
          onClick={() => void handleSave()}
          disabled={saving || !keyInput.trim()}
        >
          {saving ? "Saving..." : "Save"}
        </Button>
      </div>
      {hasKey === true ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void handleClear()}
          className="text-destructive hover:text-destructive"
        >
          <Trash2 className="size-4" />
          Remove stored key
        </Button>
      ) : null}
    </div>
  );
}

function ModelPanel() {
  const [model, setModel] = useBriefingModelPreference();
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Sparkles className="size-4 text-muted-foreground" />
        <p className="text-sm font-medium">Preferred model</p>
      </div>
      <p className="text-xs text-muted-foreground">
        Which Claude model your AI overview and saved briefings use.
        You pay Anthropic per token — match the model to your budget and
        quality tradeoff. Device-local.
      </p>
      <div className="space-y-2">
        {BRIEFING_MODELS.map((m) => (
          <label
            key={m.id}
            className={
              "flex cursor-pointer items-start gap-3 rounded border p-3 transition-colors " +
              (m.id === model
                ? "border-primary bg-primary/5"
                : "border-border hover:bg-accent")
            }
          >
            <input
              type="radio"
              name="briefing-model"
              value={m.id}
              checked={m.id === model}
              onChange={(e) => {
                const v = e.target.value;
                if (isBriefingModelId(v)) setModel(v);
              }}
              className="mt-0.5"
            />
            <div className="space-y-0.5">
              <p className="text-sm font-medium">{m.label}</p>
              <p className="text-xs text-muted-foreground">{m.description}</p>
            </div>
          </label>
        ))}
      </div>
    </div>
  );
}

function NightlyRefreshPanel() {
  const [nightly, setNightly] = useSignalNightlyRefresh();
  return (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">Refresh Signal nightly</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Around midnight in your local timezone, regenerate the AI
            overview and any saved briefings flagged for daily refresh.
            Each run costs Anthropic tokens against your key (~5–10¢
            per nightly AI overview). Only fires while a FeedZero tab
            is open.
          </p>
        </div>
        <Switch
          checked={nightly}
          onCheckedChange={setNightly}
          aria-label="Refresh Signal nightly"
        />
      </div>
    </div>
  );
}
