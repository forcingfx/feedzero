import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LicenseTokenPasteForm } from "@/components/settings/license-token-paste-form";

vi.mock("@/core/license/license-token-store", () => ({
  setLicenseToken: vi.fn(),
  clearLicenseToken: vi.fn(),
  getLicenseToken: vi.fn(() => null),
}));

const VALID_SHAPE = "fz_payload.signature";

function mockVerifyResponse(body: unknown, ok = false, status = 400) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok,
      status,
      json: async () => body,
    }),
  );
}

describe("<LicenseTokenPasteForm> activation errors", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders an expired token as a date, not raw epochs", async () => {
    mockVerifyResponse({
      ok: false,
      error: "token expired (expired=1781618471, now=1785601571)",
    });
    const user = userEvent.setup();
    render(<LicenseTokenPasteForm />);

    await user.type(screen.getByLabelText(/license token/i), VALID_SHAPE);
    await user.click(screen.getByRole("button", { name: /continue/i }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/expired on .*2026/i);
    expect(alert.textContent).not.toMatch(/1781618471|now=/);
  });

  it("offers an email-recovery action when the token is expired", async () => {
    mockVerifyResponse({
      ok: false,
      error: "token expired (expired=1781618471, now=1785601571)",
    });
    const user = userEvent.setup();
    render(<LicenseTokenPasteForm />);

    await user.type(screen.getByLabelText(/license token/i), VALID_SHAPE);
    await user.click(screen.getByRole("button", { name: /continue/i }));

    const alert = await screen.findByRole("alert");
    const recover = within(alert).getByRole("link", { name: /recover/i });
    expect(recover).toHaveAttribute("href", "/billing/recover");
  });

  it("passes unrecognized errors through unchanged", async () => {
    mockVerifyResponse({ ok: false, error: "rate limited, try again later" }, false, 429);
    const user = userEvent.setup();
    render(<LicenseTokenPasteForm />);

    await user.type(screen.getByLabelText(/license token/i), VALID_SHAPE);
    await user.click(screen.getByRole("button", { name: /continue/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /rate limited, try again later/i,
    );
  });
});
