import { describe, it, expect, vi, afterEach } from "vitest";
import { registerServiceWorker } from "@/lib/register-service-worker";

/**
 * Registration is the step that went missing for eight months: the worker
 * file existed, and the React migration dropped the one call that told
 * browsers about it. Nothing failed, because an unregistered worker is
 * silent. These tests pin the call.
 */

function stubServiceWorker(register: (url: string) => Promise<unknown>) {
  vi.stubGlobal("navigator", { serviceWorker: { register } });
}

describe("registerServiceWorker", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("registers /sw.js in a production build", async () => {
    const register = vi.fn().mockResolvedValue({});
    stubServiceWorker(register);

    await registerServiceWorker({ isProduction: true });

    expect(register).toHaveBeenCalledWith("/sw.js");
  });

  // A worker caching the dev server's modules would serve stale code across
  // hot reloads, and the dev server emits no /sw.js to register.
  it("does not register in development", async () => {
    const register = vi.fn().mockResolvedValue({});
    stubServiceWorker(register);

    await registerServiceWorker({ isProduction: false });

    expect(register).not.toHaveBeenCalled();
  });

  // Self-hosters on plain http over a LAN have no service worker support:
  // browsers only expose it in a secure context. The app must still start.
  it("does nothing where the browser has no service worker support", async () => {
    vi.stubGlobal("navigator", {});

    await expect(registerServiceWorker({ isProduction: true })).resolves.toBeUndefined();
  });

  // Offline support is an enhancement. A rejected registration (blocked by a
  // browser setting, storage full) must never stop the reader from loading.
  it("swallows a failed registration", async () => {
    stubServiceWorker(() => Promise.reject(new Error("blocked")));

    await expect(registerServiceWorker({ isProduction: true })).resolves.toBeUndefined();
  });
});
