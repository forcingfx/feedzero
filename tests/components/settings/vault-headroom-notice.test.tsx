import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { SYNC } from "@feedzero/core/utils/constants";
import { useSyncStore } from "@/stores/sync-store";
import { VaultHeadroomNotice } from "@/components/settings/vault-headroom-notice";

const LIMIT = SYNC.MAX_PUSH_BODY_SIZE;

describe("VaultHeadroomNotice", () => {
  beforeEach(() => {
    useSyncStore.setState({ status: "synced", lastPushBytes: null });
  });

  it("says nothing until a push has been measured", () => {
    const { container } = render(<VaultHeadroomNotice />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows how much of the limit a vault uses", () => {
    useSyncStore.setState({ lastPushBytes: Math.round(LIMIT * 0.5) });
    render(<VaultHeadroomNotice />);
    expect(screen.getByText(/of 4\.1 MB/)).toBeInTheDocument();
  });

  it("stays quiet about the limit while there is room", () => {
    useSyncStore.setState({ lastPushBytes: Math.round(LIMIT * 0.3) });
    render(<VaultHeadroomNotice />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("warns before pushes start failing", () => {
    // The whole reason this exists: a user who can see the wall coming
    // can act on it, and the alternative is discovering it as a failed
    // sync with no warning at all.
    useSyncStore.setState({ lastPushBytes: Math.round(LIMIT * 0.9) });
    render(<VaultHeadroomNotice />);
    expect(screen.getByRole("status")).toHaveTextContent(/approaching/i);
  });

  it("says plainly when the vault is over the limit", () => {
    useSyncStore.setState({ lastPushBytes: Math.round(LIMIT * 1.2) });
    render(<VaultHeadroomNotice />);
    expect(screen.getByRole("status")).toHaveTextContent(/too large/i);
  });

  it("names a remedy that actually releases space", () => {
    // Not "unstar articles": toggleStar keeps extractedContent, so that
    // advice changes nothing. Removing a feed removes its articles.
    useSyncStore.setState({ lastPushBytes: Math.round(LIMIT * 0.9) });
    render(<VaultHeadroomNotice />);
    expect(screen.getByRole("status")).toHaveTextContent(/remove a feed/i);
  });
});
