import type { Result } from "../../../../packages/core/src/utils/result";
import type { ExtractionResult } from "../defuddle-extractor.ts";

/**
 * Interface for domain-specific content extraction adapters.
 *
 * Each adapter handles one or more domains and can optionally remap
 * the article URL to a different source (e.g., GitHub repo → raw README).
 * The store remains in control of fetching; adapters are pure transformers.
 */
export interface SiteAdapter {
  /** Human-readable name for debugging */
  name: string;

  /** Domains this adapter handles (e.g., ["github.com"]) */
  domains: string[];

  /**
   * Optionally remap the article URL to a different source URL.
   * Return null to use the original URL (default Defuddle extraction).
   */
  getSourceUrl?(url: string): string | null;

  /**
   * Extract content from the fetched text.
   * `text` is the response body from getSourceUrl (or original URL).
   */
  extract(text: string, url: string): Result<ExtractionResult>;
}
