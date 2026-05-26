/**
 * Midnight Signal refresh — fires `runSignalMidnightTasks` once around
 * local 00:00 while a FeedZero tab is open.
 *
 * Architecture: client-side, in-tab. The user's vault + Anthropic key
 * are encrypted under keys the server cannot read, so a server-side
 * cron would either need to hold the plaintext key (breaks BYOK) or
 * orchestrate via push (privacy-clean but scope expansion). The
 * client-side scheduler is the architecturally honest choice; if the
 * "must run when no tab is open" need ever lands, that's a Periodic
 * Background Sync follow-up, not a server move. See the architectural
 * note in /root/.claude/plans/fancy-zooming-barto.md and ADR 012's
 * privacy section for the long form.
 *
 * Behaviour:
 *   - On mount, schedule a setTimeout to next local midnight.
 *   - On fire, run `runSignalMidnightTasks` then re-arm for tomorrow.
 *   - On window focus / visibility change: if local midnight has
 *     passed since the last run, run immediately. Catches the
 *     laptop-asleep case where setTimeout is suspended through the
 *     scheduled time and would otherwise wait a full day to retry.
 *   - On unmount, clear the timer + remove listeners.
 *
 * `lastRunAt` is persisted to localStorage so the "did we miss
 * midnight while asleep?" check survives a tab restart.
 */
import { useEffect } from "react";
import { useSignalModeStore } from "@/lib/signal-mode-preference";
import { useAISignalStore } from "@/stores/ai-signal-store";
import { useBriefingStore } from "@/stores/briefing-store";
import { useArticleStore } from "@/stores/article-store";
import { useBriefingModelPreference } from "@/lib/briefing-model-preference";
import { getAnthropicKey } from "@/core/storage/secrets";
import { nextLocalMidnight } from "@/lib/next-local-midnight";
import type { Article } from "@feedzero/core/types";

const LAST_RUN_KEY = "feedzero:signal-midnight-last-run";

function collectAllArticles(): Article[] {
  const grouped = useArticleStore.getState().articlesByFeedId;
  const out: Article[] = [];
  for (const list of Object.values(grouped)) out.push(...list);
  return out;
}

function readLastRunAt(): number | null {
  try {
    const raw = localStorage.getItem(LAST_RUN_KEY);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function writeLastRunAt(ts: number): void {
  try {
    localStorage.setItem(LAST_RUN_KEY, String(ts));
  } catch {
    /* quota / unavailable */
  }
}

/** Wall-clock of the most recent local midnight (≤ now). */
function previousLocalMidnight(now: Date): number {
  const previous = new Date(now);
  previous.setHours(0, 0, 0, 0);
  return previous.getTime();
}

/**
 * Run the two midnight tasks: AI Signal regenerate (gated on mode +
 * nightly + key), and per-briefing refresh for every saved briefing
 * with `dailyRefresh: true`. Independent — the briefing fan-out runs
 * even with AI mode off, because a user may want their Signal in
 * Local mode but still keep a saved briefing on a daily schedule.
 *
 * Exported for unit testing — the hook just orchestrates timing.
 */
export async function runSignalMidnightTasks(): Promise<void> {
  const { mode, nightly } = useSignalModeStore.getState();
  if (!nightly) return;

  // AI overview leg — only fires when AI mode is on AND a key is set.
  if (mode === "ai") {
    const keyResult = await getAnthropicKey();
    const hasKey = keyResult.ok && keyResult.value !== null;
    if (hasKey) {
      try {
        await useAISignalStore.getState().loadReport({ force: true });
      } catch {
        /* keep going to the briefing leg */
      }
    }
  }

  // Saved-briefing leg — runs regardless of Signal mode. Sequential
  // so we don't fan out N concurrent Anthropic calls per device.
  const briefings = useBriefingStore.getState().briefings;
  const flagged = briefings.filter((b) => b.dailyRefresh === true);
  if (flagged.length === 0) return;

  const articles = collectAllArticles();
  const modelId = readPreferredModel();
  const refresh = useBriefingStore.getState().refreshBriefing;
  for (const briefing of flagged) {
    try {
      await refresh(briefing.id, { articles, modelId });
    } catch {
      /* one bad briefing must not block the others */
    }
  }
}

function readPreferredModel(): ReturnType<typeof useBriefingModelPreference>[0] | undefined {
  // The model preference is per-device localStorage; we read it
  // directly (the hook isn't React) using the same key the
  // `useBriefingModelPreference` hook does. If unset, leave undefined
  // so the briefing service falls back to its own default.
  try {
    const raw = localStorage.getItem("feedzero:briefing-model");
    return raw ? (raw as ReturnType<typeof useBriefingModelPreference>[0]) : undefined;
  } catch {
    return undefined;
  }
}

export function useSignalMidnightRefresh(): void {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    function arm() {
      const delay = Math.max(0, nextLocalMidnight(new Date()) - Date.now());
      timer = setTimeout(fire, delay);
    }

    async function fire() {
      writeLastRunAt(Date.now());
      try {
        await runSignalMidnightTasks();
      } finally {
        arm();
      }
    }

    function fireIfMissed() {
      // Only run when the tab is actually visible — focus events while
      // backgrounded should not trigger paid work.
      if (
        typeof document !== "undefined" &&
        document.visibilityState === "hidden"
      ) {
        return;
      }
      const lastRun = readLastRunAt();
      const todayMidnight = previousLocalMidnight(new Date());
      // If we have not run since the most recent local midnight, we
      // missed it (most likely the laptop slept through 00:00). Catch
      // up now.
      if (lastRun === null || lastRun < todayMidnight) {
        // Clear the pending timer so it doesn't fire twice in quick
        // succession; `fire` re-arms after running.
        if (timer !== null) clearTimeout(timer);
        void fire();
      }
    }

    arm();
    window.addEventListener("focus", fireIfMissed);
    document.addEventListener("visibilitychange", fireIfMissed);

    return () => {
      if (timer !== null) clearTimeout(timer);
      window.removeEventListener("focus", fireIfMissed);
      document.removeEventListener("visibilitychange", fireIfMissed);
    };
  }, []);
}
