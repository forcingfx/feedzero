import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route, useLocation } from "react-router";
import { useFeatureGate } from "@/hooks/use-feature-gate";
import { useLicenseStore } from "@/stores/license-store";
import { isSelfHosted } from "@/core/features/self-hosted";

vi.mock("@/core/features/self-hosted", () => ({
  isSelfHosted: vi.fn(),
}));

function LocationProbe() {
  const location = useLocation();
  return (
    <div data-testid="location">
      {location.pathname}
      {location.search}
    </div>
  );
}

function GateProbe({ feature }: { feature: "auto-organize" | "ai-signal" }) {
  const gate = useFeatureGate(feature);
  return (
    <div>
      <div data-testid="enabled">{String(gate.enabled)}</div>
      <div data-testid="reason">{gate.reason}</div>
      <div data-testid="required-tier">{gate.requiredTier}</div>
      <button type="button" onClick={gate.promptUpgrade}>
        Upgrade
      </button>
    </div>
  );
}

function renderWithRouter(ui: React.ReactNode) {
  return render(
    <MemoryRouter initialEntries={["/feeds"]}>
      <Routes>
        <Route path="/feeds" element={<>{ui}<LocationProbe /></>} />
        <Route path="/" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("useFeatureGate", () => {
  beforeEach(() => {
    useLicenseStore.setState({ tier: "free", verifying: false });
    vi.mocked(isSelfHosted).mockReturnValue(false);
  });

  it("free user → tier-locked for auto-organize", () => {
    renderWithRouter(<GateProbe feature="auto-organize" />);
    expect(screen.getByTestId("enabled")).toHaveTextContent("false");
    expect(screen.getByTestId("reason")).toHaveTextContent("tier-locked");
    expect(screen.getByTestId("required-tier")).toHaveTextContent("personal");
  });

  it("personal user → ok for auto-organize", () => {
    useLicenseStore.setState({ tier: "personal" });
    renderWithRouter(<GateProbe feature="auto-organize" />);
    expect(screen.getByTestId("enabled")).toHaveTextContent("true");
    expect(screen.getByTestId("reason")).toHaveTextContent("ok");
  });

  it("self-hosted free user → self-hosted-bypass for auto-organize", () => {
    vi.mocked(isSelfHosted).mockReturnValue(true);
    renderWithRouter(<GateProbe feature="auto-organize" />);
    expect(screen.getByTestId("enabled")).toHaveTextContent("true");
    expect(screen.getByTestId("reason")).toHaveTextContent("self-hosted-bypass");
  });

  it("coming-soon feature → not-built even when self-hosted + pro tier", () => {
    vi.mocked(isSelfHosted).mockReturnValue(true);
    useLicenseStore.setState({ tier: "pro" });
    renderWithRouter(<GateProbe feature="ai-signal" />);
    expect(screen.getByTestId("enabled")).toHaveTextContent("false");
    expect(screen.getByTestId("reason")).toHaveTextContent("not-built");
  });

  it("promptUpgrade navigates to /?subscribe=personal-monthly", async () => {
    const user = userEvent.setup();
    renderWithRouter(<GateProbe feature="auto-organize" />);
    await user.click(screen.getByRole("button", { name: /upgrade/i }));
    expect(screen.getByTestId("location")).toHaveTextContent("/?subscribe=personal-monthly");
  });
});
