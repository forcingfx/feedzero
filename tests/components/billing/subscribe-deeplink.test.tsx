import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { SubscribeDeeplink } from "@/components/billing/subscribe-deeplink";

const PRICE_IDS = {
  personalMonthly: "price_test_personal_monthly",
  personalYearly: "price_test_personal_yearly",
};

function renderAt(path: string, props: Partial<React.ComponentProps<typeof SubscribeDeeplink>> = {}) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <SubscribeDeeplink
        paidTierVisible={true}
        priceIds={PRICE_IDS}
        {...props}
      />
    </MemoryRouter>,
  );
}

describe("SubscribeDeeplink", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders nothing visible", () => {
    const { container } = renderAt("/");
    expect(container.firstChild).toBeNull();
  });

  it("does NOT fire checkout when there is no subscribe param", async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) => new Response("{}"),
    );
    vi.stubGlobal("fetch", fetchMock);

    renderAt("/feeds");
    await new Promise((r) => setTimeout(r, 30));

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does NOT fire checkout when paidTierVisible is false", async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) => new Response("{}"),
    );
    vi.stubGlobal("fetch", fetchMock);

    renderAt("/?subscribe=personal-monthly", { paidTierVisible: false });
    await new Promise((r) => setTimeout(r, 30));

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does NOT fire checkout when the priceId is unconfigured (defensive fail-closed)", async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) => new Response("{}"),
    );
    vi.stubGlobal("fetch", fetchMock);

    renderAt("/?subscribe=personal-monthly", {
      priceIds: { personalMonthly: "", personalYearly: "" },
    });
    await new Promise((r) => setTimeout(r, 30));

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fires POST /api/checkout/create-session with the resolved priceId and redirects", async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(
          JSON.stringify({ ok: true, url: "https://checkout.stripe.com/c/abc" }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const originalLocation = window.location;
    const locationMock = { href: "https://my.feedzero.app/?subscribe=personal-monthly", origin: "https://my.feedzero.app" };
    Object.defineProperty(window, "location", {
      configurable: true,
      value: locationMock,
      writable: true,
    });

    try {
      renderAt("/?subscribe=personal-monthly");

      await waitFor(() => {
        const calls = fetchMock.mock.calls as Array<[RequestInfo | URL, RequestInit?]>;
        const checkout = calls.find((c) =>
          c[0].toString().includes("/api/checkout/create-session"),
        );
        expect(checkout).toBeDefined();
      });

      const calls = fetchMock.mock.calls as Array<[RequestInfo | URL, RequestInit?]>;
      const checkout = calls.find((c) =>
        c[0].toString().includes("/api/checkout/create-session"),
      )!;
      const body = JSON.parse(checkout[1]?.body as string);
      expect(body.priceId).toBe(PRICE_IDS.personalMonthly);
      expect(body.successUrl).toMatch(/billing\/success/);
      expect(body.cancelUrl).toMatch(/billing\/cancelled/);

      await waitFor(() => {
        expect(locationMock.href).toBe("https://checkout.stripe.com/c/abc");
      });
    } finally {
      Object.defineProperty(window, "location", {
        configurable: true,
        value: originalLocation,
        writable: true,
      });
    }
  });

  it("fires only once per session even if remounted (defends against double-charge from re-render)", async () => {
    sessionStorage.clear();
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(
          JSON.stringify({ ok: true, url: "https://checkout.stripe.com/c/abc" }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const originalLocation = window.location;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { href: "https://my.feedzero.app/?subscribe=personal-monthly", origin: "https://my.feedzero.app" },
      writable: true,
    });

    try {
      const { unmount } = renderAt("/?subscribe=personal-monthly");
      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledTimes(1);
      });
      unmount();

      renderAt("/?subscribe=personal-monthly");
      await new Promise((r) => setTimeout(r, 30));

      // Second mount of the same session must not re-fire checkout.
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      Object.defineProperty(window, "location", {
        configurable: true,
        value: originalLocation,
        writable: true,
      });
    }
  });
});
