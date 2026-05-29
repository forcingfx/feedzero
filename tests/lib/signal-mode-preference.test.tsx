import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  useSignalMode,
  useSignalAIHidden,
  useSignalNightlyRefresh,
} from "@/lib/signal-mode-preference";

beforeEach(() => {
  localStorage.clear();
});

/**
 * The mode preference is read by two callers that live in the same React
 * tree: the Signal page (decides which view to render) and any other
 * component that needs to react to a change (e.g., the read-only mode
 * badge, or the Settings toggle).
 *
 * The pre-existing implementation backed each `useSignalMode()` with its
 * own `useState`, syncing only via the `storage` event — which never
 * fires for the tab that wrote the value. Result: a write in one
 * subscriber didn't re-render the other. This locks the contract: every
 * subscriber in the same tab sees the same value after a write.
 */
describe("useSignalMode — in-tab sync", () => {
  function Reader({ id }: { id: string }) {
    const [mode] = useSignalMode();
    return <span data-testid={id}>{mode}</span>;
  }

  function Writer() {
    const [, setMode] = useSignalMode();
    return (
      <button type="button" onClick={() => setMode("ai")}>
        flip-to-ai
      </button>
    );
  }

  it("propagates a setMode call to every subscriber in the same tab", async () => {
    const user = userEvent.setup();
    render(
      <>
        <Reader id="a" />
        <Reader id="b" />
        <Writer />
      </>,
    );

    expect(screen.getByTestId("a").textContent).toBe("ml");
    expect(screen.getByTestId("b").textContent).toBe("ml");

    await user.click(screen.getByRole("button", { name: "flip-to-ai" }));

    expect(screen.getByTestId("a").textContent).toBe("ai");
    expect(screen.getByTestId("b").textContent).toBe("ai");
  });
});

/**
 * Nightly refresh is a new field. Off by default; persists to
 * localStorage; in-tab subscribers stay in sync via the same store.
 */
describe("useSignalNightlyRefresh", () => {
  function Reader({ id }: { id: string }) {
    const [nightly] = useSignalNightlyRefresh();
    return <span data-testid={id}>{nightly ? "on" : "off"}</span>;
  }

  function Writer() {
    const [, setNightly] = useSignalNightlyRefresh();
    return (
      <button type="button" onClick={() => setNightly(true)}>
        enable
      </button>
    );
  }

  it("defaults to off and persists/propagates a flip", async () => {
    const user = userEvent.setup();
    render(
      <>
        <Reader id="a" />
        <Reader id="b" />
        <Writer />
      </>,
    );
    expect(screen.getByTestId("a").textContent).toBe("off");
    expect(screen.getByTestId("b").textContent).toBe("off");

    await user.click(screen.getByRole("button", { name: "enable" }));

    expect(screen.getByTestId("a").textContent).toBe("on");
    expect(screen.getByTestId("b").textContent).toBe("on");
    expect(localStorage.getItem("feedzero:signal-nightly-refresh")).toBe("1");
  });
});

/**
 * The legacy `useSignalAIHidden` hook is being removed in commit 5
 * (its "hide the toggle" affordance no longer makes sense once the
 * toggle is moved to Settings and the mode is a direct choice). For the
 * scope of commit 1 the hook stays available for back-compat — but its
 * in-tab sync must work the same way.
 */
describe("useSignalAIHidden — in-tab sync (legacy)", () => {
  function Reader() {
    const [hidden] = useSignalAIHidden();
    return <span data-testid="hidden">{hidden ? "yes" : "no"}</span>;
  }
  function Writer() {
    const [, setHidden] = useSignalAIHidden();
    return (
      <button type="button" onClick={() => setHidden(true)}>
        hide
      </button>
    );
  }
  it("a setHidden call re-renders other subscribers in the same tab", async () => {
    const user = userEvent.setup();
    render(
      <>
        <Reader />
        <Writer />
      </>,
    );
    expect(screen.getByTestId("hidden").textContent).toBe("no");
    await user.click(screen.getByRole("button", { name: "hide" }));
    expect(screen.getByTestId("hidden").textContent).toBe("yes");
  });
});

describe("cross-tab sync via the storage event", () => {
  it("an external storage event updates every subscriber", () => {
    function Reader() {
      const [mode] = useSignalMode();
      return <span data-testid="x">{mode}</span>;
    }
    render(<Reader />);
    expect(screen.getByTestId("x").textContent).toBe("ml");

    act(() => {
      localStorage.setItem("feedzero:signal-mode", "ai");
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "feedzero:signal-mode",
          newValue: "ai",
        }),
      );
    });

    expect(screen.getByTestId("x").textContent).toBe("ai");
  });
});
