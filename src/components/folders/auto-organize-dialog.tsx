import { useMemo, useState } from "react";
import { Loader2, X, Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useFeedStore } from "@/stores/feed-store";
import { useArticleStore } from "@/stores/article-store";
import {
  matchFeedsToTopics,
  DEFAULT_TAXONOMY,
  UNCATEGORIZED_ID,
  type Topic,
} from "@/core/folders/topic-matcher";

interface AutoOrganizeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Convert a free-text keyword input into a clean keyword list. */
function parseKeywords(input: string): string[] {
  return input
    .split(/[\n,]/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);
}

/**
 * Auto-organize feeds into topic folders.
 *
 * Shows the default taxonomy with live match counts (recomputed locally
 * whenever the user adds/removes/edits a topic). Clicking Apply creates
 * a folder for each non-empty topic and moves the matched feeds in.
 *
 * Uncategorized feeds are surfaced as a row but never turned into a
 * folder — leaving them at the top level matches how users typically
 * triage "what doesn't fit yet".
 */
export function AutoOrganizeDialog({
  open,
  onOpenChange,
}: AutoOrganizeDialogProps) {
  const feeds = useFeedStore((s) => s.feeds);
  const applyAutoOrganize = useFeedStore((s) => s.applyAutoOrganize);
  const articlesByFeedId = useArticleStore((s) => s.articlesByFeedId);

  const [taxonomy, setTaxonomy] = useState<Topic[]>(DEFAULT_TAXONOMY);
  const [newName, setNewName] = useState("");
  const [newKeywords, setNewKeywords] = useState("");
  const [isApplying, setIsApplying] = useState(false);

  // Recompute matches every time taxonomy or feeds change.
  const matches = useMemo(
    () => matchFeedsToTopics(feeds, articlesByFeedId, taxonomy),
    [feeds, articlesByFeedId, taxonomy],
  );

  // Group feed ids by topic id for the per-row counts.
  const feedsByTopic = useMemo(() => {
    const out: Record<string, string[]> = { [UNCATEGORIZED_ID]: [] };
    for (const t of taxonomy) out[t.id] = [];
    for (const [feedId, topicId] of matches.entries()) {
      (out[topicId] ??= []).push(feedId);
    }
    return out;
  }, [matches, taxonomy]);

  const totalMatched = useMemo(
    () =>
      taxonomy.reduce(
        (sum, t) => sum + (feedsByTopic[t.id]?.length ?? 0),
        0,
      ),
    [taxonomy, feedsByTopic],
  );

  function renameTopic(id: string, name: string) {
    setTaxonomy((prev) =>
      prev.map((t) => (t.id === id ? { ...t, name } : t)),
    );
  }

  function removeTopic(id: string) {
    setTaxonomy((prev) => prev.filter((t) => t.id !== id));
  }

  function addTopic() {
    const name = newName.trim();
    const keywords = parseKeywords(newKeywords);
    if (!name || keywords.length === 0) return;
    const id = name.toLowerCase().replace(/\s+/g, "-");
    if (taxonomy.some((t) => t.id === id)) return;
    setTaxonomy((prev) => [...prev, { id, name, keywords }]);
    setNewName("");
    setNewKeywords("");
  }

  async function handleApply() {
    setIsApplying(true);
    try {
      const plan = taxonomy
        .map((t) => ({
          folderName: t.name,
          feedIds: feedsByTopic[t.id] ?? [],
        }))
        .filter((p) => p.feedIds.length > 0);
      await applyAutoOrganize(plan);
      onOpenChange(false);
    } finally {
      setIsApplying(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Auto-organize feeds</DialogTitle>
          <DialogDescription>
            Group your feeds into topic folders. Edit the suggested topics
            below before applying — matching runs entirely on your device.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto -mx-1 px-1 space-y-1">
          {taxonomy.map((topic) => {
            const count = feedsByTopic[topic.id]?.length ?? 0;
            return (
              <div
                key={topic.id}
                data-testid={`topic-row-${topic.id}`}
                className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5"
              >
                <Input
                  value={topic.name}
                  onChange={(e) => renameTopic(topic.id, e.target.value)}
                  className="h-8 flex-1"
                />
                <span
                  className="text-sm tabular-nums w-8 text-right text-muted-foreground"
                  aria-label={`${count} feeds`}
                >
                  {count}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  onClick={() => removeTopic(topic.id)}
                  aria-label={`Remove ${topic.name}`}
                >
                  <X className="size-3.5" />
                </Button>
              </div>
            );
          })}

          {/* Uncategorized — informational only, never made into a folder. */}
          <div
            data-testid={`topic-row-${UNCATEGORIZED_ID}`}
            className="flex items-center gap-2 rounded-md border border-dashed border-border px-2 py-1.5 text-muted-foreground"
          >
            <span className="flex-1 text-sm italic px-2">
              Uncategorized (left at top level)
            </span>
            <span
              className="text-sm tabular-nums w-8 text-right"
              aria-label="uncategorized count"
            >
              {feedsByTopic[UNCATEGORIZED_ID]?.length ?? 0}
            </span>
            <span className="size-7" />
          </div>

          {/* Add a new topic */}
          <div className="rounded-md border border-border p-2 space-y-2 mt-2">
            <div className="text-xs font-medium text-muted-foreground">
              Add a topic
            </div>
            <Input
              placeholder="Topic name (e.g. Homelab)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="h-8"
            />
            <Input
              placeholder="Keywords, comma-separated"
              value={newKeywords}
              onChange={(e) => setNewKeywords(e.target.value)}
              className="h-8"
            />
            <Button
              variant="secondary"
              size="sm"
              onClick={addTopic}
              disabled={
                !newName.trim() || parseKeywords(newKeywords).length === 0
              }
              className="w-full"
            >
              <Plus className="size-3.5 mr-1" />
              Add topic
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={isApplying}
          >
            Cancel
          </Button>
          <Button
            onClick={handleApply}
            disabled={totalMatched === 0 || isApplying}
          >
            {isApplying ? (
              <Loader2 className="size-3.5 animate-spin mr-1" />
            ) : null}
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
