import { ok, err } from "../../utils/result.js";
import { validate } from "./validator.js";
import { sanitize } from "./sanitizer.js";

/**
 * Parse an RSS 2.0 or Atom 1.0 feed XML string.
 * @param {string} xml - Raw XML content
 * @param {string} feedUrl - The URL this feed was fetched from
 * @returns {Result<{feed: object, articles: object[]}>}
 */
export function parse(xml, feedUrl) {
  const typeResult = validate(xml);
  if (!typeResult.ok) return typeResult;

  const type = typeResult.value;

  if (type === "jsonfeed") {
    try {
      return parseJsonFeed(xml, feedUrl);
    } catch (e) {
      return err(`Parse error: ${e.message}`);
    }
  }

  const doc = new DOMParser().parseFromString(xml, "text/xml");

  try {
    if (type === "rss") return parseRss(doc, feedUrl);
    if (type === "atom") return parseAtom(doc, feedUrl);
    return err(`Unknown feed type: ${type}`);
  } catch (e) {
    return err(`Parse error: ${e.message}`);
  }
}

function parseRss(doc, feedUrl) {
  const channel = doc.querySelector("channel");
  if (!channel) return err("RSS feed missing <channel>");

  const feed = {
    title: text(channel, "title") || feedUrl,
    description: text(channel, "description") || "",
    siteUrl: text(channel, "link") || "",
    url: feedUrl,
  };

  const articles = [...channel.querySelectorAll("item")].map((item) => ({
    title: text(item, "title") || "Untitled",
    link: text(item, "link") || "",
    content: sanitize(
      text(item, "content:encoded") || text(item, "description") || "",
    ),
    summary: sanitize(text(item, "description") || ""),
    author: text(item, "author") || text(item, "dc:creator") || "",
    publishedAt: parseDate(text(item, "pubDate")),
    guid: text(item, "guid") || text(item, "link") || "",
  }));

  return ok({ feed, articles });
}

function parseAtom(doc, feedUrl) {
  const root = doc.documentElement;

  const feed = {
    title: text(root, "title") || feedUrl,
    description: text(root, "subtitle") || "",
    siteUrl: linkHref(root, "alternate") || "",
    url: feedUrl,
  };

  const articles = [...root.querySelectorAll("entry")].map((entry) => ({
    title: text(entry, "title") || "Untitled",
    link: linkHref(entry, "alternate") || linkHref(entry) || "",
    content: sanitize(text(entry, "content") || text(entry, "summary") || ""),
    summary: sanitize(text(entry, "summary") || ""),
    author: text(entry.querySelector("author"), "name") || "",
    publishedAt: parseDate(text(entry, "published") || text(entry, "updated")),
    guid: text(entry, "id") || linkHref(entry) || "",
  }));

  return ok({ feed, articles });
}

/** Decode HTML entities that survive XML parsing (double-encoded feeds). */
function decodeEntities(str) {
  if (!str || !str.includes("&")) return str;
  const el = document.createElement("textarea");
  el.innerHTML = str;
  return el.textContent;
}

function text(parent, tag) {
  if (!parent) return "";
  // Use getElementsByTagName for reliable namespaced element lookup
  // (querySelector fails with namespace-prefixed tags like content:encoded)
  const els = parent.getElementsByTagName(tag);
  if (els.length === 0) return "";
  return decodeEntities(els[0].textContent.trim());
}

function linkHref(parent, rel) {
  if (!parent) return "";
  const links = parent.querySelectorAll("link");
  for (const link of links) {
    if (!rel || link.getAttribute("rel") === rel) {
      return link.getAttribute("href") || "";
    }
  }
  return "";
}

function parseJsonFeed(jsonStr, feedUrl) {
  const data = JSON.parse(jsonStr);

  const feed = {
    title: data.title || feedUrl,
    description: data.description || "",
    siteUrl: data.home_page_url || "",
    url: feedUrl,
  };

  const articles = (data.items || []).map((item) => {
    const author = item.authors?.[0]?.name || item.author?.name || "";
    return {
      title: item.title || "Untitled",
      link: item.url || item.external_url || "",
      content: sanitize(item.content_html || item.content_text || ""),
      summary: sanitize(item.summary || ""),
      author,
      publishedAt: parseDate(item.date_published),
      guid: item.id || item.url || "",
    };
  });

  return ok({ feed, articles });
}

function parseDate(str) {
  if (!str) return null;
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d.getTime();
}
