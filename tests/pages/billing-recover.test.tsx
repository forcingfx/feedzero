/**
 * <BillingRecover> — public page that takes an email and redirects to the
 * Stripe Customer Portal magic-link flow.
 *
 * UX requirements verified here:
 * - Email input is present and labeled
 * - Submit calls POST /api/license/recover with the entered email
 * - On 200 + portalUrl: redirects via window.location.href
 * - On 200 + no portalUrl (unknown email — enumeration protection): shows
 *   the same "Check your email" message it would for a known email,
 *   so an observer can't distinguish known vs unknown
 * - On error: shows an error alert without redirecting
 * - Email can be pre-filled via ?email= query param (deep-link from Account tab)
 */
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { BillingRecover } from "@/pages/billing-recover";

const originalLocation = window.location;

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
      <BillingRecover />
    </MemoryRouter>,
  );
}

describe("<BillingRecover>", () => {
  let originalFetch: typeof fetch;
  let assignSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    assignSpy = vi.fn();
    // Stub window.location so we can detect redirects without leaving JSDOM
    Object.defineProperty(window, "location", {
      configurable: true,
      value: {
        ...originalLocation,
        href: originalLocation.href,
        assign: assignSpy,
      },
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: originalLocation,
    });
  });

  it("renders an email input and submit button", () => {
    renderAt("/billing/recover");
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /recover/i }),
    ).toBeInTheDocument();
  });

  it("pre-fills the email field from ?email= query param", () => {
    renderAt("/billing/recover?email=arjun%40example.com");
    const input = screen.getByLabelText(/email/i) as HTMLInputElement;
    expect(input.value).toBe("arjun@example.com");
  });

  it("posts to /api/license/recover with the entered email", async () => {
    globalThis.fetch = mockFetch({ status: 200, body: { ok: true } });
    renderAt("/billing/recover");

    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: "user@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /recover/i }));

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "/api/license/recover",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ email: "user@example.com" }),
        }),
      );
    });
  });

  it("redirects to portalUrl when the response includes one", async () => {
    globalThis.fetch = mockFetch({
      status: 200,
      body: { ok: true, portalUrl: "https://billing.stripe.com/p/session_abc" },
    });
    renderAt("/billing/recover");

    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: "real@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /recover/i }));

    await waitFor(() => {
      expect(window.location.href).toBe(
        "https://billing.stripe.com/p/session_abc",
      );
    });
  });

  it("shows the same 'check your email' confirmation when the email is unknown (enumeration protection)", async () => {
    globalThis.fetch = mockFetch({ status: 200, body: { ok: true } }); // no portalUrl
    renderAt("/billing/recover");

    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: "unknown@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /recover/i }));

    await waitFor(() => {
      // Tolerant of "check your email", "check your inbox", etc.
      expect(screen.getByText(/check your (email|inbox)/i)).toBeInTheDocument();
    });
    // No redirect happened
    expect(window.location.href).toBe(originalLocation.href);
  });

  it("shows an error alert when the request fails", async () => {
    globalThis.fetch = mockFetch({
      status: 502,
      body: { ok: false, error: "stripe down", traceId: "req_abc" },
    });
    renderAt("/billing/recover");

    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: "user@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /recover/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
  });

  it("after submission, reveals troubleshooting + support link after a short delay", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    globalThis.fetch = mockFetch({ status: 200, body: { ok: true } });
    renderAt("/billing/recover");

    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: "user@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /recover/i }));

    await waitFor(() => {
      expect(screen.getByText(/check your (email|inbox)/i)).toBeInTheDocument();
    });

    expect(screen.queryByText(/didn't get an email/i)).toBeNull();

    vi.advanceTimersByTime(60_000);

    await waitFor(() => {
      expect(screen.getByText(/didn't get an email/i)).toBeInTheDocument();
    });
    expect(
      screen.getByRole("link", { name: /contact support|email us/i }),
    ).toBeInTheDocument();

    vi.useRealTimers();
  });
});
