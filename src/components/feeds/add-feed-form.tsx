import { useState, useRef, useEffect } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { useFeedStore } from "@/stores/feed-store.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible.tsx";

export function AddFeedForm() {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const addFeed = useFeedStore((s) => s.addFeed);
  const isLoading = useFeedStore((s) => s.isLoading);

  useEffect(() => {
    if (open) {
      // Small delay to let collapsible animate open before focusing
      const timer = setTimeout(() => inputRef.current?.focus(), 100);
      return () => clearTimeout(timer);
    }
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) return;

    const toastId = toast.loading("Discovering feed…");

    await addFeed(trimmed);
    setUrl("");
    setOpen(false);

    // addFeed sets error in store on failure — read it
    const error = useFeedStore.getState().error;
    if (error) {
      toast.error(error, { id: toastId });
    } else {
      toast.success("Feed added", { id: toastId });
    }
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="px-2 py-1">
      <CollapsibleTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-start gap-2"
        >
          <Plus className="size-4" />
          Add Feed
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <form
          onSubmit={handleSubmit}
          aria-label="Add feed"
          className="flex gap-xs pt-2"
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
      </CollapsibleContent>
    </Collapsible>
  );
}
