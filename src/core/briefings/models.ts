/**
 * Supported Claude models for Signal Briefings.
 *
 * Listed here (not pulled from the API) so the Settings dropdown can
 * render labels + cost guidance without an extra round-trip, and so a
 * future model ID change is a single edit. The user picks; we never
 * silently swap their model (BYO key — they're paying per token).
 */

export interface BriefingModel {
  id: string;
  label: string;
  /** One-line tradeoff for the Settings dropdown. */
  description: string;
}

export const BRIEFING_MODELS: readonly BriefingModel[] = [
  {
    id: "claude-haiku-4-5-20251001",
    label: "Haiku 4.5",
    description: "Fastest, cheapest. Good for short, focused briefings.",
  },
  {
    id: "claude-sonnet-4-6",
    label: "Sonnet 4.6",
    description: "Balanced reasoning and cost. Recommended default.",
  },
  {
    id: "claude-opus-4-7",
    label: "Opus 4.7",
    description:
      "Strongest reasoning for long-context synthesis. Roughly 5x the cost of Sonnet.",
  },
] as const;

export type BriefingModelId = (typeof BRIEFING_MODELS)[number]["id"];

export const DEFAULT_BRIEFING_MODEL: BriefingModelId = "claude-sonnet-4-6";

/** Type guard — narrows an unknown string to a known model id. */
export function isBriefingModelId(id: string): id is BriefingModelId {
  return BRIEFING_MODELS.some((m) => m.id === id);
}
