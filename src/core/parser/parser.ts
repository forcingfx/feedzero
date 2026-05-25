import { parseFeed } from "feedsmith";
import { ok, err } from "../../../packages/core/src/utils/result";
import type { Result } from "../../../packages/core/src/utils/result";
import { sanitize } from "./sanitizer.ts";
import { cleanFeedContent } from "../extractor/cleanup.ts";

interface ParsedFeed {
  title: string;
  description: string;
  siteUrl: string;
  url: string;
}

export interface ParsedArticle {
  title: string;
  link: string;
  content: string;
  summary: string;
  author: string;
  publishedAt: number | null;
  guid: string;
}

/**
 * Discriminator on the underlying feed format. Used by UI affordances
 * that want to celebrate which format actually parsed (e.g. the
 * discovery chip under the Explore URL input).
 *
 * RDF is RSS 1.0; from a user-facing standpoint it's still "RSS", so
 * we normalise it to `rss` rather than exposing a separate `rdf` label
 * that no one outside the W3C remembers.
 */
export type FeedFormat = "rss" | "atom" | "json";

export interface ParseResult {
  feed: ParsedFeed;
  articles: ParsedArticle[];
  /** Which format feedsmith identified. See {@link FeedFormat}. */
  format: FeedFormat;
}

/**
 * Parse an RSS, Atom, RDF, or JSON Feed string using feedsmith.
 */
export function parse(text: string, feedUrl: string): Result<ParseResult> {
  if (!text || typeof text !== "string" || !text.trim()) {
    return err("Feed content is empty or not a string");
  }

  // Reject JSON that doesn't look like a JSON Feed
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) {
    try {
      const json = JSON.parse(trimmed);
      if (!json.version || !String(json.version).includes("jsonfeed")) {
        return err("JSON object is not a JSON Feed (missing jsonfeed version)");
      }
    } catch {
      // Not valid JSON, let feedsmith handle the error
    }
  }

  try {
    const result = parseFeed(text);
    return mapToParseResult(result, feedUrl);
  } catch (e) {
    return err(`Parse error: ${(e as Error).message}`);
  }
}

type FeedsmithResult = ReturnType<typeof parseFeed>;

function mapToParseResult(
  result: FeedsmithResult,
  feedUrl: string,
): Result<ParseResult> {
  const { format, feed: rawFeed } = result;

  if (format === "rss" || format === "rdf") {
    return attachFormat(mapRssFeed(rawFeed, feedUrl), "rss");
  } else if (format === "atom") {
    return attachFormat(mapAtomFeed(rawFeed, feedUrl), "atom");
  } else if (format === "json") {
    return attachFormat(mapJsonFeed(rawFeed, feedUrl), "json");
  }

  return err(`Unsupported feed format: ${format}`);
}

function attachFormat(
  inner: Result<Omit<ParseResult, "format">>,
  format: FeedFormat,
): Result<ParseResult> {
  return inner.ok ? ok({ ...inner.value, format }) : inner;
}

function mapRssFeed(
  feed: FeedsmithResult["feed"],
  feedUrl: string,
): Result<Omit<ParseResult, "format">> {
  const rssFeed = feed as Extract<FeedsmithResult, { format: "rss" }>["feed"];

  const parsedFeed: ParsedFeed = {
    title: decodeEntities(rssFeed.title || "") || feedUrl,
    description: decodeEntities(rssFeed.description || ""),
    siteUrl: rssFeed.link || "",
    url: feedUrl,
  };

  const articles: ParsedArticle[] = (rssFeed.items || []).map((item) => {
    // Prefer content:encoded over description for full content
    const contentEncoded = item.content?.encoded;
    const description = item.description;
    const fullContent = stripNoneArtifact(contentEncoded || description || "");
    const summary = stripNoneArtifact(description || "");

    // Author: prefer dc:creator, then authors array
    const dcCreator = item.dc?.creator;
    const authorFromList = item.authors?.[0];
    const author =
      dcCreator ||
      (typeof authorFromList === "string"
        ? authorFromList
        : (authorFromList as { name?: string } | undefined)?.name) ||
      "";

    const itemTitle = decodeEntities(item.title || "") || "Untitled";
    return {
      title: itemTitle,
      link: item.link || "",
      content: sanitize(cleanFeedContent(decodeEntities(fullContent), itemTitle)),
      summary: sanitize(cleanFeedContent(decodeEntities(summary), itemTitle)),
      author: decodeEntities(author),
      publishedAt: parseDate(item.pubDate),
      guid: item.guid?.value || item.link || "",
    };
  });

  return ok({ feed: parsedFeed, articles });
}

