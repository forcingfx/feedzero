import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { BillingSuccess } from "@/pages/billing-success";

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
  };
})();
Object.defineProperty(globalThis, "localStorage", {
  value: localStorageMock,
  writable: true,
});

function renderWithRoute(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <BillingSuccess />
    </MemoryRouter>,
  );
}

describe("BillingSuccess page", () => {
  it("renders a confirmation heading", () => {
    renderWithRoute("/billing/success");
    expect(
      screen.getByRole("heading", { name: /thanks|welcome|success/i }),
    ).toBeInTheDocument();
  });

  it("includes the LicenseTokenInput so the user can paste their token", () => {
    renderWithRoute("/billing/success?session_id=cs_test_xyz");
    // The input is the LicenseTokenInput from PR Y, which renders a labeled
    // text input with placeholder "fz_..." and a Save button.
    expect(screen.getByPlaceholderText(/fz_/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /save/i }),
    ).toBeInTheDocument();
  });

  it("shows the masked Stripe session_id when present (lets the user confirm Stripe acked)", () => {
    renderWithRoute("/billing/success?session_id=cs_test_a1b2c3d4e5f6");
    // Expose enough of the session id to verify, but not in a UX-heavy way —
    // matters mostly for support debugging.
    expect(screen.getByText(/cs_test_a1b2c3d4e5f6/)).toBeInTheDocument();
  });

  it("renders a link back to the app", () => {
    renderWithRoute("/billing/success");
    const link = screen.getByRole("link", {
      name: /back to feedzero|continue|home|reader/i,
    });
    expect(link).toHaveAttribute("href", "/feeds");
  });

  it("renders without the session_id query param (defensive — direct nav)", () => {
    renderWithRoute("/billing/success");
    expect(
      screen.getByRole("heading", { name: /thanks|welcome|success/i }),
    ).toBeInTheDocument();
    // No session_id text should appear when the param is absent
    expect(screen.queryByText(/cs_/)).not.toBeInTheDocument();
  });

  describe("copy honesty", () => {
    it("does not falsely promise an email — token delivery is the success page itself", () => {
      renderWithRoute("/billing/success?session_id=cs_test_xyz");
      // Pre-launch: there is no email delivery wired. Telling users to
      // "check your email" would send them on a wild goose chase. The
      // copy must instead direct them to the on-page paste flow.
      const allText = document.body.textContent ?? "";
      expect(allText).not.toMatch(/check your email/i);
    });
  });

  describe("token auto-retrieval after Stripe webhook fires", () => {
    beforeEach(() => {
      localStorage.clear();
    });
    afterEach(() => {
      vi.restoreAllMocks();
      vi.useRealTimers();
    });

    it("polls /api/license/retrieve when session_id present and no stored token, auto-fills on success", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const fetchMock = vi.fn(
        async (input: RequestInfo | URL, _init?: RequestInit) => {
          const url = typeof input === "string" ? input : input.toString();
          if (url.includes("/api/license/retrieve")) {
            return new Response(
              JSON.stringify({ ok: true, token: "fz_payload.signature" }),
              { status: 200, headers: { "Content-Type": "application/json" } },
            );
          }
          return new Response("{}", { status: 200 });
        },
      );
      vi.stubGlobal("fetch", fetchMock);

      renderWithRoute("/billing/success?session_id=cs_test_xyz");

      // The page kicks off a single retrieve POST on mount. We don't need to
      // advance timers — the first call fires synchronously in useEffect.
      await waitFor(() => {
        const retrieveCalls = fetchMock.mock.calls.filter(
          (c) => c[0].toString().includes("/api/license/retrieve"),
        );
        expect(retrieveCalls.length).toBeGreaterThan(0);
      });

      // POST body should carry the session id
      const calls = fetchMock.mock.calls as Array<[RequestInfo | URL, RequestInit?]>;
      const firstRetrieve = calls.find((c) =>
        c[0].toString().includes("/api/license/retrieve"),
      )!;
      const init = firstRetrieve[1];
      expect(init?.method).toBe("POST");
      const body = JSON.parse(init?.body as string);
      expect(body.sessionId).toBe("cs_test_xyz");

      // On 200, the token is persisted to localStorage.
      await waitFor(() => {
        expect(localStorage.getItem("feedzero:license-token")).toBe(
          "fz_payload.signature",
        );
      });
    });

    it("retries on 202 pending, then succeeds on 200", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      let attempt = 0;
      const fetchMock = vi.fn(
        async (input: RequestInfo | URL, _init?: RequestInit) => {
          const url = typeof input === "string" ? input : input.toString();
          if (url.includes("/api/license/retrieve")) {
            attempt += 1;
            if (attempt === 1) {
              return new Response(
                JSON.stringify({ ok: false, pending: true }),
                { status: 202, headers: { "Content-Type": "application/json" } },
              );
            }
            return new Response(
              JSON.stringify({ ok: true, token: "fz_retried.sig" }),
              { status: 200, headers: { "Content-Type": "application/json" } },
            );
          }
          return new Response("{}", { status: 200 });
        },
      );
      vi.stubGlobal("fetch", fetchMock);

      renderWithRoute("/billing/success?session_id=cs_test_xyz");

      await waitFor(() => {
        expect(attempt).toBeGreaterThan(0);
      });

      // Advance through the polling interval (3s) to trigger retry.
      await vi.advanceTimersByTimeAsync(3500);

      await waitFor(() => {
        expect(localStorage.getItem("feedzero:license-token")).toBe(
          "fz_retried.sig",
        );
      });
    });

    it("does NOT poll when session_id is missing (direct nav)", async () => {
      const fetchMock = vi.fn(
        async (_input: RequestInfo | URL, _init?: RequestInit) =>
          new Response("{}"),
      );
      vi.stubGlobal("fetch", fetchMock);

      renderWithRoute("/billing/success");

      // Give React a chance to settle.
      await new Promise((r) => setTimeout(r, 50));

      const retrieveCalls = fetchMock.mock.calls.filter((c) =>
        c[0].toString().includes("/api/license/retrieve"),
      );
      expect(retrieveCalls).toHaveLength(0);
    });

    it("does NOT poll when a token is already stored (returning customer)", async () => {
      localStorage.setItem("feedzero:license-token", "fz_existing.token");
      const fetchMock = vi.fn(
        async (_input: RequestInfo | URL, _init?: RequestInit) =>
          new Response("{}"),
      );
      vi.stubGlobal("fetch", fetchMock);

      renderWithRoute("/billing/success?session_id=cs_test_xyz");

      await new Promise((r) => setTimeout(r, 50));

      const retrieveCalls = fetchMock.mock.calls.filter((c) =>
        c[0].toString().includes("/api/license/retrieve"),
      );
      expect(retrieveCalls).toHaveLength(0);
    });
  });

  describe("Manage subscription button", () => {
    beforeEach(() => {
      localStorage.clear();
    });
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("POSTs to /api/license/portal with sessionId + returnUrl and redirects to the URL", async () => {
      const fetchMock = vi.fn(
        async (input: RequestInfo | URL, _init?: RequestInit) => {
          const url = typeof input === "string" ? input : input.toString();
          if (url.includes("/api/license/portal")) {
            return new Response(
              JSON.stringify({
                ok: true,
                url: "https://billing.stripe.com/p/session_xyz",
              }),
              { status: 200, headers: { "Content-Type": "application/json" } },
            );
          }
          if (url.includes("/api/license/retrieve")) {
            return new Response(
              JSON.stringify({ ok: false, pending: true }),
              { status: 202 },
            );
          }
          return new Response("{}", { status: 200 });
        },
      );
      vi.stubGlobal("fetch", fetchMock);

      const originalLocation = window.location;
      const locationMock = { href: "https://my.feedzero.app/billing/success" };
      Object.defineProperty(window, "location", {
        configurable: true,
        value: locationMock,
        writable: true,
      });

      try {
        renderWithRoute("/billing/success?session_id=cs_test_xyz");

        const manageButton = await screen.findByRole("button", {
          name: /manage subscription/i,
        });
        await userEvent.click(manageButton);

        await waitFor(() => {
          const portalCall = fetchMock.mock.calls.find((c) =>
            c[0].toString().includes("/api/license/portal"),
          );
          expect(portalCall).toBeDefined();
        });

        const portalCalls = fetchMock.mock.calls as Array<
          [RequestInfo | URL, RequestInit?]
        >;
        const portalCall = portalCalls.find((c) =>
          c[0].toString().includes("/api/license/portal"),
        )!;
        const body = JSON.parse(portalCall[1]?.body as string);
        expect(body.sessionId).toBe("cs_test_xyz");
        expect(typeof body.returnUrl).toBe("string");

        await waitFor(() => {
          expect(locationMock.href).toBe(
            "https://billing.stripe.com/p/session_xyz",
          );
        });
      } finally {
        Object.defineProperty(window, "location", {
          configurable: true,
          value: originalLocation,
          writable: true,
        });
      }
    });

    it("does NOT render Manage button when no session_id (direct nav)", () => {
      renderWithRoute("/billing/success");
      expect(
        screen.queryByRole("button", { name: /manage subscription/i }),
      ).not.toBeInTheDocument();
    });
  });
});
