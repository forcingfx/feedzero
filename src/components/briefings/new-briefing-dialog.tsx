import { useState, useMemo } from "react";
import { useNavigate } from "react-router";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useBriefingStore } from "@/stores/briefing-store";
import { useArticleStore } from "@/stores/article-store";
import { matchArticles } from "@/core/briefings/prompt-matcher";
import { computeSignalScore, scoreBand } from "@/core/briefings/signal-score";
import { goToBriefing } from "@/lib/go-to-briefing";
import { toast } from "sonner";
import type { Article } from "@feedzero/core/types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const EXAMPLES = [
  "EU AI Act enforcement actions and Commission rulings",
  "Patent filings and litigation in solid-state batteries",
  "Mergers and acquisitions in mid-market enterprise SaaS",
];

/**
 * Create-a-briefing dialog. Captures name + prompt; previews the signal
 * score against the user's current corpus before they save so they can
 * see upfront whether their feeds cover the topic. The preview is
 * purely local (no LLM); the actual generation happens later from the
 * briefing page's "Refresh" button.
 */
export function NewBriefingDialog({ open, onOpenChange }: Props) {
  const navigate = useNavigate();
  const create = useBriefingStore((s) => s.createBriefing);
  const articlesByFeedId = useArticleStore((s) => s.articlesByFeedId);
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const allArticles = useMemo<Article[]>(() => {
    const out: Article[] = [];
    for (const list of Object.values(articlesByFeedId)) out.push(...list);
    return out;
  }, [articlesByFeedId]);

  const previewScore = useMemo(() => {
    if (!prompt.trim()) return null;
    const matches = matchArticles(prompt, allArticles);
    return {
      score: computeSignalScore({ matches }),
      matchCount: matches.length,
    };
  }, [prompt, allArticles]);

  async function handleSubmit() {
    if (!name.trim() || !prompt.trim()) return;
    setSubmitting(true);
    const result = await create({ name, prompt });
    setSubmitting(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    onOpenChange(false);
    setName("");
    setPrompt("");
    goToBriefing(navigate, result.value.id);
  }

  function handleExample(example: string) {
    setPrompt(example);
    if (!name.trim()) {
      // Lift a name from the first three words of the example as a
      // gentle starting point; the user can edit it.
      const words = example.split(/\s+/).slice(0, 3).join(" ");
      setName(words.replace(/[,.]$/, ""));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New briefing</DialogTitle>
          <DialogDescription>
            Describe what you want briefed on. FeedZero will draw from your
            own feeds and write a short, cited summary on demand.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="briefing-name" className="text-sm font-medium">
              Name
            </label>
            <Input
              id="briefing-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. EU AI Act"
              maxLength={80}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="briefing-prompt" className="text-sm font-medium">
              Prompt
            </label>
            <Textarea
              id="briefing-prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="What should the briefing cover?"
              rows={4}
              maxLength={500}
            />
            <div className="flex flex-wrap gap-1.5">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => handleExample(ex)}
                  className="rounded border border-border bg-muted px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent"
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
          {previewScore !== null ? (
            <div className="rounded-md border border-border bg-muted/40 p-3 text-xs">
              <p className="font-medium">
                Preview: {previewScore.matchCount} matching article
                {previewScore.matchCount === 1 ? "" : "s"} ·{" "}
                <span
                  className={
                    scoreBand(previewScore.score) === "strong"
                      ? "text-emerald-600"
                      : scoreBand(previewScore.score) === "moderate"
                        ? "text-amber-600"
                        : "text-rose-600"
                  }
                >
                  {scoreBand(previewScore.score)} signal · {previewScore.score}/100
                </span>
              </p>
              <p className="mt-1 text-muted-foreground">
                You can always refresh later as your feeds grow.
              </p>
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => void handleSubmit()}
            disabled={submitting || !name.trim() || !prompt.trim()}
          >
            {submitting ? "Creating..." : "Create briefing"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
