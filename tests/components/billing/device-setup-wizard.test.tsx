/**
 * <DeviceSetupWizard> — 2-stage "log in to fresh instance" flow.
 *
 * Stage 1: license entry
 *   - Paste token + Continue → POST /api/license/verify
 *   - "Recover by email" link → opens /billing/recover in a new tab
 * Stage 2: optional sync restoration
 *   - "Restore my synced data" → passphrase input → checkVaultExists + pullVault
 *   - "Skip" → close wizard, license stays applied
 *
 * Controlled by useLoginStore; opens via openLogin().
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { DeviceSetupWizard } from "@/components/billing/device-setup-wizard";
import { useLoginStore } from "@/stores/login-store";
import { openLogin, closeLogin } from "@/lib/open-login";

const FAKE_TOKEN = "fz_eyJ.signature";

function renderWizard() {
  return render(
    <MemoryRouter>
      <DeviceSetupWizard />
    </MemoryRouter>,
  );
}

describe("<DeviceSetupWizard>", () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    useLoginStore.setState({ open: false });
    localStorage.clear();
  });

  it("renders nothing when the store is closed", () => {
    renderWizard();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens on the license-entry step when openLogin() fires", () => {
    openLogin();
    renderWizard();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText(/license token/i)).toBeInTheDocument();
  });

  it("renders a 'Recover by email' link pointing at /billing/recover", () => {
    openLogin();
    renderWizard();
    const link = screen.getByRole("link", { name: /recover.*email|email.*recover/i });
    expect(link.getAttribute("href")).toBe("/billing/recover");
  });

  it("rejects malformed tokens client-side without hitting the server", async () => {
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy;
    openLogin();
    renderWizard();
    fireEvent.change(screen.getByLabelText(/license token/i), {
      target: { value: "not-a-token" },
    });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/invalid|format/i);
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    globalThis.fetch = originalFetch;
  });

  it("on successful license verify, advances to the sync-prompt stage", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        license: { tier: "personal", customerId: "cus_x" },
      }),
    });
    openLogin();
    renderWizard();

    fireEvent.change(screen.getByLabelText(/license token/i), {
      target: { value: FAKE_TOKEN },
    });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    await waitFor(() => {
      // Sync prompt: explains the optional next step
      expect(screen.getByText(/cloud sync/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /skip/i })).toBeInTheDocument();
    });
    globalThis.fetch = originalFetch;
  });

  it("shows a server-side error when /api/license/verify rejects the token", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ ok: false, error: "License revoked" }),
    });
    openLogin();
    renderWizard();

    fireEvent.change(screen.getByLabelText(/license token/i), {
      target: { value: FAKE_TOKEN },
    });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/revoked/i);
    });
    globalThis.fetch = originalFetch;
  });

  it("Skip on the sync stage closes the wizard without setting up sync", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        license: { tier: "personal", customerId: "cus_x" },
      }),
    });
    openLogin();
    renderWizard();
    fireEvent.change(screen.getByLabelText(/license token/i), {
      target: { value: FAKE_TOKEN },
    });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    await waitFor(() => screen.getByRole("button", { name: /skip/i }));

    fireEvent.click(screen.getByRole("button", { name: /skip/i }));
    expect(useLoginStore.getState().open).toBe(false);
    globalThis.fetch = originalFetch;
  });

  it("closeLogin() closes the wizard", () => {
    openLogin();
    renderWizard();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    closeLogin();
    // Dialog unmounts on close
    expect(useLoginStore.getState().open).toBe(false);
  });
});
