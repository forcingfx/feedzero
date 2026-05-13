import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SubscribeButton } from "@/components/billing/subscribe-button";

describe("SubscribeButton", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("renders nothing when paidTierVisible=false (default — production stays dormant)", () => {
    const { container } = render(
      <SubscribeButton priceId="price_x" paidTierVisible={false} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders the button when paidTierVisible=true", () => {
    render(<SubscribeButton priceId="price_x" paidTierVisible={true} />);
    expect(screen.getByRole("button", { name: /subscribe/i })).toBeInTheDocument();
  });

  it("on click, POSTs to /api/checkout/create-session with the price ID and current origin URLs", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          url: "https://checkout.stripe.com/pay/cs_test_xyz",
          sessionId: "cs_test_xyz",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    // Don't actually navigate during tests
    const assignSpy = vi.fn();
    Object.defineProperty(window, "location", {
      value: { origin: "https://test.example", assign: assignSpy, href: "" },
      writable: true,
    });

    render(
      <SubscribeButton priceId="price_personal_monthly" paidTierVisible={true} />,
    );
    await userEvent.click(screen.getByRole("button", { name: /subscribe/i }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/checkout/create-session",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "Content-Type": "application/json" }),
      }),
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.priceId).toBe("price_personal_monthly");
    expect(body.successUrl).toContain("https://test.example");
    expect(body.cancelUrl).toContain("https://test.example");
  });

  it("redirects the user to the Stripe Checkout URL on success", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          url: "https://checkout.stripe.com/pay/cs_test_xyz",
          sessionId: "cs_test_xyz",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const hrefSetter = vi.fn();
    Object.defineProperty(window, "location", {
      value: {
        origin: "https://test.example",
        get href() {
          return "";
        },
        set href(v) {
          hrefSetter(v);
        },
      },
      writable: true,
    });

    render(<SubscribeButton priceId="price_x" paidTierVisible={true} />);
    await userEvent.click(screen.getByRole("button", { name: /subscribe/i }));

    expect(hrefSetter).toHaveBeenCalledWith(
      "https://checkout.stripe.com/pay/cs_test_xyz",
    );
  });

  it("displays the error when the API returns ok:false", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ ok: false, error: "priceId not in allowlist" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      ),
    );

    render(<SubscribeButton priceId="price_invalid" paidTierVisible={true} />);
    await userEvent.click(screen.getByRole("button", { name: /subscribe/i }));

    expect(
      await screen.findByText(/priceId not in allowlist/i),
    ).toBeInTheDocument();
  });
});
