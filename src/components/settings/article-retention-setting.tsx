import { useState } from "react";
import { History } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { usePreferencesStore } from "@/stores/preferences-store";
import { ARTICLE_RETENTION_OPTIONS } from "@/core/storage/article-retention";
import { DEFAULT_ARTICLE_RETENTION } from "@feedzero/core/types";
import type { ArticleRetention } from "@feedzero/core/types";

const LABELS: Record<string, string> = {
  "7": "7 days",
  "14": "14 days",
  "30": "30 days",
  "90": "90 days",
  "365": "1 year",
  never: "Forever",
};

function label(retention: ArticleRetention): string {
  return LABELS[String(retention)];
}

function asDays(retention: ArticleRetention): number {
  return retention === "never" ? Infinity : retention;
}

function parseRetention(value: string): ArticleRetention {
  return value === "never" ? "never" : (Number(value) as ArticleRetention);
}

function articles(count: number): string {
  return count === 1 ? "1 article" : `${count} articles`;
}

interface PendingShortening {
  retention: ArticleRetention;
  removes: number;
}

/**
 * Settings → Reading → Keep articles.
 *
 * Shortening the period deletes articles immediately, on every device
 * the vault syncs to, and cannot be undone, so it asks first and says
 * how many (owner's call). Lengthening, or a shortening that removes
 * nothing, applies at once.
 */
export function ArticleRetentionSetting() {
  const current = usePreferencesStore(
    (s) => s.preferences.articleRetention ?? DEFAULT_ARTICLE_RETENTION,
  );
  const countArticlesExpiredBy = usePreferencesStore(
    (s) => s.countArticlesExpiredBy,
  );
  const setArticleRetention = usePreferencesStore((s) => s.setArticleRetention);
  const [pending, setPending] = useState<PendingShortening | null>(null);

  async function choose(next: ArticleRetention) {
    if (next === current) return;
    const shortening = asDays(next) < asDays(current);
    const removes = shortening ? await countArticlesExpiredBy(next) : 0;
    if (removes > 0) setPending({ retention: next, removes });
    else await setArticleRetention(next);
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <History className="size-4 text-muted-foreground" />
        <label htmlFor="article-retention" className="text-sm font-medium">
          Keep articles
        </label>
      </div>
      <p className="text-xs text-muted-foreground">
        Older articles are deleted on every device, which keeps your vault
        small. Starred articles are always kept.
      </p>
      <select
        id="article-retention"
        className="h-9 rounded-md border bg-background px-2 text-sm"
        value={String(current)}
        onChange={(e) => void choose(parseRetention(e.target.value))}
      >
        {ARTICLE_RETENTION_OPTIONS.map((option) => (
          <option key={option} value={String(option)}>
            {label(option)}
          </option>
        ))}
      </select>

      <AlertDialog
        open={pending !== null}
        onOpenChange={(open) => !open && setPending(null)}
      >
        {pending && (
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove {articles(pending.removes)}?</AlertDialogTitle>
              <AlertDialogDescription>
                Articles published more than {label(pending.retention)} ago
                are deleted on every device your vault syncs to. Starred
                articles are kept. This can&apos;t be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => void setArticleRetention(pending.retention)}
              >
                Remove {articles(pending.removes)}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        )}
      </AlertDialog>
    </div>
  );
}
