import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePersistedPanelWidth } from "@/hooks/use-persisted-panel-width.ts";

describe("usePersistedPanelWidth", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("keeps each panel's width under its own key", () => {
    // The sidebar and the article list share this hook; dragging one must
    // never move the other on the next load.
    const sidebar = renderHook(() => usePersistedPanelWidth("test:sidebar"));
    act(() => sidebar.result.current.onResize({ asPercentage: 20, inPixels: 240 }));

    const list = renderHook(() => usePersistedPanelWidth("test:list"));
    expect(list.result.current.defaultSize).toBeUndefined();

    act(() => list.result.current.onResize({ asPercentage: 30, inPixels: 300 }));
    expect(renderHook(() => usePersistedPanelWidth("test:sidebar")).result.current.defaultSize).toBe("240px");
    expect(renderHook(() => usePersistedPanelWidth("test:list")).result.current.defaultSize).toBe("300px");
  });

  it("ignores a stored value that is not a positive number", () => {
    window.localStorage.setItem("test:list", "wide");
    expect(renderHook(() => usePersistedPanelWidth("test:list")).result.current.defaultSize).toBeUndefined();
  });
});
