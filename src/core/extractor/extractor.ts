import { registry } from "./adapters/index.ts";
import { defaultAdapter } from "./adapters/default-adapter.ts";
import type { Result } from "../../../packages/core/src/utils/result";
import type { ExtractionResult } from "./defuddle-extractor.ts";

// Re-export so existing call sites keep working. The implementation
// lives in `./needs-extraction.ts` to keep the Defuddle-free predicate
// loadable without pulling in the full extractor pipeline.
export { needsExtraction } from "./needs-extraction.ts";

/**
 * Extract readable content from fetched text.
 * Routes to a domain-specific adapter if one is registered,
 * otherwise falls back to the default Defuddle extractor.
 */
export function extract(text: string, url: string): Result<ExtractionResult> {
  const adapter = registry.findAdapter(url) ?? defaultAdapter;
  return adapter.extract(text, url);
}