function mapAtomFeed(
  feed: FeedsmithResult["feed"],
  feedUrl: string,
): Result<Omit<ParseResult, "format">> {
  const atomFeed = feed as Extract<FeedsmithResult, { format: "atom" }>["feed"];

  const parsedFeed: ParsedFeed = {
    title: decodeEntities(atomFeed.title || "") || feedUrl,
    description: decodeEntities(atomFeed.subtitle || ""),
    siteUrl: findLink(atomFeed.links, "alternate") || "",
    url: feedUrl,
  };

  const articles: ParsedArticle[] = (atomFeed.entries || []).map((entry) => {
    const entryTitle = decodeEntities(entry.title || "") || "Untitled";
    return {
      title: entryTitle,
      link: findLink(entry.links, "alternate") || findLink(entry.links) || "",
      content: sanitize(cleanFeedContent(decodeEntities(entry.content || entry.summary || ""), entryTitle)),
      summary: sanitize(cleanFeedContent(decodeEntities(entry.summary || ""), entryTitle)),
      author: decodeEntities(entry.authors?.[0]?.name || ""),
      publishedAt: parseDate(entry.published || entry.updated),
      guid: entry.id || findLink(entry.links) || "",
    };
  });

  return ok({ feed: parsedFeed, articles });
}

function mapJsonFeed(
  feed: FeedsmithResult["feed"],
  feedUrl: string,
): Result<Omit<ParseResult, "format">> {
  // feedsmith preserves JSON Feed's snake_case field names
  const jsonFeed = feed as Record<string, unknown>;

  const parsedFeed: ParsedFeed = {
    title: (jsonFeed.title as string) || feedUrl,
    description: (jsonFeed.description as string) || "",
    siteUrl: (jsonFeed.home_page_url as string) || "",
    url: feedUrl,
  };

  const items = (jsonFeed.items as Array<Record<string, unknown>>) || [];
  const articles: ParsedArticle[] = items.map((item) => {
    const authors = item.authors as Array<{ name?: string }> | undefined;
    const itemTitle = (item.title as string) || "Untitled";
    return {
      title: itemTitle,
      link: (item.url as string) || (item.external_url as string) || "",
      content: sanitize(
        cleanFeedContent(
          (item.content_html as string) || (item.content_text as string) || "",
          itemTitle,
        ),
      ),
      summary: sanitize(cleanFeedContent((item.summary as string) || "", itemTitle)),
      author: authors?.[0]?.name || "",
      publishedAt: parseDate(item.date_published as string),
      guid: (item.id as string) || (item.url as string) || "",
    };
  });

  return ok({ feed: parsedFeed, articles });
}

function findLink(
  links: Array<{ href?: string; rel?: string }> | undefined,
  rel?: string,
): string {
  if (!links) return "";
  for (const link of links) {
    if (!rel || link.rel === rel) {
      return link.href || "";
    }
  }
  return "";
}

/**
 * Decode HTML entities that survive XML parsing (double-encoded feeds).
 * Handles both numeric (&#39;) and named (&amp;) entities.
 */
function decodeEntities(str: string): string {
  if (!str || !str.includes("&")) return str;
  // Use a textarea element to decode HTML entities
  const el = document.createElement("textarea");
  el.innerHTML = str;
  return el.textContent || "";
}

/**
 * Strip the literal string "None" when it's the only text content.
 * Python-based feed generators (e.g., Django, zeit.web) serialize
 * Python's `None` as the string "None" when a field is null.
 */
function stripNoneArtifact(str: string): string {
  // Extract text content by stripping HTML tags
  const textOnly = str.replace(/<[^>]*>/g, "").trim();
  if (textOnly === "None") return "";
  return str;
}

function parseDate(str: string | null | undefined): number | null {
  if (!str) return null;
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d.getTime();
}
