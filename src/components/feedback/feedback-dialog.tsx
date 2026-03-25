import { useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const MAX_LENGTH = 2000;

interface FeedbackDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function FeedbackDialog({ open, onOpenChange }: FeedbackDialogProps) {
  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = message.trim();
    if (!trimmed) return;

    setIsSending(true);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed }),
      });
      const data = await res.json();

      if (data.ok) {
        toast.success("Thanks for your feedback!");
        setMessage("");
        onOpenChange(false);
      } else {
        toast.error(data.error || "Could not send feedback");
      }
    } catch {
      toast.error("Could not send feedback. Check your connection.");
    } finally {
      setIsSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Send Feedback</DialogTitle>
          <DialogDescription>
            Tell us what you think, report a bug, or suggest a feature.
            No account needed — this is anonymous.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="What's on your mind?"
            maxLength={MAX_LENGTH}
            rows={5}
            className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
            disabled={isSending}
            autoFocus
          />
          <div className="flex items-center justify-between mt-2">
            <span className="text-xs text-muted-foreground">
              {message.length}/{MAX_LENGTH}
            </span>
            <DialogFooter className="p-0">
              <Button
                type="submit"
                size="sm"
                disabled={!message.trim() || isSending}
              >
                {isSending ? (
                  <Loader2 className="size-3.5 animate-spin mr-1" />
                ) : null}
                Send
              </Button>
            </DialogFooter>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
