/**
 * <BillingIssued> — post-portal landing for the recovery flow.
 *
 * Reads `?recovery=<token>`, posts it to /api/license/issue-from-recovery,
 * stores the returned license token, refreshes the license-store, and
 * shows the celebration / activation UI.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { BillingIssued } from "@/pages/billing-issued";
import { useLicenseStore } from "@/stores/license-store";
import {
  clearLicenseToken,
  getLicenseToken,
} from "@/core/license/license-token-store";

function mockFetch(response: { status: number; body: unknown }) {
  return vi.fn().mockResolvedValue({
    ok: response.status >= 200 && response.status < 300,
    status: response.status,
    json: async () => response.body,
  });
}

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <BillingIssued />
    </MemoryRouter>,
  );
}

describe("<BillingIssued>", () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    clearLicenseToken();
    useLicenseStore.setState({ tier: "free", verifying: false });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    clearLicenseToken();
    useLicenseStore.setState({ tier: "free", verifying: false });
  });

  it("renders an error if no recovery query param is present", async () => {
    renderAt("/billing/issued");
    expect(await screen.findByText(/recovery link/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /try again/i })).toHaveAttribute(
      "href",
      "/billing/recover",
    );
  });

  it("posts the recovery token and stores the returned license token on success", async () => {
    globalThis.fetch = mockFetch({
      status: 200,
      body: {
        ok: true,
        token: "fz_a.b",
        tier: "personal",
      },
    });

    renderAt("/billing/issued?recovery=some-signed-token");

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "/api/license/issue-from-recovery",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ recoveryToken: "some-signed-token" }),
        }),
      );
    });

    await waitFor(() => {
      expect(getLicenseToken()).toBe("fz_a.b");
    });
  });

  it("shows the welcome-back celebration on success", async () => {
    globalThis.fetch = mockFetch({
      status: 200,
      body: { ok: true, token: "fz_a.b", tier: "personal" },
    });
    renderAt("/billing/issued?recovery=token");

    await waitFor(() => {
      expect(screen.getByText(/sync activated/i)).toBeInTheDocument();
    });
    // Tier mentioned in the celebration block
    expect(screen.getByText(/personal/i)).toBeInTheDocument();
  });

  it("shows an error alert when the server rejects the recovery token", async () => {
    globalThis.fetch = mockFetch({
      status: 401,
      body: {
        ok: false,
        error: "recovery token expired",
        traceId: "req_abc",
      },
    });
    renderAt("/billing/issued?recovery=expired-token");

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
    expect(screen.getByRole("link", { name: /try again/i })).toHaveAttribute(
      "href",
      "/billing/recover",
    );
    // Token not stored
    expect(getLicenseToken()).toBeNull();
  });
});
