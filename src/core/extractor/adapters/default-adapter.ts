import { extract as defuddleExtract } from "../defuddle-extractor.ts";
import type { SiteAdapter } from "./types.ts";

/**
 * Default adapter using Defuddle for full-text extraction.
 * Used when no domain-specific adapter matches.
 */
export const defaultAdapter: SiteAdapter = {
  name: "default",
  domains: [],
  extract: defuddleExtract,
};
