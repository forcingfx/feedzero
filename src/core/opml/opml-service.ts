import { parseOpml, generateOpml } from "feedsmith";
import { ok, err } from "../../utils/result.ts";
import type { Result } from "../../utils/result.ts";
import type { Feed, Folder } from "../../types/index.ts";

/** Represents a feed entry extracted from OPML. */
export interface OpmlFeedEntry {
  title: string;
  xmlUrl: string;
  htmlUrl?: string;
  /**
   * Name of the immediate parent <outline> group, if any. PR E preserves
   * the folder organization the user had in their previous reader.
   * Deeply nested folders flatten to their closest named parent — most
   * readers (Feedly, NetNewsWire, Inoreader) export one level deep, so
   * this matches real-world OPML.
   */
  folderName?: string;
}

/**
 * Parse an OPML file and extract feed entries.
 * Preserves immediate-parent folder names (see OpmlFeedEntry.folderName).
 */
export function parseOpmlFile(xml: string): Result<OpmlFeedEntry[]> {
  if (!xml || typeof xml !== "string" || !xml.trim()) {
    return err("OPML content is empty");
  }

  try {
    const doc = parseOpml(xml);
    const feeds = extractFeeds(doc.body?.outlines || [], undefined);
    return ok(feeds);
  } catch (e) {
    return err(`Failed to parse OPML: ${(e as Error).message}`);
  }
}

interface OpmlOutline {
  text?: string;
  title?: string;
  xmlUrl?: string;
  htmlUrl?: string;
  outlines?: unknown[];
}

/**
 * Recursively extract feed entries from OPML outlines, threading the
 * current folder context through the walk. An outline WITHOUT xmlUrl
 * (i.e. a folder) becomes the new folderName for its children.
 */
function extractFeeds(
  outlines: OpmlOutline[],
  folderName: string | undefined,
): OpmlFeedEntry[] {
  const feeds: OpmlFeedEntry[] = [];

  for (const outline of outlines) {
    if (outline.xmlUrl) {
      feeds.push({
        title: outline.title || outline.text || "",
        xmlUrl: outline.xmlUrl,
        htmlUrl: outline.htmlUrl,
        folderName,
      });
    }

    if (outline.outlines && Array.isArray(outline.outlines)) {
      // A parent outline without xmlUrl is a folder; its text/title
      // becomes the folder name for its children. If we're already inside
      // a folder, keep the outer one (most readers don't nest more than
      // one level — flatten to closest named parent).
      const childFolderName =
        !outline.xmlUrl
          ? folderName ?? outline.title ?? outline.text ?? undefined
          : folderName;
      feeds.push(
        ...extractFeeds(outline.outlines as OpmlOutline[], childFolderName),
      );
    }
  }

  return feeds;
}

/**
 * Generate an OPML file from an array of Feed objects.
 * Returns a valid OPML document even for empty feeds array.
 *
 * When `folders` is provided, feeds with a matching `folderId` are
 * grouped inside parent `<outline>` wrappers — preserves the user's
 * organization for round-trip imports (PR E). Unfiled feeds (no
 * folderId) remain at the top level.
 */
export function generateOpmlFile(feeds: Feed[], folders?: Folder[]): string {
  // feedsmith requires at least one outline, so handle empty case manually
  if (feeds.length === 0) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>FeedZero Subscriptions</title>
  </head>
  <body>
  </body>
</opml>`;
  }

  const feedToOutline = (feed: Feed) => ({
    type: "rss",
    text: feed.title,
    title: feed.title,
    xmlUrl: feed.url,
    htmlUrl: feed.siteUrl || undefined,
  });

  if (!folders || folders.length === 0) {
    // No folders → backwards-compatible flat output.
    return generateOpml({
      head: { title: "FeedZero Subscriptions" },
      body: { outlines: feeds.map(feedToOutline) },
    });
  }

  // Group feeds by folderId; unfiled feeds stay at top level.
  const byFolder = new Map<string, Feed[]>();
  const unfiled: Feed[] = [];
  for (const feed of feeds) {
    if (feed.folderId) {
      const list = byFolder.get(feed.folderId) ?? [];
      list.push(feed);
      byFolder.set(feed.folderId, list);
    } else {
      unfiled.push(feed);
    }
  }

  const folderOutlines = folders
    .filter((f) => byFolder.has(f.id))
    .map((folder) => ({
      text: folder.name,
      title: folder.name,
      outlines: (byFolder.get(folder.id) ?? []).map(feedToOutline),
    }));

  return generateOpml({
    head: { title: "FeedZero Subscriptions" },
    body: {
      outlines: [...unfiled.map(feedToOutline), ...folderOutlines],
    },
  });
}

/**
 * Generate a plain text list of feed URLs, one per line.
 */
export function generateUrlList(feeds: Feed[]): string {
  return feeds.map((feed) => feed.url).join("\n");
}
