import { toast } from "sonner";
import { LOCAL_STORAGE } from "@feedzero/core/utils/constants";
import type { Article, Feed } from "@feedzero/core/types";
import { shouldOpenInFullText } from "@/core/extractor/open-in-full-text.ts";
import { useFeedStore } from "@/stores/feed-store.ts";
import { usePreferencesStore } from "@/stores/preferences-store.ts";

/**
 * Articles of one feed the reader must ask full text for before the app
 * offers to make it that feed's default. One request is curiosity; a
 * second is a habit worth saving them from.
 */
const REQUESTS_BEFORE_SUGGESTING = 2;

/** Stored in place of a count once a feed's offer has been made. */
const ASKED = "asked";

type RequestLog = Record<string, number | typeof ASKED>;

/**
 * Articles already counted since the page loaded, so flipping one
 * article between Feed and Full text counts once.
 */
const countedArticleIds = new Set<string>();

/**
 * Record that the reader asked for an article's full text by hand, and on
 * the second article of the same feed offer to open that feed in full
 * text from now on.
 *
 * The offer is made once per feed, ever: accepted or ignored, it does not
 * come back. A feed that already opens in full text (its own setting, its
 * folder's, or the app default) is never counted.
 */
export function noteFullTextRequest(article: Article): void {
  const { feeds, folders } = useFeedStore.getState();
  const feed = feeds.find((f) => f.id === article.feedId);
  if (!feed) return;
  const appDefault = usePreferencesStore.getState().preferences.openArticlesIn;
  if (shouldOpenInFullText(feed, folders, appDefault)) return;
  if (countedArticleIds.has(article.id)) return;
  countedArticleIds.add(article.id);

  const log = readRequestLog();
  const previous = log[feed.id];
  if (previous === ASKED) return;
  const count = (previous ?? 0) + 1;
  const shouldSuggest = count >= REQUESTS_BEFORE_SUGGESTING;
  writeRequestLog({ ...log, [feed.id]: shouldSuggest ? ASKED : count });
  if (shouldSuggest) suggestAlwaysFullText(feed);
}

/** Forget which articles this page load has counted. For tests. */
export function resetFullTextRequestSession(): void {
  countedArticleIds.clear();
}

function suggestAlwaysFullText(feed: Feed): void {
  toast(`Always open ${feed.title} in full text?`, {
    description: "You can change this later in the feed's settings.",
    duration: 10_000,
    action: {
      label: "Always",
      onClick: () => {
        void useFeedStore
          .getState()
          .setFeedPreferFullText(feed.id, true)
          .then(() => toast(`${feed.title} now opens in full text`));
      },
    },
  });
}

function readRequestLog(): RequestLog {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE.FULL_TEXT_REQUESTS);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as RequestLog;
    }
  } catch { /* unreadable or unavailable: start from nothing */ }
  return {};
}

function writeRequestLog(log: RequestLog): void {
  try {
    localStorage.setItem(LOCAL_STORAGE.FULL_TEXT_REQUESTS, JSON.stringify(log));
  } catch { /* localStorage unavailable: the offer may simply repeat */ }
}
