import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { PaywallPrompt } from "@/components/reader/paywall-prompt.tsx";
import { useExtensionStore } from "@/stores/extension-store.ts";

function resetExtensionStore() {
  useExtensionStore.setState({
    status: "unknown",
    extensionVersion: null,
    authorizedDomains: [],
    authorizationInFlight: null,
  });
}

describe("PaywallPrompt", () => {
  beforeEach(() => {
    resetExtensionStore();
    vi.restoreAllMocks();
    // The extension CTAs (install / authorize) are gated behind
    // VITE_EXTENSION_ENABLED, which defaults off. These tests describe
    // the extension-shipped behaviour, so enable it explicitly.
    vi.stubEnv("VITE_EXTENSION_ENABLED", "1");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("state: no-extension (status='absent')", () => {
    it("shows the install-extension affordance with a link", () => {
      useExtensionStore.setState({ status: "absent" });

      render(
        <PaywallPrompt
          publisher="nytimes.com"
          articleUrl="https://nytimes.com/x"
        />,
      );

      expect(
        screen.getByRole("heading", { name: /paywalled article/i }),
      ).toBeInTheDocument();
      const install = screen.getByRole("link", { name: /install/i });
      expect(install).toBeInTheDocument();
    });

    it("offers 'Open original' as the no-extension fallback", () => {
      useExtensionStore.setState({ status: "absent" });

      render(
        <PaywallPrompt
          publisher="nytimes.com"
          articleUrl="https://nytimes.com/x"
        />,
      );

      const open = screen.getByRole("link", { name: /open original/i });
      expect(open).toHaveAttribute("href", "https://nytimes.com/x");
      expect(open).toHaveAttribute("target", "_blank");
    });
  });

  describe("state: extension installed but publisher not authorized", () => {
    it("shows an 'Authorize <domain>' button when status is installed and domain is unauthorized", () => {
      useExtensionStore.setState({ status: "installed", extensionVersion: "0.1.0" });

      render(
        <PaywallPrompt
          publisher="nytimes.com"
          articleUrl="https://nytimes.com/x"
        />,
      );

      expect(
        screen.getByRole("button", { name: /authorize nytimes\.com/i }),
      ).toBeInTheDocument();
    });

    it("calls requestPublisherAccess when the user clicks Authorize", async () => {
      useExtensionStore.setState({ status: "installed", extensionVersion: "0.1.0" });
      const spy = vi
        .spyOn(useExtensionStore.getState(), "requestPublisherAccess")
        .mockResolvedValue(true);

      render(
        <PaywallPrompt
          publisher="nytimes.com"
          articleUrl="https://nytimes.com/x"
        />,
      );

      await userEvent.click(
        screen.getByRole("button", { name: /authorize nytimes\.com/i }),
      );

      expect(spy).toHaveBeenCalledWith("nytimes.com");
    });

    it("disables the Authorize button while a request is in flight for this domain", () => {
      useExtensionStore.setState({
        status: "installed",
        extensionVersion: "0.1.0",
        authorizationInFlight: "nytimes.com",
      });

      render(
        <PaywallPrompt
          publisher="nytimes.com"
          articleUrl="https://nytimes.com/x"
        />,
      );

      expect(
        screen.getByRole("button", { name: /authorize nytimes\.com/i }),
      ).toBeDisabled();
    });
  });

  describe("state: status='unknown' (still probing)", () => {
    it("does not show any actionable button while detection is pending", () => {
      useExtensionStore.setState({ status: "unknown" });

      render(
        <PaywallPrompt
          publisher="nytimes.com"
          articleUrl="https://nytimes.com/x"
        />,
      );

      expect(
        screen.queryByRole("button", { name: /authorize/i }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("link", { name: /install/i }),
      ).not.toBeInTheDocument();
    });
  });

  describe("state: session-expired", () => {
    it("shows a session-refresh prompt with an 'Open <publisher> to sign in' link", () => {
      useExtensionStore.setState({
        status: "installed",
        authorizedDomains: ["nytimes.com"],
      });

      render(
        <PaywallPrompt
          publisher="nytimes.com"
          articleUrl="https://nytimes.com/x"
          reason="session-expired"
        />,
      );

      expect(screen.getByText(/session/i)).toBeInTheDocument();
      const link = screen.getByRole("link", { name: /sign in/i });
      expect(link).toHaveAttribute("href", "https://nytimes.com/");
    });
  });

  describe("publisher unknown (null)", () => {
    it("falls back to a 'Open original' affordance even when no publisher", () => {
      useExtensionStore.setState({ status: "absent" });

      render(
        <PaywallPrompt publisher={null} articleUrl="https://example.invalid/x" />,
      );

      const open = screen.getByRole("link", { name: /open original/i });
      expect(open).toHaveAttribute("href", "https://example.invalid/x");
    });
  });

  describe("extension disabled (VITE_EXTENSION_ENABLED off — shippable default)", () => {
    beforeEach(() => {
      vi.stubEnv("VITE_EXTENSION_ENABLED", "0");
    });

    it("hides the Install CTA when the extension is absent, keeping only Open original", () => {
      useExtensionStore.setState({ status: "absent" });

      render(
        <PaywallPrompt publisher="nytimes.com" articleUrl="https://nytimes.com/x" />,
      );

      expect(
        screen.queryByRole("link", { name: /install/i }),
      ).not.toBeInTheDocument();
      const open = screen.getByRole("link", { name: /open original/i });
      expect(open).toHaveAttribute("href", "https://nytimes.com/x");
    });

    it("hides the Authorize CTA even when the extension reports installed", () => {
      useExtensionStore.setState({ status: "installed", extensionVersion: "0.1.0" });

      render(
        <PaywallPrompt publisher="nytimes.com" articleUrl="https://nytimes.com/x" />,
      );

      expect(
        screen.queryByRole("button", { name: /authorize/i }),
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: /open original/i }),
      ).toBeInTheDocument();
    });

    it("still shows the paywall heading + message so the user understands why", () => {
      useExtensionStore.setState({ status: "absent" });

      render(
        <PaywallPrompt publisher="nytimes.com" articleUrl="https://nytimes.com/x" />,
      );

      expect(
        screen.getByRole("heading", { name: /paywalled article/i }),
      ).toBeInTheDocument();
    });
  });
});
