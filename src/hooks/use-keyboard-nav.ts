import { useEffect, useCallback } from "react";
import { useNavigate } from "react-router";
import { useArticleStore } from "@/stores/article-store.ts";
import { useFeedStore } from "@/stores/feed-store.ts";
import { useExtractionStore } from "@/stores/extraction-store.ts";
import { toFolderFeedId } from "@/utils/constants.ts";
import { goToSettings } from "@/lib/go-to-settings.ts";

/**
 * Keyboard navigation hook for feed reader shortcuts.
 *
 * Article nav:  j/k (next/prev — directly opens article)
 * Feed nav:     u/i (next/prev feed)
 * Actions:      o (open original), e (toggle view), n (explore/add feed)
 */
export function useKeyboardNav() {
  const navigate = useNavigate();
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Cmd/Ctrl+, navigates to the Settings stage page. The previous
    // event-indirection lived because the SettingsMenu dropdown listened
    // for it; Settings is now a route, so we just navigate.
    if (e.key === "," && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      goToSettings(navigate);
      return;
    }

    const target = e.target as HTMLElement;

    // Skip when user is typing in an input or navigating a menu/dialog
    if (
      target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.isContentEditable ||
      (target.closest &&
        target.closest('[role="menu"], [role="dialog"], [role="alertdialog"]'))
    ) {
      return;
    }

    switch (e.key) {
      case "j":
      case "ArrowDown":
        moveArticle(1);
        break;
      case "k":
      case "ArrowUp":
        moveArticle(-1);
        break;
      case "u":
        moveFeedFocus(1);
        break;
      case "i":
        moveFeedFocus(-1);
        break;
      case "o":
        openOriginal();
        break;
      case "h":
        toggleView();
        break;
      case "n":
        navigateToExplore();
        break;
      case "[":
        toggleSidebar();
        break;
      case " ":
        scrollReader(e.shiftKey ? -1 : 1);
        break;
      case "r":
        refreshAllFeeds();
        break;
      default:
        return;
    }

    e.preventDefault();
  }, [navigate]);

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
}

/** Clamp next index within bounds, defaulting to first or last when no current index. */
function clampedIndex(
  currentIndex: number,
  direction: 1 | -1,
  length: number,
): number {
  if (currentIndex === -1) {
    return direction === 1 ? 0 : length - 1;
  }
  return Math.max(0, Math.min(length - 1, currentIndex + direction));
}

function moveArticle(direction: 1 | -1) {
  const listbox = document.querySelector<HTMLElement>('[role="listbox"]');
  if (!listbox) return;

  const items = Array.from(
    listbox.querySelectorAll<HTMLElement>('[role="option"]'),
  );
  if (items.length === 0) return;

  const selectedIndex = items.findIndex(
    (item) => item.getAttribute("aria-selected") === "true",
  );
  const nextItem = items[clampedIndex(selectedIndex, direction, items.length)];

  nextItem.click();

  // Scroll into view after selection
  // Use setTimeout to ensure click has processed and DOM has updated
  setTimeout(() => {
    nextItem.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "nearest",
    });
  }, 0);
}

/**
 * Build the ordered list of feed IDs that U / I should traverse, mirroring
 * the sidebar's render order: unfiled feeds (sorted by the current mode),
 * then for each folder its aggregated-feed id followed by its child feeds.
 *
 * The list is derived from feed-store state, not from the DOM, because
 * Radix `Collapsible.Content` unmounts the children of a closed folder.
 * A pure DOM walk would skip those feeds entirely; the store walk reaches
 * them, and the caller auto-expands the folder before navigating in.
 */
function buildLogicalFeedList(): string[] {
  const { feeds, folders, feedSortMode, feedCustomOrder, folderCustomOrder } =
    useFeedStore.getState();

  function applyCustomOrder<T extends { id: string }>(items: T[], order: string[]): T[] {
    if (feedSortMode !== "custom") return items;
    return [...items].sort((a, b) => {
      const ai = order.indexOf(a.id);
      const bi = order.indexOf(b.id);
      if (ai === -1 && bi === -1) return 0;
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
  }

  const unfiled = applyCustomOrder(
    feeds.filter((f) => !f.folderId),
    feedCustomOrder,
  );
  const orderedFolders = applyCustomOrder(folders, folderCustomOrder);

  const ids: string[] = unfiled.map((f) => f.id);
  for (const folder of orderedFolders) {
    ids.push(toFolderFeedId(folder.id));
    const children = applyCustomOrder(
      feeds.filter((f) => f.folderId === folder.id),
      feedCustomOrder,
    );
    for (const child of children) ids.push(child.id);
  }
  return ids;
}

function moveFeedFocus(direction: 1 | -1) {
  const list = buildLogicalFeedList();
  if (list.length === 0) return;
  const { selectedFeedId, feeds, setFolderOpen } = useFeedStore.getState();
  const currentIndex = selectedFeedId ? list.indexOf(selectedFeedId) : -1;
  const nextIndex = clampedIndex(currentIndex, direction, list.length);
  const nextId = list[nextIndex];

  // If the next id is a child feed inside a folder, ensure that folder is
  // open before we navigate — otherwise the user would be selecting a feed
  // they cannot see in the sidebar.
  const childFeed = feeds.find((f) => f.id === nextId);
  if (childFeed?.folderId) {
    setFolderOpen(childFeed.folderId, true);
  }

  document.dispatchEvent(
    new CustomEvent("feedzero:navigate-feed", { detail: { feedId: nextId } }),
  );
}

function openOriginal() {
  const { selectedArticle } = useArticleStore.getState();
  if (selectedArticle?.link) {
    window.open(selectedArticle.link, "_blank", "noopener,noreferrer");
  }
}

function toggleView() {
  const { toggleViewMode } = useExtractionStore.getState();
  const { selectedArticle } = useArticleStore.getState();
  toggleViewMode(selectedArticle?.link);
}

/** Scroll the reader panel by one viewport height. Shift+Space scrolls up. */
function scrollReader(direction: 1 | -1) {
  // Find the reader's scroll container (the ScrollArea viewport wrapping the reader)
  const reader = document.querySelector("article")?.closest(
    '[data-radix-scroll-area-viewport]',
  ) as HTMLElement | null;
  if (reader) {
    reader.scrollBy({ top: direction * reader.clientHeight * 0.8, behavior: "smooth" });
  }
}

function navigateToExplore() {
  document.dispatchEvent(new CustomEvent("feedzero:navigate-explore"));
}

function toggleSidebar() {
  document.dispatchEvent(new CustomEvent("feedzero:toggle-sidebar"));
}

function refreshAllFeeds() {
  useFeedStore.getState().refreshAll();
}
