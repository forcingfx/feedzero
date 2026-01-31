import { ok, err } from '../../utils/result.js';
import { validate } from './validator.js';
import { sanitize } from './sanitizer.js';

/**
 * Parse an RSS 2.0 or Atom 1.0 feed XML string.
 * @param {string} xml - Raw XML content
 * @param {string} feedUrl - The URL this feed was fetched from
 * @returns {Result<{feed: object, articles: object[]}>}
 */
export function parse(xml, feedUrl) {
  const typeResult = validate(xml);
  if (!typeResult.ok) return typeResult;

  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  const type = typeResult.value;

  try {
    if (type === 'rss') return parseRss(doc, feedUrl);
    if (type === 'atom') return parseAtom(doc, feedUrl);
    return err(`Unknown feed type: ${type}`);
  } catch (e) {
    return err(`Parse error: ${e.message}`);
  }
}

function parseRss(doc, feedUrl) {
  const channel = doc.querySelector('channel');
  if (!channel) return err('RSS feed missing <channel>');

  const feed = {
    title: text(channel, 'title') || feedUrl,
    description: text(channel, 'description') || '',
    siteUrl: text(channel, 'link') || '',
    url: feedUrl,
  };

  const articles = [...channel.querySelectorAll('item')].map((item) => ({
    title: text(item, 'title') || 'Untitled',
    link: text(item, 'link') || '',
    content: sanitize(text(item, 'content\\:encoded') || text(item, 'description') || ''),
    summary: sanitize(text(item, 'description') || ''),
    author: text(item, 'author') || text(item, 'dc\\:creator') || '',
    publishedAt: parseDate(text(item, 'pubDate')),
    guid: text(item, 'guid') || text(item, 'link') || '',
  }));

  return ok({ feed, articles });
}

function parseAtom(doc, feedUrl) {
  const root = doc.documentElement;

  const feed = {
    title: text(root, 'title') || feedUrl,
    description: text(root, 'subtitle') || '',
    siteUrl: linkHref(root, 'alternate') || '',
    url: feedUrl,
  };

  const articles = [...root.querySelectorAll('entry')].map((entry) => ({
    title: text(entry, 'title') || 'Untitled',
    link: linkHref(entry, 'alternate') || linkHref(entry) || '',
    content: sanitize(text(entry, 'content') || text(entry, 'summary') || ''),
    summary: sanitize(text(entry, 'summary') || ''),
    author: text(entry.querySelector('author'), 'name') || '',
    publishedAt: parseDate(text(entry, 'published') || text(entry, 'updated')),
    guid: text(entry, 'id') || linkHref(entry) || '',
  }));

  return ok({ feed, articles });
}

function text(parent, selector) {
  if (!parent) return '';
  const el = parent.querySelector(selector);
  return el ? el.textContent.trim() : '';
}

function linkHref(parent, rel) {
  if (!parent) return '';
  const links = parent.querySelectorAll('link');
  for (const link of links) {
    if (!rel || link.getAttribute('rel') === rel) {
      return link.getAttribute('href') || '';
    }
  }
  return '';
}

function parseDate(str) {
  if (!str) return null;
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d.getTime();
}
