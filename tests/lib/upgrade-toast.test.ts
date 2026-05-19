/**
 * `upgradeToast` — unified inline upgrade affordance used by every gated
 * surface that should stay discoverable (smart filters, auto-organize,
 * feed quota at 26+). Renders a sonner toast with an "Upgrade" action that
 * navigates to the Subscription settings tab.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { upgradeToast } from "@/lib/upgrade-toast";
import { toast } from "sonner";

vi.mock("sonner", () => ({
  toast: { error: vi.fn() },
}));

describe("upgradeToast", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows an error toast with the given message and an 'Upgrade' action", () => {
    const navigate = vi.fn();
    upgradeToast("You've hit the limit", navigate);

    expect(toast.error).toHaveBeenCalledTimes(1);
    const [message, opts] = vi.mocked(toast.error).mock.calls[0];
    expect(message).toBe("You've hit the limit");
    expect(opts).toMatchObject({
      action: expect.objectContaining({ label: "Upgrade" }),
    });
  });

  it("the Upgrade action navigates to the Subscription settings tab", () => {
    const navigate = vi.fn();
    upgradeToast("Hit limit", navigate);

    const opts = vi.mocked(toast.error).mock.calls[0][1] as unknown as {
      action: { onClick: (e?: unknown) => void };
    };
    opts.action.onClick();

    expect(navigate).toHaveBeenCalledWith("/settings?tab=subscription");
  });

  it("forwards an optional toast id so callers can replace a loading toast", () => {
    const navigate = vi.fn();
    upgradeToast("Hit limit", navigate, { id: "loader-123" });

    const opts = vi.mocked(toast.error).mock.calls[0][1] as { id: string };
    expect(opts.id).toBe("loader-123");
  });
});
