/**
 * Discoverability — the sidebar header exposes a button that opens the
 * command palette, with the ⌘K shortcut visible so users learn the
 * hotkey by sight rather than having to read docs.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { AppSidebar } from "@/components/layout/app-sidebar.tsx";
import { SidebarProvider } from "@/components/ui/sidebar.tsx";
import { useFeedStore } from "@/stores/feed-store.ts";
import { useSyncStore } from "@/stores/sync-store.ts";
import { useCommandPaletteStore } from "@/stores/command-palette-store.ts";

vi.mock("@/hooks/use-online", () => ({
  useIsOnline: () => true,
}));

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <MemoryRouter>
      <SidebarProvider>{children}</SidebarProvider>
    </MemoryRouter>
  );
}

describe("AppSidebar → command palette discoverability", () => {
  beforeEach(() => {
    useFeedStore.setState({
      feeds: [],
      refreshAll: vi.fn(),
      isRefreshingAll: false,
    } as never);
    useSyncStore.setState({ status: "local-only" } as never);
    useCommandPaletteStore.setState({ isOpen: false });
  });

  it("renders a button in the sidebar header that opens the palette", async () => {
    const user = userEvent.setup();
    render(<AppSidebar collapsible="none" />, { wrapper: Wrapper });

    const button = screen.getByRole("button", { name: /search|command/i });
    expect(button).toBeInTheDocument();

    await user.click(button);

    expect(useCommandPaletteStore.getState().isOpen).toBe(true);
  });
});
