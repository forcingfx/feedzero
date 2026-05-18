/**
 * <FeedbackDialog> — three feedback channels, anonymous by default.
 *
 * Issue #102 asked for: link out to GitHub Issues first (where users can see
 * the maintainer's responses and existing threads), link to email support,
 * and an optional email field so a user who wants a reply can identify
 * themselves. This dialog renders all three:
 *
 *   - Top: two outline buttons for the discoverable channels — `Browse on
 *     GitHub` and `Email support`. Linking out is the fastest path when the
 *     user wants to read existing issues or have a back-and-forth thread.
 *   - Middle: the quick-note textarea. Anonymous by default. POSTs to
 *     `/api/feedback` which creates a GitHub issue server-side.
 *   - Bottom: optional email input. If provided, server appends a
 *     `Reply to:` line to the issue body so the maintainer can email back.
 *     A muted helper line below the input tells the user the email will be
 *     visible on the public issue — that's the consent signal.
 */
import { useState } from "react";
import { Loader2, MessagesSquare, Mail, ExternalLink } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { SUPPORT_EMAIL } from "@/components/settings/contact-support";
import { toast } from "sonner";

const MAX_LENGTH = 2000;
const GITHUB_ISSUES_URL = "https://github.com/forcingfx/feedzero/issues";

interface FeedbackDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function FeedbackDialog({ open, onOpenChange }: FeedbackDialogProps) {
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [isSending, setIsSending] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedMessage = message.trim();
    if (!trimmedMessage) return;

    const trimmedEmail = email.trim();
    const payload: { message: string; email?: string } = {
      message: trimmedMessage,
    };
    if (trimmedEmail) payload.email = trimmedEmail;

    setIsSending(true);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (data.ok) {
        toast.success("Thanks for your feedback!");
        setMessage("");
        setEmail("");
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

  // Cmd+Enter (mac) / Ctrl+Enter (others) submits without leaving the textarea.
  // Plain Enter still inserts a newline so multi-line feedback stays natural.
  function handleTextareaKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      if (isSending || !message.trim()) return;
      void handleSubmit(e);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Send feedback</DialogTitle>
          <DialogDescription>
            Tell us what you think, report a bug, or suggest a feature.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md border border-border bg-muted/40 p-3 space-y-2">
          <p className="text-xs text-muted-foreground">
            For a threaded conversation or to see existing reports:
          </p>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <a
                href={GITHUB_ISSUES_URL}
                target="_blank"
                rel="noreferrer noopener"
              >
                <MessagesSquare className="mr-2 size-3.5" />
                Browse on GitHub
                <ExternalLink className="ml-1 size-3" />
              </a>
            </Button>
            <Button asChild variant="outline" size="sm">
              <a href={`mailto:${SUPPORT_EMAIL}`}>
                <Mail className="mr-2 size-3.5" />
                Email support
              </a>
            </Button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1">
            <label
              htmlFor="feedback-message"
              className="text-xs font-medium text-muted-foreground"
            >
              Or send a quick note here
            </label>
            <textarea
              id="feedback-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={handleTextareaKeyDown}
              placeholder="What's on your mind?"
              maxLength={MAX_LENGTH}
              rows={5}
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
              disabled={isSending}
              autoFocus
            />
            <div className="text-right text-xs text-muted-foreground">
              {message.length}/{MAX_LENGTH}
            </div>
          </div>

          <div className="space-y-1">
            <label
              htmlFor="feedback-email"
              className="text-xs font-medium text-muted-foreground"
            >
              Email{" "}
              <span className="font-normal">(optional, for replies)</span>
            </label>
            <input
              id="feedback-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              maxLength={254}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              disabled={isSending}
            />
            <p className="text-xs text-muted-foreground">
              We&apos;ll reply from{" "}
              <a
                href={`mailto:${SUPPORT_EMAIL}`}
                className="underline hover:no-underline"
              >
                {SUPPORT_EMAIL}
              </a>
              . Your email will be visible on the public GitHub issue this
              feedback creates.
            </p>
          </div>

          <DialogFooter>
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
        </form>
      </DialogContent>
    </Dialog>
  );
}
