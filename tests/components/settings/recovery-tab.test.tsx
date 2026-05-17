/**
 * <RecoveryTab> — paste a token + recover by email + contact support.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route, useLocation } from "react-router";
import { RecoveryTab } from "@/components/settings/tabs/recovery-tab";

function LocationProbe() {
  const { pathname, search } = useLocation();
  return <div data-testid="probe-path">{pathname + search}</div>;
}

function renderTab() {
  return render(
    <MemoryRouter initialEntries={["/settings?tab=recovery"]}>
      <Routes>
        <Route
          path="*"
          element={
            <>
              <RecoveryTab />
              <LocationProbe />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

vi.mock("@/core/license/license-token-store", () => ({
  getLicenseToken: () => null,
  clearLicenseToken: () => undefined,
  setLicenseToken: () => undefined,
  LICENSE_TOKEN_STORAGE_KEY: "feedzero:license-token",
}));

describe("<RecoveryTab>", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("renders a license-token paste field with submit button", () => {
    renderTab();
    expect(screen.getByLabelText(/license token/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /activate/i })).toBeInTheDocument();
  });

  it("links to the email-recovery page on the billing portal", () => {
    renderTab();
    const link = screen.getByRole("link", { name: /open recovery page/i });
    expect(link.getAttribute("href")).toMatch(/\/billing\/recover/);
  });

  it("renders the ContactSupport card with the support email", () => {
    renderTab();
    expect(screen.getByText("support@feedzero.app")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /contact support/i }),
    ).toBeInTheDocument();
  });

  it("clicking the Data cross-link navigates to ?tab=data", async () => {
    const user = userEvent.setup();
    renderTab();
    await user.click(screen.getByRole("button", { name: /^data$/i }));
    expect(screen.getByTestId("probe-path")).toHaveTextContent(
      "/settings?tab=data",
    );
  });
});
