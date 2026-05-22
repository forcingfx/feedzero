import { beforeEach, describe, expect, it, vi } from "vitest";

import { useExtensionStore } from "@/stores/extension-store.ts";
import * as protocol from "@/core/extension/protocol.ts";
import { ok, err } from "@/utils/result.ts";

function resetStore() {
  useExtensionStore.setState({
    status: "unknown",
    extensionVersion: null,
    authorizedDomains: [],
    authorizationInFlight: null,
  });
}

describe("useExtensionStore", () => {
  beforeEach(() => {
    resetStore();
    vi.restoreAllMocks();
  });

  describe("detect", () => {
    it("flips status to installed and records the version on ping success", async () => {
      vi.spyOn(protocol, "ping").mockResolvedValue(
        ok({ extensionVersion: "0.2.0" }),
      );

      await useExtensionStore.getState().detect();

      const state = useExtensionStore.getState();
      expect(state.status).toBe("installed");
      expect(state.extensionVersion).toBe("0.2.0");
    });

    it("flips status to absent on ping timeout", async () => {
      vi.spyOn(protocol, "ping").mockResolvedValue(err("timeout"));

      await useExtensionStore.getState().detect();

      const state = useExtensionStore.getState();
      expect(state.status).toBe("absent");
      expect(state.extensionVersion).toBe(null);
    });

    it("can be called repeatedly without leaving stale state", async () => {
      const spy = vi.spyOn(protocol, "ping");
      spy.mockResolvedValueOnce(ok({ extensionVersion: "0.1.0" }));
      await useExtensionStore.getState().detect();
      expect(useExtensionStore.getState().status).toBe("installed");

      spy.mockResolvedValueOnce(err("timeout"));
      await useExtensionStore.getState().detect();
      expect(useExtensionStore.getState().status).toBe("absent");
      expect(useExtensionStore.getState().extensionVersion).toBe(null);
    });
  });

  describe("requestPublisherAccess", () => {
    it("records the domain on successful grant", async () => {
      vi.spyOn(protocol, "authorizePublisher").mockResolvedValue(
        ok({ granted: true }),
      );

      const granted = await useExtensionStore
        .getState()
        .requestPublisherAccess("nytimes.com");

      expect(granted).toBe(true);
      expect(useExtensionStore.getState().authorizedDomains).toContain(
        "nytimes.com",
      );
    });

    it("does not record the domain when the user declines", async () => {
      vi.spyOn(protocol, "authorizePublisher").mockResolvedValue(
        ok({ granted: false }),
      );

      const granted = await useExtensionStore
        .getState()
        .requestPublisherAccess("nytimes.com");

      expect(granted).toBe(false);
      expect(useExtensionStore.getState().authorizedDomains).not.toContain(
        "nytimes.com",
      );
    });

    it("does not record the domain when the protocol times out", async () => {
      vi.spyOn(protocol, "authorizePublisher").mockResolvedValue(
        err("timeout"),
      );

      const granted = await useExtensionStore
        .getState()
        .requestPublisherAccess("nytimes.com");

      expect(granted).toBe(false);
      expect(useExtensionStore.getState().authorizedDomains).toEqual([]);
    });

    it("dedupes a domain that's already authorized", async () => {
      vi.spyOn(protocol, "authorizePublisher").mockResolvedValue(
        ok({ granted: true }),
      );

      await useExtensionStore.getState().requestPublisherAccess("nytimes.com");
      await useExtensionStore.getState().requestPublisherAccess("nytimes.com");

      expect(useExtensionStore.getState().authorizedDomains).toEqual([
        "nytimes.com",
      ]);
    });

    it("isAuthorized reflects recorded grants", async () => {
      vi.spyOn(protocol, "authorizePublisher").mockResolvedValue(
        ok({ granted: true }),
      );

      expect(useExtensionStore.getState().isAuthorized("nytimes.com")).toBe(
        false,
      );

      await useExtensionStore.getState().requestPublisherAccess("nytimes.com");

      expect(useExtensionStore.getState().isAuthorized("nytimes.com")).toBe(
        true,
      );
    });
  });
});
