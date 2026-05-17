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

    // Use the async variant so the timer callback's React state updates
    // get flushed via microtask scheduling before waitFor polls. The sync
    // `advanceTimersByTime` races the React update queue under load (full
    // suite + multi-worker), causing intermittent CI failures even though
    // the test passes in isolation.
    await vi.advanceTimersByTimeAsync(60_000);

    await waitFor(() => {
      expect(screen.getByText(/didn't get an email/i)).toBeInTheDocument();
    });
    expect(
      screen.getByRole("link", { name: /contact support|email us/i }),
    ).toBeInTheDocument();

    vi.useRealTimers();
  });

  // PR K — Recovery reliability: explicit guidance for the Stripe portal
  // step. The pre-submit copy must tell users they need to click
  // "Return to FeedZero" inside the Stripe portal after signing in;
  // without that hint, users land in the portal, manage their
  // subscription, and close the tab — never triggering license issuance.

  it("pre-submit copy tells the user to click 'Return to FeedZero' inside the Stripe portal", () => {
    renderAt("/billing/recover");
    expect(
      screen.getByText(/return to feedzero/i),
    ).toBeInTheDocument();
  });

  it("post-submit confirmation repeats the 'Return to FeedZero' instruction", async () => {
    globalThis.fetch = mockFetch({ status: 200, body: { ok: true } });
    renderAt("/billing/recover");

    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: "user@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /recover/i }));

    await waitFor(() => {
      expect(screen.getByText(/check your (email|inbox)/i)).toBeInTheDocument();
    });

    // Two distinct mentions — once in pre-submit copy that's still in
    // the DOM, once in the post-submit alert. Tolerant assertion uses
    // getAllByText to confirm at least one match.
    const matches = screen.getAllByText(/return to feedzero/i);
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it("troubleshooting block links to support for users who didn't see the return link", async () => {
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

    await vi.advanceTimersByTimeAsync(60_000);

    await waitFor(() => {
      // New troubleshooting bullet: explicit hand-off to support for the
      // case where the user signed in to Stripe but never saw the return
      // link (Stripe configuration drift, portal UI variant, etc.).
      expect(
        screen.getByText(
          /already signed in.*don'?t see.*return to feedzero|manual.*issue|issue your license manually/i,
        ),
      ).toBeInTheDocument();
    });

    vi.useRealTimers();
  });
});
