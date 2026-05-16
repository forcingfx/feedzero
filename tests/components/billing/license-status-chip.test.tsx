import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { LicenseStatusChip } from "@/components/billing/license-status-chip";
import { useLicenseStore } from "@/stores/license-store";

beforeEach(() => {
  useLicenseStore.setState({ tier: "free", verifying: false });
});

describe("LicenseStatusChip", () => {
  it("renders 'Free' when the license store is at the free tier", () => {
    render(<LicenseStatusChip />);
    expect(screen.getByText(/free/i)).toBeInTheDocument();
  });

  it("renders 'Personal' when the store reports personal", () => {
    useLicenseStore.setState({ tier: "personal" });
    render(<LicenseStatusChip />);
    expect(screen.getByText(/personal/i)).toBeInTheDocument();
  });

  it("renders 'Pro' when the store reports pro", () => {
    useLicenseStore.setState({ tier: "pro" });
    render(<LicenseStatusChip />);
    expect(screen.getByText(/^pro$/i)).toBeInTheDocument();
  });

  it("uses tier-specific color classes (emerald for personal, indigo for pro)", () => {
    useLicenseStore.setState({ tier: "personal" });
    const { unmount } = render(<LicenseStatusChip />);
    expect(screen.getByText(/personal/i).className).toMatch(/emerald/);
    unmount();

    useLicenseStore.setState({ tier: "pro" });
    render(<LicenseStatusChip />);
    expect(screen.getByText(/^pro$/i).className).toMatch(/indigo/);
  });
});
