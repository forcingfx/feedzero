/** Type surface for scripts/release/tag-decision.mjs. */

export interface TagInputs {
  pkgVersion: string;
  /** Newest version in release-notes.mjs (same commit as package.json). */
  notesVersion: string | null;
  existingTags: string[];
}

export interface TagDecision {
  tag: boolean;
  /** True when the workflow should FAIL rather than skip quietly. */
  blocking: boolean;
  reason: string;
}

export function decideTag(inputs: TagInputs): TagDecision;
