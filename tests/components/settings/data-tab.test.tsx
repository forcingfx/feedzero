/**
 * <DataTab> — sync controls + import + export + danger zone in one place.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { DataTab } from "@/components/settings/tabs/data-tab";
import { useSyncStore } from "@/stores/sync-store";
import { useFeedStore } from "@/stores/feed-store";
import { useLicenseStore } from "@/stores/license-store";

vi.mock("@/core/crypto/passphrase-generator", () => ({
  generatePassphrase: vi.fn().mockResolvedValue("alpha bravo charlie delta"),
}));

function renderTab() {
  return render(
    <MemoryRouter>
      <DataTab />
    </MemoryRouter>,
  );
}

describe("<DataTab>", () => {
  beforeEach(() => {
    useSyncStore.setState({
      status: "local-only",
      error: null,
      credentials: null,
    });
    useFeedStore.setState({ feeds: [] });
    useLicenseStore.setState({ tier: "free", verifying: false });
  });

  it("renders the Cloud sync section", () => {
    renderTab();
    expect(
      screen.getByRole("heading", { name: /cloud sync/i }),
    ).toBeInTheDocument();
  });

  it("renders both Import and Export sections side-by-side", () => {
    renderTab();
    // Headings emitted by the DataTab card wrappers
    expect(
      screen.getByRole("heading", { name: /^Import$/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /^Export$/i }),
    ).toBeInTheDocument();
  });

  it("free user sees Delete all data inside Danger zone", () => {
    renderTab();
    expect(
      screen.getByRole("button", { name: /delete all data/i }),
    ).toBeInTheDocument();
  });
});
