import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Node 22+ ships an experimental `localStorage` global that is `undefined`
// unless launched with `--localstorage-file`. Defined as a non-configurable
// accessor on globalThis, it blocks vitest's happy-dom environment from
// copying `window.localStorage` onto the global scope. Bare `localStorage.x`
// calls in tests (e.g. tests/stores/license-store.test.ts) therefore
// resolve to Node's undefined global instead of happy-dom's Storage.
//
// Plain assignment goes through Node's setter (no-op). defineProperty
// replaces the descriptor outright. We install a minimal in-memory shim
// rather than reaching into happy-dom internals, because vitest's env
// also drops `window.localStorage` for the same reason — there is nothing
// reliable to bridge from.
class InMemoryStorage implements Storage {
  private store: Record<string, string> = {};
  get length(): number { return Object.keys(this.store).length; }
  clear(): void { this.store = {}; }
  getItem(key: string): string | null { return Object.prototype.hasOwnProperty.call(this.store, key) ? this.store[key] : null; }
  setItem(key: string, value: string): void { this.store[key] = String(value); }
  removeItem(key: string): void { delete this.store[key]; }
  key(index: number): string | null { return Object.keys(this.store)[index] ?? null; }
}
for (const name of ["localStorage", "sessionStorage"] as const) {
  Object.defineProperty(globalThis, name, {
    value: new InMemoryStorage(),
    writable: true,
    configurable: true,
  });
  if (typeof window !== "undefined") {
    Object.defineProperty(window, name, {
      value: (globalThis as unknown as Record<string, Storage>)[name],
      writable: true,
      configurable: true,
    });
  }
}

// happy-dom defaults isSecureContext to false. AppInit now refuses to
// initialize in an insecure context (the fix for feedback #88), so without
// this default every component test that mounts <App> would hit the new
// "secure context required" screen. Production tests that want to exercise
// the insecure-context branch override this per-test.
if (typeof globalThis.isSecureContext === "undefined" || globalThis.isSecureContext === false) {
  Object.defineProperty(globalThis, "isSecureContext", {
    value: true,
    writable: true,
    configurable: true,
  });
}

afterEach(() => {
  cleanup();
});
