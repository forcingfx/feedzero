import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route, useLocation } from "react-router";
import { SidebarBody } from "../../../src/components/layout/sidebar-body.tsx";
import { SidebarProvider } from "../../../src/components/ui/sidebar.tsx";

function LocationProbe() {
  const { pathname } = useLocation();
  return <div data-testid="pathname">{pathname}</div>;
}

function renderBody(initialPath = "/feeds") {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <SidebarProvider>
        <Routes>
          <Route path="*" element={
            <>
              <SidebarBody onFeedSelect={() => {}} />
              <LocationProbe />
            </>
          } />
        </Routes>
      </SidebarProvider>
    </MemoryRouter>,
  );
}

describe("SidebarBody Signal entry", () => {
  it("renders a Signal entry that navigates to /signal", async () => {
    const user = userEvent.setup();
    renderBody();
    const signal = screen.getByRole("button", { name: /signal/i });
    expect(signal).toBeInTheDocument();
    await user.click(signal);
    expect(screen.getByTestId("pathname").textContent).toBe("/signal");
  });

  it("marks Signal entry as active on /signal", () => {
    renderBody("/signal");
    const signal = screen.getByRole("button", { name: /signal/i });
    expect(signal.getAttribute("data-active")).toBe("true");
  });
});
