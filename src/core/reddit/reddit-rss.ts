/**
 * Reddit-over-RSS reader for research exports.
 *
 * Reddit exposes an Atom feed for every URL by appending `.rss`:
 *   - `https://www.reddit.com/r/<sub>/.rss`            → the subreddit's posts
 *   - `https://www.reddit.com/r/<sub>/comments/<id>/.rss` → a post's comments
 *
 * This module is the framework-agnostic, network-free core: it builds the
 * feed URLs and parses the Atom payloads into plain structures, then renders
 * a Markdown research export. The actual fetching (and Reddit's rate limits)
 * live in the I/O shell at `scripts/scrape-reddit.ts`.
 *
 * The comment feed is intentionally *crude*: Reddit's `.rss` returns a flat,
 * truncated slice of top comments with no threading or scores. Full comment
 * trees require the OAuth API — out of scope here. See the chat thread that
 * introduced this for the posts-cleanly / comments-crudely trade-off.
 */

import { parseFeed } from "feedsmith";
import { ok, err, type Result } from "../../utils/result.ts";

export interface RedditPost {
  title: string;
  permalink: string;
  author: string;
  publishedAt: number | null;
  bodyText: string;
}

export interface RedditComment {
  author: string;
  publishedAt: number | null;
  text: string;
  permalink: string;
}

export interface RedditThread {
  post: RedditPost;
  comments: RedditComment[];
}

const SUBREDDIT_NAME = /^[A-Za-z0-9_]{1,50}$/;

/** Build the `.rss` listing URL for a subreddit, validating its name. */
export function subredditFeedUrl(subreddit: string, limit: number): Result<string> {
  const name = subreddit.trim().replace(/^\/?r\//i, "");
  if (!SUBREDDIT_NAME.test(name)) {
    return err(`Invalid subreddit name: "${subreddit}"`);
  }
  const clamped = Math.min(100, Math.max(1, Math.floor(limit) || 1));
  return ok(`https://www.reddit.com/r/${name}/.rss?limit=${clamped}`);
}

/** Build the `.rss` comments URL for a post permalink. */
export function commentsFeedUrl(postPermalink: string): Result<string> {
  if (!/^https?:\/\//i.test(postPermalink)) {
    return err(`Not an http(s) permalink: "${postPermalink}"`);
  }
  const trimmed = postPermalink.replace(/\/+$/, "");
  return ok(`${trimmed}/.rss`);
}

/** Parse a subreddit `.rss` listing into posts. */
export function parseSubredditFeed(xml: string): Result<RedditPost[]> {
  return parseAtomEntries(xml, (entry) => ({
    title: entry.title || "Untitled",
    permalink: entry.permalink,
    author: entry.author,
    publishedAt: entry.publishedAt,
    bodyText: htmlToText(entry.contentHtml),
  }));
}

/** Parse a post's `.rss` comments feed into a flat comment list. */
export function parseCommentsFeed(xml: string): Result<RedditComment[]> {
  return parseAtomEntries(xml, (entry) => ({
    author: entry.author,
    publishedAt: entry.publishedAt,
    text: htmlToText(entry.contentHtml),
    permalink: entry.permalink,
  }));
}

interface AtomEntry {
  title: string;
  author: string;
  permalink: string;
  publishedAt: number | null;
  contentHtml: string;
}

function parseAtomEntries<T>(
  xml: string,
  map: (entry: AtomEntry) => T,
): Result<T[]> {
  if (!xml || !xml.trim()) {
    return err("Feed content is empty");
  }
  let parsed: ReturnType<typeof parseFeed>;
  try {
    parsed = parseFeed(xml);
  } catch (e) {
    return err(`Parse error: ${(e as Error).message}`);
  }
  if (parsed.format !== "atom") {
    return err(`Expected an Atom feed, got "${parsed.format}"`);
  }
  const feed = parsed.feed as {
    entries?: Array<{
      title?: string;
      authors?: Array<{ name?: string }>;
      links?: Array<{ href?: string }>;
      content?: string;
      updated?: string;
      published?: string;
    }>;
  };
  const entries = (feed.entries || []).map((entry) =>
    map({
      title: entry.title || "",
      author: entry.authors?.[0]?.name || "",
      permalink: entry.links?.[0]?.href || "",
      publishedAt: parseDate(entry.published || entry.updated),
      contentHtml: entry.content || "",
    }),
  );
  return ok(entries);
}

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
};

/**
 * Crude HTML → plain text. Block boundaries become blank lines; remaining
 * tags are dropped and a handful of common entities decoded. Good enough for
 * a research dump — not a sanitizer (this never reaches a browser DOM).
 */
export function htmlToText(html: string): string {
  if (!html) return "";
  const text = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<\/(p|div|li|h[1-6]|blockquote)>/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&[a-z]+;|&#\d+;/gi, (match) => ENTITIES[match.toLowerCase()] ?? match);

  return text
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function parseDate(value: string | undefined): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

function formatDate(ms: number | null): string {
  return ms === null ? "unknown" : new Date(ms).toISOString().slice(0, 10);
}

/** Render fetched threads into a single Markdown research document. */
export function renderResearchMarkdown(
  subreddit: string,
  threads: RedditThread[],
  fetchedAt: number,
): string {
  const lines: string[] = [
    `# r/${subreddit} — research export`,
    "",
    `_${threads.length} posts · fetched ${new Date(fetchedAt).toISOString()}_`,
    "",
    "_Comments are a flat, truncated slice from Reddit's `.rss` feed (no threading or scores)._",
    "",
  ];

  threads.forEach(({ post, comments }, index) => {
    lines.push(`## ${index + 1}. ${post.title}`, "");
    lines.push(`- **Author:** ${post.author || "unknown"}`);
    lines.push(`- **Posted:** ${formatDate(post.publishedAt)}`);
    lines.push(`- **Link:** ${post.permalink}`, "");
    lines.push(post.bodyText || "_(no selftext)_", "");
    lines.push(`### Comments (${comments.length})`, "");
    for (const comment of comments) {
      lines.push(
        `- **${comment.author || "unknown"}** (${formatDate(comment.publishedAt)}): ${indentMultiline(comment.text)}`,
      );
    }
    lines.push("");
  });

  return lines.join("\n").trimEnd() + "\n";
}

function indentMultiline(text: string): string {
  return text.replace(/\n+/g, " ").trim();
}
