/**
 * Briefing orchestrator — the pure pipeline that turns a saved
 * Briefing + the user's article corpus into an updated Briefing with a
 * fresh report.
 *
 * Pure orchestration. Does not touch IndexedDB, does not call the sync
 * store. The briefing-store wraps this with persistence + sync push —
 * core modules never import stores (see Key Patterns rule).
 *
 * Pipeline:
 *   1. Reject early if there's no API key (UI links the user to Settings).
 *   2. Reject early if the corpus is empty (UI tells them to add feeds).
 *   3. Local prompt-match → top-K relevant articles.
 *   4. Local signal score — gates the LLM call. Below BRIEFING_MIN_SCORE
 *      the service short-circuits to "not-enough-evidence" without paying
 *      for inference. The UI shows the score + the catalog-search
 *      fallback so the user can strengthen their corpus.
 *   5. generateBriefing → abstract + citations + suggestedFeeds (pending).
 *   6. resolveSuggestedFeeds → flips each suggestion to resolved or
 *      unreachable via the existing discoverFeed cascade. Filters
 *      hallucinated URLs.
 *   7. Compose the updated Briefing — overrides the model-reported
 *      signalScore with the locally-computed one (we trust our matcher,
 *      not the LLM's self-assessment), stamps lastRunAt, resets
 *      staleArticleCount.
 *
 * Reasons returned on the failure path are discriminated unions so the
 * UI can render specific splashes without parsing error strings.
 */

import type { Article, Briefing, BriefingReport } from "@feedzero/core/types";
import { matchArticles } from "./prompt-matcher";
import { computeSignalScore, BRIEFING_MIN_SCORE } from "./signal-score";
import { generateBriefing } from "./briefing-client";
import { resolveSuggestedFeeds } from "./feed-suggester";
import type { BriefingModelId } from "./models";

export interface RefreshBriefingArgs {
  briefing: Briefing;
  articles: Article[];
  apiKey: string | null;
  modelId: BriefingModelId;
  bridgesEnabled?: boolean;
  signal?: AbortSignal;
  /** Override "now" for tests; defaults to Date.now() inside the flow. */
  now?: number;
}

export type RefreshBriefingResult =
  | { ok: true; briefing: Briefing }
  | {
      ok: false;
      reason: "no-api-key" | "no-articles" | "not-enough-evidence" | "error";
      error: string;
      /** Populated for "not-enough-evidence" so the UI can render the gauge. */
      signalScore?: number;
    };

const NO_API_KEY_MSG =
  "Paste your Anthropic API key in Settings to generate briefings.";
const NO_ARTICLES_MSG =
  "Add some feeds first — briefings need an article corpus to draw from.";

export async function refreshBriefingFlow(
  args: RefreshBriefingArgs,
): Promise<RefreshBriefingResult> {
  if (!args.apiKey) {
    return { ok: false, reason: "no-api-key", error: NO_API_KEY_MSG };
  }
  if (args.articles.length === 0) {
    return { ok: false, reason: "no-articles", error: NO_ARTICLES_MSG };
  }

  const matches = matchArticles(args.briefing.prompt, args.articles);
  const now = args.now ?? Date.now();
  const signalScore = computeSignalScore({ matches, now });

  if (signalScore < BRIEFING_MIN_SCORE) {
    return {
      ok: false,
      reason: "not-enough-evidence",
      error:
        "Your feeds don't cover this topic strongly enough yet. Try adding suggested feeds or rephrasing the prompt.",
      signalScore,
    };
  }

  const clientResult = await generateBriefing({
    prompt: args.briefing.prompt,
    articles: matches.map((m) => m.article),
    apiKey: args.apiKey,
    modelId: args.modelId,
    signal: args.signal,
  });
  if (!clientResult.ok) {
    return { ok: false, reason: "error", error: clientResult.error };
  }

  let resolvedFeeds;
  try {
    resolvedFeeds = await resolveSuggestedFeeds(
      clientResult.value.suggestedFeeds,
      { bridgesEnabled: args.bridgesEnabled },
    );
  } catch (e) {
    return {
      ok: false,
      reason: "error",
      error: `Couldn't resolve suggested feeds: ${
        e instanceof Error ? e.message : String(e)
      }`,
    };
  }

  const finalReport: BriefingReport = {
    ...clientResult.value,
    // Override the model's self-reported score with the local computation.
    // The matcher knows the ground truth; the model only sees what we sent.
    signalScore,
    suggestedFeeds: resolvedFeeds,
    generatedAt: now,
  };

  return {
    ok: true,
    briefing: {
      ...args.briefing,
      lastReport: finalReport,
      lastRunAt: now,
      staleArticleCount: 0,
    },
  };
}
