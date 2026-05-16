/**
 * openLogin — single entry point for "I already have an account."
 *
 * Mirrors openSettings/openUpgrade. Every "Log in" affordance funnels
 * through this helper so future routing decisions (analytics, A/B,
 * tier-aware variants) have one place to live.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { openLogin, closeLogin } from "@/lib/open-login";
import { useLoginStore } from "@/stores/login-store";

describe("openLogin", () => {
  beforeEach(() => {
    useLoginStore.setState({ open: false });
  });

  it("opens the device setup wizard", () => {
    openLogin();
    expect(useLoginStore.getState().open).toBe(true);
  });

  it("closeLogin closes the wizard", () => {
    openLogin();
    closeLogin();
    expect(useLoginStore.getState().open).toBe(false);
  });

  it("opening when already open is idempotent", () => {
    openLogin();
    openLogin();
    expect(useLoginStore.getState().open).toBe(true);
  });
});
