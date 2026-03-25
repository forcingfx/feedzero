import type { GeneratedCatalog } from "@/lib/catalog-search.ts";

let cached: GeneratedCatalog | null = null;

/** Lazily loads the generated feed catalog. Cached after first call. */
export async function loadGeneratedCatalog(): Promise<GeneratedCatalog> {
  if (!cached) {
    const mod = await import("@/data/feed-catalog.generated.json");
    cached = mod.default as GeneratedCatalog;
  }
  return cached;
}

/** Clears the cache (useful for testing). */
export function clearCatalogCache(): void {
  cached = null;
}
