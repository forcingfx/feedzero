import { useState } from "react";
import { Button } from "@/components/ui/button.tsx";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog.tsx";
import type { Feed } from "@/types/index.ts";

interface FeedItemProps {
  feed: Feed;
  isSelected: boolean;
  onSelect: (feedId: string) => void;
  onRemove: (feedId: string) => void;
}

export function FeedItem({
  feed,
  isSelected,
  onSelect,
  onRemove,
}: FeedItemProps) {
  const [dialogOpen, setDialogOpen] = useState(false);

  function handleRemoveClick(e: React.MouseEvent) {
    e.stopPropagation();
    setDialogOpen(true);
  }

  function handleConfirmRemove() {
    onRemove(feed.id);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect(feed.id);
    }
  }

  return (
    <li
      role="option"
      tabIndex={0}
      aria-selected={isSelected}
      data-id={feed.id}
      onClick={() => onSelect(feed.id)}
      onKeyDown={handleKeyDown}
      className="flex items-center justify-between px-sm py-xs cursor-pointer hover:bg-accent aria-selected:bg-accent aria-selected:font-semibold group"
    >
      <span className="truncate">{feed.title}</span>
      <AlertDialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <AlertDialogTrigger asChild>
          <Button
            variant="ghost"
            size="icon-xs"
            className="opacity-0 group-hover:opacity-100 focus:opacity-100 text-destructive"
            aria-label={`Remove ${feed.title}`}
            onClick={handleRemoveClick}
          >
            &times;
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove feed</AlertDialogTitle>
            <AlertDialogDescription>
              Remove &ldquo;{feed.title}&rdquo;? This will also delete all its
              articles.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleConfirmRemove}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}
