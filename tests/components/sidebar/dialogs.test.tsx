import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FeedRemoveDialog } from "@/components/sidebar/feed-remove-dialog.tsx";
import { FeedReloadDialog } from "@/components/sidebar/feed-reload-dialog.tsx";
import { FolderDeleteDialog } from "@/components/sidebar/folder-delete-dialog.tsx";

describe("FeedRemoveDialog", () => {
  it("renders feed title in description", () => {
    render(<FeedRemoveDialog feedTitle="Ars Technica" open={true} onOpenChange={vi.fn()} onConfirm={vi.fn()} />);
    expect(screen.getByText(/Ars Technica/)).toBeInTheDocument();
  });

  it("calls onConfirm when Remove is clicked", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<FeedRemoveDialog feedTitle="Test" open={true} onOpenChange={vi.fn()} onConfirm={onConfirm} />);
    await user.click(screen.getByRole("button", { name: /remove/i }));
    expect(onConfirm).toHaveBeenCalled();
  });
});

describe("FeedReloadDialog", () => {
  it("renders feed title and warns about lost status", () => {
    render(<FeedReloadDialog feedTitle="BBC News" open={true} onOpenChange={vi.fn()} onConfirm={vi.fn()} />);
    expect(screen.getByText(/BBC News/)).toBeInTheDocument();
    expect(screen.getByText(/read\/unread status/i)).toBeInTheDocument();
  });

  it("calls onConfirm when Clear is clicked", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<FeedReloadDialog feedTitle="Test" open={true} onOpenChange={vi.fn()} onConfirm={onConfirm} />);
    await user.click(screen.getByRole("button", { name: /clear and reload/i }));
    expect(onConfirm).toHaveBeenCalled();
  });
});

describe("FolderDeleteDialog", () => {
  it("renders folder name and warns feeds are preserved", () => {
    render(<FolderDeleteDialog folderName="Tech" open={true} onOpenChange={vi.fn()} onConfirm={vi.fn()} />);
    expect(screen.getByText(/Tech/)).toBeInTheDocument();
    expect(screen.getByText(/moved to the top level/i)).toBeInTheDocument();
  });

  it("calls onConfirm when Delete is clicked", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<FolderDeleteDialog folderName="Test" open={true} onOpenChange={vi.fn()} onConfirm={onConfirm} />);
    await user.click(screen.getByRole("button", { name: /delete folder/i }));
    expect(onConfirm).toHaveBeenCalled();
  });
});
