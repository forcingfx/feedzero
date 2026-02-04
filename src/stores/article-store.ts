import { create } from "zustand";
import { getArticles, updateArticle } from "../core/storage/db.ts";
import { useSyncStore } from "./sync-store.ts";
import type { Article } from "../types/index.ts";

interface ArticleStore {
  articles: Article[];
  selectedArticle: Article | null;
  isLoading: boolean;
  loadArticles: (feedId: string) => Promise<void>;
  selectArticle: (article: Article | null) => Promise<void>;
  markAsRead: (articleId: string) => Promise<void>;
}

export const useArticleStore = create<ArticleStore>((set, get) => ({
  articles: [],
  selectedArticle: null,
  isLoading: false,

  loadArticles: async (feedId) => {
    set({ isLoading: true });
    const result = await getArticles(feedId);
    set({
      articles: result.ok ? result.value : [],
      isLoading: false,
    });
  },

  selectArticle: async (article) => {
    if (!article) {
      set({ selectedArticle: null });
      return;
    }

    if (!article.read) {
      const updated = { ...article, read: true };
      set({ selectedArticle: updated });
      await updateArticle(updated);
      set({
        articles: get().articles.map((a) =>
          a.id === article.id ? { ...a, read: true } : a,
        ),
      });
      useSyncStore.getState().scheduleSyncPush();
    } else {
      set({ selectedArticle: article });
    }
  },

  markAsRead: async (articleId) => {
    const article = get().articles.find((a) => a.id === articleId);
    if (!article || article.read) return;

    const updated = { ...article, read: true };
    await updateArticle(updated);
    set({
      articles: get().articles.map((a) =>
        a.id === articleId ? { ...a, read: true } : a,
      ),
    });
  },
}));
