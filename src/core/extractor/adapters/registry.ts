import type { SiteAdapter } from "./types.ts";

/**
 * Registry that maps domains to site-specific extraction adapters.
 * O(1) lookup by hostname via Map.
 */
class AdapterRegistry {
  private adapters = new Map<string, SiteAdapter>();

  /** Register an adapter for all its declared domains. */
  register(adapter: SiteAdapter): void {
    for (const domain of adapter.domains) {
      this.adapters.set(domain, adapter);
    }
  }

  /** Find an adapter for a URL's hostname. Returns null if none registered. */
  findAdapter(url: string): SiteAdapter | null {
    try {
      const hostname = new URL(url).hostname;
      return this.adapters.get(hostname) ?? null;
    } catch {
      return null;
    }
  }
}

export const registry = new AdapterRegistry();
