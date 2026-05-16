import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LicenseTokenInput } from "@/components/billing/license-token-input";

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

describe("LicenseTokenInput", () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            ok: true,
            license: { tier: "pro", customerId: "cus_x" },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
  });

  it("renders nothing when paidTierVisible=false", () => {
    const { container } = render(<LicenseTokenInput paidTierVisible={false} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders an input + Save button when paidTierVisible=true", () => {
    render(<LicenseTokenInput paidTierVisible={true} />);
    expect(screen.getByPlaceholderText(/fz_/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /save/i })).toBeInTheDocument();
  });

  it("on Save with a valid-shape token, persists to localStorage and calls /api/license/verify", async () => {
    render(<LicenseTokenInput paidTierVisible={true} />);
    await userEvent.type(
      screen.getByPlaceholderText(/fz_/i),
      "fz_payload.signature",
    );
    await userEvent.click(screen.getByRole("button", { name: /save/i }));

    expect(localStorageMock.getItem("feedzero:license-token")).toBe(
      "fz_payload.signature",
    );
    const fetchMock = (globalThis.fetch as unknown) as ReturnType<typeof vi.fn>;
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/license/verify",
      expect.objectContaining({ method: "POST" }),
    );
    expect(await screen.findByText(/active.*pro/i)).toBeInTheDocument();
  });

  it("on Save with a malformed token, does NOT persist and shows an error", async () => {
    render(<LicenseTokenInput paidTierVisible={true} />);
    await userEvent.type(
      screen.getByPlaceholderText(/fz_/i),
      "garbage-not-a-token",
    );
    await userEvent.click(screen.getByRole("button", { name: /save/i }));

    expect(localStorageMock.getItem("feedzero:license-token")).toBeNull();
    expect(
      await screen.findByText(/invalid|format|fz_/i),
    ).toBeInTheDocument();
  });

  it("Clear button removes the stored token", async () => {
    localStorageMock.setItem("feedzero:license-token", "fz_existing.token");
    render(<LicenseTokenInput paidTierVisible={true} />);
    await userEvent.click(screen.getByRole("button", { name: /clear/i }));
    expect(localStorageMock.getItem("feedzero:license-token")).toBeNull();
  });

  describe("auto-fill via `value` prop", () => {
    it("when value prop is provided, the input shows that value", () => {
      render(
        <LicenseTokenInput paidTierVisible={true} value="fz_provided.token" />,
      );
      const input = screen.getByPlaceholderText(/fz_/i) as HTMLInputElement;
      expect(input.value).toBe("fz_provided.token");
    });

    it("when value prop transitions to a well-formed token, auto-fires verify; re-render with the same value does NOT re-fire", async () => {
      const { rerender } = render(
        <LicenseTokenInput paidTierVisible={true} value="" />,
      );
      const fetchMock = (globalThis.fetch as unknown) as ReturnType<typeof vi.fn>;
      expect(fetchMock).not.toHaveBeenCalled();

      function verifyCallCount(): number {
        return fetchMock.mock.calls.filter((c) =>
          c[0].toString().includes("/api/license/verify"),
        ).length;
      }

      rerender(
        <LicenseTokenInput
          paidTierVisible={true}
          value="fz_autofilled.token"
        />,
      );

      // We expect at least one verify (the component's own) and possibly a
      // follow-on from useLicenseStore.refresh() on success. Either way it
      // happens — not zero. The "exactly once per token change" invariant is
      // checked below by comparing counts across rerenders.
      await waitFor(() => {
        expect(verifyCallCount()).toBeGreaterThan(0);
      });
      const countAfterFirst = verifyCallCount();

      rerender(
        <LicenseTokenInput
          paidTierVisible={true}
          value="fz_autofilled.token"
        />,
      );
      await new Promise((r) => setTimeout(r, 30));
      // A second rerender with the same token must NOT trigger another verify.
      // The store's own refresh() may still fire from the initial Save, so we
      // lock the count against drift rather than expecting a literal number.
      expect(verifyCallCount()).toBe(countAfterFirst);
    });

    it("does NOT auto-verify when value prop is a malformed token (shape-check guards us)", async () => {
      const { rerender } = render(
        <LicenseTokenInput paidTierVisible={true} value="" />,
      );
      rerender(
        <LicenseTokenInput paidTierVisible={true} value="not-a-token" />,
      );
      await new Promise((r) => setTimeout(r, 20));
      const fetchMock = (globalThis.fetch as unknown) as ReturnType<typeof vi.fn>;
      const verifyCalls = fetchMock.mock.calls.filter((c) =>
        c[0].toString().includes("/api/license/verify"),
      );
      expect(verifyCalls).toHaveLength(0);
    });
  });

  it("when /api/license/verify returns 401 revoked, surfaces the error AND removes the token", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({ ok: false, error: "license revoked" }),
          { status: 401, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    render(<LicenseTokenInput paidTierVisible={true} />);
    await userEvent.type(
      screen.getByPlaceholderText(/fz_/i),
      "fz_revoked.token",
    );
    await userEvent.click(screen.getByRole("button", { name: /save/i }));

    expect(await screen.findByText(/revoked/i)).toBeInTheDocument();
    // Critical: a revoked token must NOT be persisted — otherwise the user
    // would think it's good and we'd send invalid Bearer headers forever.
    expect(localStorageMock.getItem("feedzero:license-token")).toBeNull();
  });
});
