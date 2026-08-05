/** Type surface for scripts/release/tag-decision.mjs. */

export interface TagInputs {
  pkgVersion: string;
  /** Newest version in the live landing feed, or null if unreadable. */
  feedVersion: string | null;
  existingTags: string[];
}

export interface TagDecision {
  tag: boolean;
  /** True when the workflow should FAIL rather than skip quietly. */
  blocking: boolean;
  reason: string;
}

export function newestFeedVersion(xml: string): string | null;
export function decideTag(inputs: TagInputs): TagDecision;
