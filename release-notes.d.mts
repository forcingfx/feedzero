/** Type surface for release-notes.mjs — the source of truth for release notes. */

export interface Release {
  /** Semver, no leading v. Must equal package.json's version when released. */
  version: string;
  /** ISO 8601 date or date-time. */
  date: string;
  /** Short headline, plain. */
  title: string;
  /** One-sentence summary. */
  subtitle: string;
  added?: string[];
  changed?: string[];
  fixed?: string[];
  removed?: string[];
}

/** Newest first. releases[0] drives the feed's <updated> and top entry. */
export const releases: Release[];
