/**
 * <ArticleRetentionSetting> — Settings → Reading → Keep articles.
 *
 * Shortening the period deletes articles at once, on every device the
 * vault syncs to, and cannot be undone, so it asks first with a count
 * (owner's call). Lengthening, or a shortening that removes nothing,
 * applies straight away: there is nothing to warn about.
 *
 * Real stores, real encrypted db (fake-indexeddb); assertions read the
 * rendered UI, the preferences store, and the db.
 */
import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ArticleRetentionSetting } from "@/components/settings/article-retention-setting";
import { usePreferencesStore } from "@/stores/preferences-store";
import { useSyncStore } from "@/stores/sync-store";
import {
  open,
  close,
  addFeed,
  addArticles,
  getAllArticles,
  putPreferences,
} from "@/core/storage/db";
import { createArticle, createFeed } from "@/core/storage/schema";
import { unwrap } from "@feedzero/core/utils/result";
import { DEFAULT_PREFERENCES } from "@feedzero/core/types";
import type { Article, ArticleRetention } from "@feedzero/core/types";

const DAY = 24 * 60 * 60 * 1000;

async function seedVault(retention: ArticleRetention, ages: Array<[number, boolean?]>) {
  const prefs = { ...DEFAULT_PREFERENCES, articleRetention: retention };
  await putPreferences(prefs);
  usePreferencesStore.setState({ preferences: prefs, hydrated: true });
  const feed = unwrap(createFeed({ url: "https://f.example/rss", title: "F" }));
  await addFeed(feed);
  const articles: Article[] = ages.map(([days, starred]) => ({
    ...unwrap(
      createArticle({
        feedId: feed.id,
        title: `${days}d`,
        link: `https://f.example/${days}-${Math.random()}`,
        publishedAt: Date.now() - days * DAY,
      }),
    ),
    ...(starred && { starred: true }),
  }));
  await addArticles(articles);
}

async function storedTitles(): Promise<string[]> {
  return unwrap(await getAllArticles()).map((a) => a.title).sort();
}

function retentionSelect() {
  return screen.getByRole("combobox", { name: /keep articles/i });
}

describe("<ArticleRetentionSetting>", () => {
  beforeEach(async () => {
    unwrap(await open("retention setting test"));
    vi.spyOn(useSyncStore.getState(), "scheduleSyncPush").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    close();
    indexedDB.deleteDatabase("feedzero");
  });

  it("shows the current period, 30 days by default, with every option", async () => {
    await seedVault(30, []);
    render(<ArticleRetentionSetting />);

    expect(retentionSelect()).toHaveDisplayValue("30 days");
    const labels = Array.from(
      (retentionSelect() as HTMLSelectElement).options,
    ).map((o) => o.textContent);
    expect(labels).toEqual(["7 days", "14 days", "30 days", "90 days", "1 year", "Forever"]);
  });

  it("lengthening the period applies at once, without asking", async () => {
    const user = userEvent.setup();
    await seedVault(30, [[20]]);
    render(<ArticleRetentionSetting />);

    await user.selectOptions(retentionSelect(), "90 days");

    expect(screen.queryByRole("alertdialog")).toBeNull();
    await waitFor(() =>
      expect(usePreferencesStore.getState().preferences.articleRetention).toBe(90),
    );
  });

  it("shortening the period asks first, saying how many articles it removes", async () => {
    const user = userEvent.setup();
    await seedVault(90, [[10], [20], [60], [80, true]]);
    render(<ArticleRetentionSetting />);

    await user.selectOptions(retentionSelect(), "7 days");

    const dialog = await screen.findByRole("alertdialog");
    // 10, 20 and 60 days are past 7 days; the starred 80-day one is kept.
    expect(dialog).toHaveTextContent(/remove 3 articles/i);
  });

  it("cancelling keeps the period and every article", async () => {
    const user = userEvent.setup();
    await seedVault(90, [[10], [60]]);
    render(<ArticleRetentionSetting />);
    await user.selectOptions(retentionSelect(), "7 days");

    await user.click(await screen.findByRole("button", { name: /cancel/i }));

    expect(usePreferencesStore.getState().preferences.articleRetention).toBe(90);
    expect(retentionSelect()).toHaveDisplayValue("90 days");
    expect(await storedTitles()).toEqual(["10d", "60d"]);
  });

  it("confirming applies the period and deletes what it expired, keeping starred", async () => {
    const user = userEvent.setup();
    await seedVault(90, [[3], [60], [80, true]]);
    render(<ArticleRetentionSetting />);
    await user.selectOptions(retentionSelect(), "30 days");

    await user.click(await screen.findByRole("button", { name: /remove 1 article/i }));

    await waitFor(async () => expect(await storedTitles()).toEqual(["3d", "80d"]));
    expect(usePreferencesStore.getState().preferences.articleRetention).toBe(30);
  });

  it("shortening that removes nothing applies at once, without asking", async () => {
    const user = userEvent.setup();
    await seedVault(90, [[3]]);
    render(<ArticleRetentionSetting />);

    await user.selectOptions(retentionSelect(), "7 days");

    await waitFor(() =>
      expect(usePreferencesStore.getState().preferences.articleRetention).toBe(7),
    );
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
});
