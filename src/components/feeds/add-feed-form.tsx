import { useState, useRef, useEffect } from "react";
import { FileUp } from "lucide-react";
import { toast } from "sonner";
import { useFeedStore } from "@/stores/feed-store.ts";
import { Pending } from "@/components/ui/pending.tsx";
import { Kbd } from "@/components/ui/kbd.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group.tsx";
import { SettingsDialog } from "@/components/settings/settings-dialog.tsx";

interface AddFeedFormProps {
  onAdded: () => void;
  onCancel?: () => void;
  onFeedSelect?: (feedId: string) => void;
}

export function AddFeedForm({
  onAdded,
  onCancel,
  onFeedSelect,
}: AddFeedFormProps) {
  const [url, setUrl] = useState("");
  const [importExportOpen, setImportExportOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const addFeed = useFeedStore((s) => s.addFeed);
  const isLoading = useFeedStore((s) => s.isLoading);

  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 100);
    return () => clearTimeout(timer);
  }, []);

  // Global Escape key handler
  useEffect(() => {
    if (!onCancel) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onCancel]);

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
      const newFeedId = useFeedStore.getState().selectedFeedId;
      if (newFeedId && onFeedSelect) onFeedSelect(newFeedId);
      onAdded();
    }
  }

  if (isLoading) {
    return (
      <form aria-label="Add feed" className="p-2">
        <Pending isPending>
          <InputGroupButton type="button" variant="secondary" size="sm">
            Adding feed…
          </InputGroupButton>
        </Pending>
      </form>
    );
  }

  return (
    <>
      <form onSubmit={handleSubmit} aria-label="Add feed" className="p-2">
        <InputGroup className="border-[0.5px]">
          <InputGroupInput
            ref={inputRef}
            type="text"
            inputMode="url"
            placeholder="Feed or site URL"
            required
            aria-label="Feed URL"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <InputGroupAddon align="inline-end">
            <InputGroupButton type="submit" variant="secondary">
              Add
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>

        <div className="flex items-center gap-2 my-2">
          <div className="h-px flex-1 bg-border" />
          <span className="text-xs text-muted-foreground">or</span>
          <div className="h-px flex-1 bg-border" />
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => setImportExportOpen(true)}
        >
          <FileUp className="mr-2 size-4" />
          Import / Export OPML
        </Button>

        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="mt-2 flex w-full items-center justify-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            Cancel <Kbd className="h-5 px-1.5 text-[10px]">Esc</Kbd>
          </button>
        )}
      </form>

      <SettingsDialog
        open={importExportOpen}
        onOpenChange={setImportExportOpen}
      />
    </>
  );
}
