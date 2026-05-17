import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PreflightPanel } from "@/components/settings/preflight-panel";

function makeReport(allPassed: boolean) {
  return {
    allPassed,
    checks: [
      { id: "secure-context", passed: allPassed, detail: "ok" },
      { id: "crypto-subtle", passed: allPassed, detail: "ok" },
      { id: "api-feed", passed: allPassed, detail: "ok" },
      { id: "api-sync", passed: allPassed, detail: "ok" },
    ],
  };
}

describe("PreflightPanel", () => {
  it("shows the Run preflight button before any run", () => {
    render(<PreflightPanel runPreflight={vi.fn()} />);
    expect(
      screen.getByRole("button", { name: /run preflight|run diagnostic/i }),
    ).toBeInTheDocument();
  });

  it("renders an all-passed summary after a successful run", async () => {
    // Self-hoster opens Help, clicks Run preflight, sees "all checks
    // passed" — the happy-path confirmation that the deployment is wired.
    const user = userEvent.setup();
    const runPreflight = vi
      .fn()
      .mockResolvedValue(makeReport(true));

    render(<PreflightPanel runPreflight={runPreflight} />);
    await user.click(
      screen.getByRole("button", { name: /run preflight|run diagnostic/i }),
    );

    await waitFor(() => {
      expect(screen.getByText(/all checks passed/i)).toBeInTheDocument();
    });
  });

  it("renders per-check failure details after a failed run", async () => {
    // Failure case must show *which* check failed, not a generic
    // "something's wrong." That's the whole point of a preflight.
    const user = userEvent.setup();
    const runPreflight = vi.fn().mockResolvedValue({
      allPassed: false,
      checks: [
        { id: "secure-context", passed: false, detail: "Insecure context (http://...)" },
        { id: "crypto-subtle", passed: true, detail: "ok" },
        { id: "api-feed", passed: true, detail: "ok" },
        { id: "api-sync", passed: true, detail: "ok" },
      ],
    });

    render(<PreflightPanel runPreflight={runPreflight} />);
    await user.click(
      screen.getByRole("button", { name: /run preflight|run diagnostic/i }),
    );

    await waitFor(() => {
      expect(screen.getByText(/insecure context/i)).toBeInTheDocument();
    });
  });
});
