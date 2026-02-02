import { useState, useRef, useEffect } from "react";
import { toast } from "sonner";
import { useFeedStore } from "@/stores/feed-store.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";

interface AddFeedFormProps {
  onAdded: () => void;
}

export function AddFeedForm({ onAdded }: AddFeedFormProps) {
  const [url, setUrl] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const addFeed = useFeedStore((s) => s.addFeed);
  const isLoading = useFeedStore((s) => s.isLoading);

  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 100);
    return () => clearTimeout(timer);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) return;

    const toastId = toast.loading("Discovering feed…");
    await addFeed(trimmed);
    setUrl("");

    const error = useFeedStore.getState().error;
    if (error) {
      toast.error(error, { id: toastId });
    } else {
      toast.success("Feed added", { id: toastId });
      onAdded();
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      aria-label="Add feed"
      className="flex gap-1 p-2"
    >
      <Input
        ref={inputRef}
        type="text"
        inputMode="url"
        placeholder="Feed or site URL…"
        required
        aria-label="Feed URL"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        disabled={isLoading}
        className="flex-1"
      />
      <Button type="submit" disabled={isLoading} size="sm">
        Add
      </Button>
    </form>
  );
}
