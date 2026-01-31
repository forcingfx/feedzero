import { createEventBus } from "./core/events/event-bus.js";
import {
  open,
  addFeed,
  getFeeds,
  addArticles,
  getArticles,
  updateArticle,
} from "./core/storage/db.js";
import { parse } from "./core/parser/parser.js";
import { createFeed, createArticle } from "./core/storage/schema.js";
import { createKeyboardNav } from "./ui/components/keyboard-nav.js";
import { EVENTS } from "./utils/constants.js";

// Import Web Components (self-registering)
import "./ui/components/feed-list.js";
import "./ui/components/article-list.js";
import "./ui/components/article-view.js";

const bus = createEventBus();
const keyboard = createKeyboardNav();

async function init() {
  // Initialize storage with a default passphrase
  // In production, this would come from user input
  const dbResult = await open("feedzero-default-key");
  if (!dbResult.ok) {
    console.error("Failed to open database:", dbResult.error);
    return;
  }

  // Wire up components
  const feedList = document.querySelector("feed-list");
  const articleList = document.querySelector("article-list");
  const articleView = document.querySelector("article-view");

  if (feedList) feedList.eventBus = bus;
  if (articleList) articleList.eventBus = bus;

  // Load existing feeds
  const feedsResult = await getFeeds();
  if (feedsResult.ok && feedList) {
    feedList.setFeeds(feedsResult.value);
  }

  // Handle add feed
  bus.on(EVENTS.FEED_ADDED, async ({ url }) => {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        feedList?.showError(`Failed to fetch feed: ${response.status}`);
        return;
      }
      const xml = await response.text();
      const parseResult = parse(xml, url);
      if (!parseResult.ok) {
        feedList?.showError(parseResult.error);
        return;
      }

      const { feed: feedData, articles: parsedArticles } = parseResult.value;
      const feedResult = createFeed({
        url,
        title: feedData.title,
        description: feedData.description,
        siteUrl: feedData.siteUrl,
      });
      if (!feedResult.ok) {
        feedList?.showError(feedResult.error);
        return;
      }
      const feed = feedResult.value;
      await addFeed(feed);

      const articles = parsedArticles
        .map((a) => {
          const r = createArticle({ feedId: feed.id, ...a });
          return r.ok ? r.value : null;
        })
        .filter(Boolean);
      await addArticles(articles);

      // Refresh feed list
      const allFeeds = await getFeeds();
      if (allFeeds.ok && feedList) {
        feedList.setFeeds(allFeeds.value);
      }
    } catch (e) {
      feedList?.showError(`Error: ${e.message}`);
    }
  });

  // Handle feed selection
  bus.on(EVENTS.FEED_SELECTED, async ({ feedId }) => {
    const result = await getArticles(feedId);
    if (result.ok && articleList) {
      articleList.setArticles(result.value);
    }
    articleView?.setArticle(null);
  });

  // Handle article selection
  bus.on(EVENTS.ARTICLE_SELECTED, async ({ article }) => {
    articleView?.setArticle(article);

    if (!article.read) {
      article.read = true;
      await updateArticle(article);
      bus.emit(EVENTS.ARTICLE_READ, { articleId: article.id });
    }
  });

  // Keyboard navigation
  keyboard.attach();

  // Register service worker
  if ("serviceWorker" in navigator) {
    try {
      await navigator.serviceWorker.register("./workers/service-worker.js");
    } catch {
      // SW registration is non-critical
    }
  }

  bus.emit(EVENTS.STORAGE_READY);
}

init();

export { bus, init };
