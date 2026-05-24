/**
 * Per-device preferences for the /signal Topics tab.
 *
 *  - mode: "ml" | "ai". Off by default = "ml" (the local frequency
 *    engine that ships in the matrix as "Fully local — no LLM, no
 *    third party"). Switching to "ai" enables the Anthropic-backed
 *    overview, which is BYO key like Briefings and meaningfully more
 *    expensive than the local pass.
 *
 *  - hidden: boolean. When true, the /signal page hides the AI mode
 *    toggle entirely — the AI-averse user never has to see the
 *    option. Settings → Briefings exposes this preference.
 *
 * Both live in localStorage (device-local, not in the synced vault):
 * mode is a UI affordance, not user data; hidden is a privacy/aesthetic
 * call that's reasonably device-specific (one user might want the
 * toggle on their laptop but not their phone). Cross-tab via the
 * `storage` event so a flip on one tab propagates to others.
 */
import { useEffect, useState } from "react";

const MODE_KEY = "feedzero:signal-mode";
const HIDDEN_KEY = "feedzero:signal-ai-hidden";

export type SignalMode = "ml" | "ai";

function readMode(): SignalMode {
  try {
    const stored = localStorage.getItem(MODE_KEY);
    if (stored === "ai") return "ai";
  } catch {
    /* localStorage unavailable */
  }
  return "ml";
}

function writeMode(mode: SignalMode): void {
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {
    /* quota / unavailable */
  }
}

function readHidden(): boolean {
  try {
    return localStorage.getItem(HIDDEN_KEY) === "1";
  } catch {
    return false;
  }
}

function writeHidden(hidden: boolean): void {
  try {
    if (hidden) localStorage.setItem(HIDDEN_KEY, "1");
    else localStorage.removeItem(HIDDEN_KEY);
  } catch {
    /* quota / unavailable */
  }
}

export function useSignalMode(): [SignalMode, (mode: SignalMode) => void] {
  const [mode, setModeState] = useState<SignalMode>(() => readMode());

  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key !== MODE_KEY) return;
      setModeState(e.newValue === "ai" ? "ai" : "ml");
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setMode = (next: SignalMode) => {
    writeMode(next);
    setModeState(next);
  };

  return [mode, setMode];
}

export function useSignalAIHidden(): [boolean, (hidden: boolean) => void] {
  const [hidden, setHiddenState] = useState<boolean>(() => readHidden());

  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key !== HIDDEN_KEY) return;
      setHiddenState(e.newValue === "1");
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setHidden = (next: boolean) => {
    writeHidden(next);
    setHiddenState(next);
    // If the user just hid the toggle, force mode back to ML so they
    // don't get stuck on AI with no way to see the switch.
    if (next) writeMode("ml");
  };

  return [hidden, setHidden];
}
