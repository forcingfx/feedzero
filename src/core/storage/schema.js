import { ok, err } from '../../utils/result.js';
import { SCHEMA_VERSION } from '../../utils/constants.js';

export { SCHEMA_VERSION };

/**
 * Create a new feed object with defaults.
 */
export function createFeed({ url, title, description = '', siteUrl = '' }) {
  if (!url || !title) return err('Feed requires url and title');
  return ok({
    id: crypto.randomUUID(),
    url,
    title,
    description,
    siteUrl,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
}

/**
 * Create a new article object with defaults.
 */
export function createArticle({ feedId, title, link, content = '', summary = '', author = '', publishedAt = null }) {
  if (!feedId || !title || !link) return err('Article requires feedId, title, and link');
  return ok({
    id: crypto.randomUUID(),
    feedId,
    title,
    link,
    content,
    summary,
    author,
    publishedAt: publishedAt ?? Date.now(),
    read: false,
    createdAt: Date.now(),
  });
}

/**
 * Validate a feed object has required fields.
 */
export function validateFeed(feed) {
  if (!feed || typeof feed !== 'object') return err('Feed must be an object');
  if (!feed.id || !feed.url || !feed.title) return err('Feed missing required fields');
  return ok(feed);
}

/**
 * Validate an article object has required fields.
 */
export function validateArticle(article) {
  if (!article || typeof article !== 'object') return err('Article must be an object');
  if (!article.id || !article.feedId || !article.title || !article.link) {
    return err('Article missing required fields');
  }
  return ok(article);
}
