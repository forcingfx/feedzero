/**
 * Per-device persistence of the user's preferred Claude model for
 * Signal Briefings. localStorage rather than the synced vault: model
 * choice is reasonably device-specific (phone vs laptop budgets
 * differ), and keeping it out of the vault avoids a schema migration.
 */

import { useEffect, useState } from "react";
import {
  DEFAULT_BRIEFING_MODEL,
  isBriefingModelId,
  type BriefingModelId,
} from "@/core/briefings/models";

const KEY = "feedzero:briefing-model";

function read(): BriefingModelId {
  try {
    const stored = localStorage.getItem(KEY);
    if (stored && isBriefingModelId(stored)) return stored;
  } catch {
    /* localStorage unavailable */
  }
  return DEFAULT_BRIEFING_MODEL;
}

function write(model: BriefingModelId): void {
  try {
    localStorage.setItem(KEY, model);
  } catch {
    /* quota / unavailable — silently fall back to in-memory */
  }
}

/**
 * Read + subscribe to the preferred-model preference. Updates are
 * cross-tab via the `storage` event so changing the model on one tab
 * propagates to others without a refresh.
 */
export function useBriefingModelPreference(): [
  BriefingModelId,
  (model: BriefingModelId) => void,
] {
  const [model, setModelState] = useState<BriefingModelId>(() => read());

  useEffect(() => {
    function handleStorage(e: StorageEvent) {
      if (e.key !== KEY) return;
      const next = e.newValue;
      if (next && isBriefingModelId(next)) setModelState(next);
    }
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const setModel = (next: BriefingModelId) => {
    write(next);
    setModelState(next);
  };

  return [model, setModel];
}

/** Read-only accessor for code that doesn't need to subscribe. */
export function getBriefingModelPreference(): BriefingModelId {
  return read();
}
