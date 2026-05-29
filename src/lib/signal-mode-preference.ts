/**
 * Per-device preferences for the Signal feature.
 *
 *   - `mode`     : "ml" | "ai". Off-by-default = "ml" (the local frequency
 *                  engine that ships in the matrix as "Fully local — no LLM,
 *                  no third party"). Switching to "ai" enables the
 *                  Anthropic-backed overview, which is BYO key like
 *                  Briefings and meaningfully more expensive.
 *
 *   - `hidden`   : (legacy) when true, the in-page mode toggle was hidden.
 *                  The Signal page no longer renders that toggle (it now
 *                  lives in Settings → Reading → Signal), so this field
 *                  is inert in current UI. The hook is kept exported only
 *                  so any external caller still imports cleanly; the value
 *                  just defaults to false and accepts writes for migration
 *                  compatibility.
 *
 *   - `nightly`  : when true, a midnight scheduler kicks `loadReport({force})`
 *                  on the AI Signal store and fans out to saved briefings
 *                  flagged `dailyRefresh`. Off by default. Costs Anthropic
 *                  tokens, so the user opts in explicitly.
 *
 * Backing store: Zustand singleton. Every `useSignalMode()` reader
 * subscribes to the same store, so a write from any caller re-renders
 * every other caller in the same tab. Cross-tab sync still rides the
 * `storage` event listener installed at module load.
 *
 * Why not the previous `useState` shape: each `useState`-wrapped hook
 * call held its own copy of the value and only synced via the `storage`
 * event — which never fires for the tab that wrote the value. The
 * toggle's write therefore did not re-render the page reading it. See
 * the failing test in tests/lib/signal-mode-preference.test.tsx.
 */
import { create } from "zustand";

const MODE_KEY = "feedzero:signal-mode";
const HIDDEN_KEY = "feedzero:signal-ai-hidden";
const NIGHTLY_KEY = "feedzero:signal-nightly-refresh";

export type SignalMode = "ml" | "ai";

interface SignalModeState {
  mode: SignalMode;
  hidden: boolean;
  nightly: boolean;
  setMode: (mode: SignalMode) => void;
  setHidden: (hidden: boolean) => void;
  setNightly: (nightly: boolean) => void;
}

function readMode(): SignalMode {
  try {
    return localStorage.getItem(MODE_KEY) === "ai" ? "ai" : "ml";
  } catch {
    return "ml";
  }
}

function readHidden(): boolean {
  try {
    return localStorage.getItem(HIDDEN_KEY) === "1";
  } catch {
    return false;
  }
}

function readNightly(): boolean {
  try {
    return localStorage.getItem(NIGHTLY_KEY) === "1";
  } catch {
    return false;
  }
}

function writeFlag(key: string, on: boolean): void {
  try {
    if (on) localStorage.setItem(key, "1");
    else localStorage.removeItem(key);
  } catch {
    /* quota / unavailable */
  }
}

export const useSignalModeStore = create<SignalModeState>((set) => ({
  mode: readMode(),
  hidden: readHidden(),
  nightly: readNightly(),

  setMode: (mode) => {
    try {
      localStorage.setItem(MODE_KEY, mode);
    } catch {
      /* quota / unavailable */
    }
    set({ mode });
  },

  setHidden: (hidden) => {
    writeFlag(HIDDEN_KEY, hidden);
    set({ hidden });
    // Legacy: hiding the AI toggle forced mode back to ML so the user
    // wasn't stuck on AI with no way to switch. Behaviour preserved.
    if (hidden) {
      try {
        localStorage.setItem(MODE_KEY, "ml");
      } catch {
        /* ignore */
      }
      set({ mode: "ml" });
    }
  },

  setNightly: (nightly) => {
    writeFlag(NIGHTLY_KEY, nightly);
    set({ nightly });
  },
}));

// Cross-tab sync. Mounted once at module load; happy-dom + browsers
// both fire `storage` for writes from OTHER tabs only, so this never
// echoes our own writes.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === MODE_KEY) {
      useSignalModeStore.setState({ mode: e.newValue === "ai" ? "ai" : "ml" });
    } else if (e.key === HIDDEN_KEY) {
      useSignalModeStore.setState({ hidden: e.newValue === "1" });
    } else if (e.key === NIGHTLY_KEY) {
      useSignalModeStore.setState({ nightly: e.newValue === "1" });
    }
  });
}

/**
 * Hook contract preserved: `[value, setter]` tuple. Internally these
 * are thin selectors over the shared Zustand store.
 */
export function useSignalMode(): [SignalMode, (mode: SignalMode) => void] {
  const mode = useSignalModeStore((s) => s.mode);
  const setMode = useSignalModeStore((s) => s.setMode);
  return [mode, setMode];
}

export function useSignalAIHidden(): [boolean, (hidden: boolean) => void] {
  const hidden = useSignalModeStore((s) => s.hidden);
  const setHidden = useSignalModeStore((s) => s.setHidden);
  return [hidden, setHidden];
}

export function useSignalNightlyRefresh(): [boolean, (nightly: boolean) => void] {
  const nightly = useSignalModeStore((s) => s.nightly);
  const setNightly = useSignalModeStore((s) => s.setNightly);
  return [nightly, setNightly];
}
