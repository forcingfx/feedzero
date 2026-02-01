import { useState } from "react";
import { useFeedStore } from "@/stores/feed-store.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";

export function AddFeedForm() {
  const [url, setUrl] = useState("");
  const addFeed = useFeedStore((s) => s.addFeed);
  const isLoading = useFeedStore((s) => s.isLoading);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) return;
    await addFeed(trimmed);
    setUrl("");
  }

  return (
    <form
      onSubmit={handleSubmit}
      aria-label="Add feed"
      className="flex gap-xs p-sm"
    >
      <Input
        type="text"
        inputMode="url"
        placeholder="Enter feed URL..."
        required
        aria-label="Feed URL"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        disabled={isLoading}
        className="flex-1"
      />
      <Button type="submit" disabled={isLoading} size="sm">
        {isLoading ? "Adding…" : "Add"}
      </Button>
    </form>
  );
}
