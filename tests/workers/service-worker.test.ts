// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderServiceWorker } from "../../scripts/service-worker/render-service-worker.mjs";

/**
 * The service worker is what lets the app open with no connection. These
 * tests run the worker that the build actually ships (template + injected
 * build manifest) against fake `caches` and `fetch`, and assert on what a
 * browser would observe: which requests are answered from the cache, which
 * go to the network, and which the worker leaves alone.
 *
 * The file is plain JavaScript evaluated in a ServiceWorkerGlobalScope, so
 * it cannot be imported; it is executed here with that scope faked.
 */

const ORIGIN = "https://my.feedzero.app";
const BUILD_ID = "build-b";
const ASSETS = ["/assets/index-AAAA.js", "/assets/index-BBBB.css"];
const TEMPLATE = readFileSync(
  path.resolve(__dirname, "../../src/workers/service-worker.js"),
  "utf8",
);

interface FakeRequest {
  url: string;
  method: string;
  mode: string;
}

type Handler = (event: unknown) => void;

function request(pathOrUrl: string, init: Partial<FakeRequest> = {}): FakeRequest {
  const url = pathOrUrl.startsWith("http") ? pathOrUrl : `${ORIGIN}${pathOrUrl}`;
  return { url, method: "GET", mode: "no-cors", ...init };
}

function keyOf(input: string | FakeRequest): string {
  const url = typeof input === "string" ? input : input.url;
  return new URL(url, ORIGIN).pathname;
}

/** A browser Cache, reduced to the calls the worker makes. */
class FakeCache {
  entries = new Map<string, Response>();
  async match(input: string | FakeRequest) {
    return this.entries.get(keyOf(input))?.clone();
  }
  async put(input: string | FakeRequest, response: Response) {
    this.entries.set(keyOf(input), response);
  }
  async addAll(urls: string[]) {
    for (const url of urls) {
      const response = await this.fetcher(url);
      if (!response.ok) throw new TypeError(`addAll: ${url} answered ${response.status}`);
      this.entries.set(keyOf(url), response);
    }
  }
  constructor(private fetcher: (input: string | FakeRequest) => Promise<Response>) {}
}

class FakeCacheStorage {
  stores = new Map<string, FakeCache>();
  constructor(private fetcher: (input: string | FakeRequest) => Promise<Response>) {}
  async open(name: string) {
    if (!this.stores.has(name)) this.stores.set(name, new FakeCache(this.fetcher));
    return this.stores.get(name)!;
  }
  async keys() {
    return [...this.stores.keys()];
  }
  async delete(name: string) {
    return this.stores.delete(name);
  }
  async match(input: string | FakeRequest) {
    for (const store of this.stores.values()) {
      const hit = await store.match(input);
      if (hit) return hit;
    }
    return undefined;
  }
}

/** Boots the shipped worker in a faked ServiceWorkerGlobalScope. */
function bootWorker() {
  const handlers = new Map<string, Handler>();
  const network = {
    online: true,
    requested: [] as string[],
  };
  const fetcher = async (input: string | FakeRequest) => {
    const pathname = keyOf(input);
    network.requested.push(pathname);
    if (!network.online) throw new TypeError("Failed to fetch");
    return new Response(`network:${pathname}`, { status: 200 });
  };
  const caches = new FakeCacheStorage(fetcher);
  const scope = {
    location: { origin: ORIGIN },
    addEventListener: (type: string, handler: Handler) => handlers.set(type, handler),
    skipWaiting: async () => {},
    clients: { claim: async () => {} },
  };

  const source = renderServiceWorker(TEMPLATE, { buildId: BUILD_ID, assets: ASSETS });
  new Function("self", "caches", "fetch", source)(scope, caches, fetcher);

  /** Fires a lifecycle event and waits for everything it asked the browser to wait for. */
  async function lifecycle(type: "install" | "activate") {
    const pending: Promise<unknown>[] = [];
    handlers.get(type)!({ waitUntil: (p: Promise<unknown>) => pending.push(p) });
    await Promise.all(pending);
  }

  /**
   * Fires a fetch event. Resolves to the worker's response, or `undefined`
   * when the worker did not call respondWith — the browser then handles the
   * request itself, exactly as if no worker were installed.
   */
  async function fetchEvent(req: FakeRequest): Promise<Response | undefined> {
    let answered: Promise<Response> | undefined;
    handlers.get("fetch")!({
      request: req,
      respondWith: (p: Promise<Response>) => {
        answered = Promise.resolve(p);
      },
    });
    return answered;
  }

  return { caches, network, lifecycle, fetchEvent };
}

