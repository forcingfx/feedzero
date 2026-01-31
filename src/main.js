import { createEventBus } from "./core/events/event-bus.js";
import {
  open,
  getFeeds,
  getFeed,
  getArticles,
  updateArticle,
} from "./core/storage/db.js";
import {
  addFeedFlow,
  refreshFeed,
  refreshAllFeeds,
} from "./core/feeds/feed-service.js";
import { createKeyboardNav } from "./ui/components/keyboard-nav.js";
import { EVENTS } from "./utils/constants.js";

// Import Web Components (self-registering)
import "./ui/components/feed-list.js";
import "./ui/components/article-list.js";
import "./ui/components/article-view.js";

const bus = createEventBus();
const keyboard = createKeyboardNav();
let refreshingAll = false;
let refreshingFeed = false;

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
    const result = await addFeedFlow(url);
    if (!result.ok) {
      feedList?.showError(result.error);
      return;
    }

    // Refresh feed list and auto-select the new feed
    const allFeeds = await getFeeds();
    if (allFeeds.ok && feedList) {
      feedList.setFeeds(allFeeds.value);
      feedList.selectFeed(result.value.feed.id);
    }
  });

  // Handle feed selection
  bus.on(EVENTS.FEED_SELECTED, async ({ feedId }) => {
    const result = await getArticles(feedId);
    if (result.ok && articleList) {
      articleList.setArticles(result.value, feedId);
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

  // Handle refresh all feeds (debounced)
  bus.on(EVENTS.REFRESH_ALL, async () => {
    if (refreshingAll) return;
    refreshingAll = true;
    try {
      await refreshAllFeeds();
      const allFeeds = await getFeeds();
      if (allFeeds.ok && feedList) {
        feedList.setFeeds(allFeeds.value);
      }
      bus.emit(EVENTS.FEEDS_REFRESHED);
    } finally {
      refreshingAll = false;
    }
  });

  // Handle refresh single feed (debounced)
  bus.on(EVENTS.REFRESH_FEED, async ({ feedId }) => {
    if (refreshingFeed) return;
    refreshingFeed = true;
    try {
      const feedResult = await getFeed(feedId);
      if (!feedResult.ok) return;
      await refreshFeed(feedResult.value);
      const articles = await getArticles(feedId);
      if (articles.ok && articleList) {
        articleList.setArticles(articles.value, feedId);
      }
    } finally {
      refreshingFeed = false;
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

  // Auto-refresh all feeds on load (non-blocking)
  refreshAllFeeds().then(async () => {
    const allFeeds = await getFeeds();
    if (allFeeds.ok && feedList) {
      feedList.setFeeds(allFeeds.value);
    }
  });
}

init();

export { bus, init };
