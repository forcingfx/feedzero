/** Type surface for scripts/release/build-feed.mjs. */
import type { Release } from "../../release-notes.mjs";

/** Atom feed XML. Deterministic: `<updated>` comes from releases[0].date. */
export function buildFeed(releases: Release[]): string;

/** The same releases as pretty-printed JSON with a trailing newline. */
export function buildNotesJson(releases: Release[]): string;