describe("service worker", () => {
  let worker: ReturnType<typeof bootWorker>;

  beforeEach(() => {
    worker = bootWorker();
  });

  describe("installing", () => {
    it("stores the app page and every build asset, so one visit is enough to work offline", async () => {
      await worker.lifecycle("install");

      const cached = await worker.caches.match("/index.html");
      expect(await cached?.text()).toBe("network:/index.html");
      for (const asset of ASSETS) {
        expect(await worker.caches.match(asset)).toBeDefined();
      }
    });

    it("removes the caches of earlier builds once it takes over", async () => {
      const stale = await worker.caches.open("feedzero-shell-build-a");
      await stale.put("/assets/old.js", new Response("old"));

      await worker.lifecycle("install");
      await worker.lifecycle("activate");

      expect(await worker.caches.keys()).toEqual([`feedzero-shell-${BUILD_ID}`]);
    });
  });

  describe("opening the app", () => {
    beforeEach(async () => {
      await worker.lifecycle("install");
      await worker.lifecycle("activate");
      worker.network.requested.length = 0;
    });

    it("serves the page from the network when online, so a new release is picked up", async () => {
      const response = await worker.fetchEvent(request("/feeds", { mode: "navigate" }));

      expect(await response?.text()).toBe("network:/feeds");
    });

    it("serves the stored page when offline, for any route in the app", async () => {
      worker.network.online = false;

      const response = await worker.fetchEvent(
        request("/feeds/abc/articles/def", { mode: "navigate" }),
      );

      expect(await response?.text()).toBe("network:/index.html");
    });

    it("serves a stored asset without touching the network", async () => {
      const response = await worker.fetchEvent(request(ASSETS[0]));

      expect(await response?.text()).toBe(`network:${ASSETS[0]}`);
      expect(worker.network.requested).toEqual([]);
    });

    it("fetches an asset it has not stored and keeps it for next time", async () => {
      const lazyChunk = "/assets/settings-page-CCCC.js";

      await worker.fetchEvent(request(lazyChunk));
      worker.network.online = false;
      const offline = await worker.fetchEvent(request(lazyChunk));

      expect(await offline?.text()).toBe(`network:${lazyChunk}`);
    });
  });

  describe("requests it must leave alone", () => {
    beforeEach(async () => {
      await worker.lifecycle("install");
      await worker.lifecycle("activate");
    });

    // Privacy floor: vault ciphertext, licence tokens and feed bodies travel
    // through /api/*. None of it may be answered from, or written to, a cache.
    it("does not handle API requests", async () => {
      expect(await worker.fetchEvent(request("/api/sync"))).toBeUndefined();
      expect(await worker.fetchEvent(request("/api/feed", { method: "POST" }))).toBeUndefined();
    });

    it("does not handle requests to other origins", async () => {
      const image = request("https://cdn.example.com/photo.jpg");

      expect(await worker.fetchEvent(image)).toBeUndefined();
    });

    // The release feed and its JSON are data with their own cache headers;
    // /sw.js is how the browser finds a newer worker.
    it("does not handle the release feed or the worker script itself", async () => {
      expect(await worker.fetchEvent(request("/releases.json"))).toBeUndefined();
      expect(await worker.fetchEvent(request("/sw.js"))).toBeUndefined();
    });
  });
});

describe("renderServiceWorker", () => {
  it("injects the build id and asset list into the template", () => {
    const source = renderServiceWorker(TEMPLATE, { buildId: "abc123", assets: ["/assets/a.js"] });

    expect(source).toContain('"abc123"');
    expect(source).toContain('"/assets/a.js"');
  });

  it("produces different bytes for different builds, which is what makes the browser install the new worker", () => {
    const first = renderServiceWorker(TEMPLATE, { buildId: "one", assets: ASSETS });
    const second = renderServiceWorker(TEMPLATE, { buildId: "two", assets: ASSETS });

    expect(first).not.toBe(second);
  });

  it("refuses a template without the injection marker instead of shipping a worker with no manifest", () => {
    expect(() =>
      renderServiceWorker("self.addEventListener('fetch', () => {});", {
        buildId: "x",
        assets: [],
      }),
    ).toThrow(/marker/i);
  });
});
