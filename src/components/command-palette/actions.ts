import {
  Plus,
  RefreshCw,
  CheckCheck,
  PanelLeft,
  Rss,
  Compass,
  Sparkles,
  BarChart3,
  Settings as SettingsIcon,
  CreditCard,
  Cloud,
  Keyboard,
  Sun,
  Moon,
  Monitor,
  type LucideIcon,
} from "lucide-react";
import type { NavigateFunction } from "react-router";
import { useFeedStore } from "@/stores/feed-store.ts";
import { useArticleStore } from "@/stores/article-store.ts";
import { goToSettings } from "@/lib/go-to-settings.ts";

/**
 * A single command palette entry.
 *
 * `run` is fire-and-forget — the palette closes immediately after
 * invocation, side-effects flow through stores/router. Errors are the
 * action's responsibility (toast via existing patterns).
 *
 * `keywords` feeds cmdk's fuzzy matcher: users typing "dark" should
 * find "Switch to dark theme" without seeing "theme" in the label.
 */
export interface CommandAction {
  id: string;
  label: string;
  hint?: string;
  shortcut?: string;
  icon?: LucideIcon;
  keywords?: string[];
  /** Logical grouping label rendered as the CommandGroup heading. */
  group: "Navigate" | "Feeds" | "Read" | "Appearance" | "Account";
  run: () => void | Promise<void>;
}

/**
 * Minimal next-themes surface. We accept it as a parameter rather than
 * importing useTheme directly so the module stays pure and testable
 * without a ThemeProvider in the test wrapper.
 */
export interface ThemeApi {
  setTheme: (value: "light" | "dark" | "system") => void;
}

interface ActionContext {
  navigate: NavigateFunction;
  theme: ThemeApi;
}

/**
 * Build the full action list. Pure factory — call from a useMemo with
 * `navigate` + `theme` as deps. The list order is the display order
 * within each group (cmdk preserves source order for equal-score
 * matches).
 */
export function buildCommandActions(ctx: ActionContext): CommandAction[] {
  const { navigate, theme } = ctx;

  return [
    // -------- Navigate --------
    {
      id: "go-feeds",
      label: "Go to Feeds",
      group: "Navigate",
      icon: Rss,
      shortcut: "G F",
      keywords: ["home", "reader"],
      run: () => navigate("/feeds"),
    },
    {
      id: "go-explore",
      label: "Go to Explore",
      group: "Navigate",
      icon: Compass,
      shortcut: "N",
      keywords: ["catalog", "discover", "browse"],
      run: () => navigate("/explore"),
    },
    {
      id: "go-signal",
      label: "Go to Signal",
      group: "Navigate",
      icon: Sparkles,
      keywords: ["topics", "trends", "frequency"],
      run: () => navigate("/signal"),
    },
    {
      id: "go-stats",
      label: "Go to Stats",
      group: "Navigate",
      icon: BarChart3,
      keywords: ["activity", "history", "graph"],
      run: () => navigate("/stats"),
    },

    // -------- Feeds --------
    {
      id: "add-feed",
      label: "Add a feed",
      group: "Feeds",
      icon: Plus,
      shortcut: "N",
      keywords: ["subscribe", "new", "+"],
      run: () => navigate("/explore?focus=search"),
    },
    {
      id: "refresh-all",
      label: "Refresh all feeds",
      group: "Feeds",
      icon: RefreshCw,
      shortcut: "R",
      keywords: ["reload", "fetch", "sync"],
      run: () => {
        void useFeedStore.getState().refreshAll();
      },
    },

    // -------- Read --------
    {
      id: "mark-all-read",
      label: "Mark all as read",
      group: "Read",
      icon: CheckCheck,
      keywords: ["clear", "inbox zero"],
      run: () => {
        void useArticleStore.getState().markAllAsRead();
      },
    },
    {
      id: "toggle-sidebar",
      label: "Toggle sidebar",
      group: "Read",
      icon: PanelLeft,
      shortcut: "[",
      keywords: ["hide", "show", "panels"],
      run: () => {
        document.dispatchEvent(new CustomEvent("feedzero:toggle-sidebar"));
      },
    },

    // -------- Appearance --------
    {
      id: "theme-light",
      label: "Switch to light theme",
      group: "Appearance",
      icon: Sun,
      keywords: ["bright", "day"],
      run: () => theme.setTheme("light"),
    },
    {
      id: "theme-dark",
      label: "Switch to dark theme",
      group: "Appearance",
      icon: Moon,
      keywords: ["night", "dim"],
      run: () => theme.setTheme("dark"),
    },
    {
      id: "theme-system",
      label: "Match system theme",
      group: "Appearance",
      icon: Monitor,
      keywords: ["auto", "os"],
      run: () => theme.setTheme("system"),
    },

    // -------- Account --------
    {
      id: "open-settings",
      label: "Open settings",
      group: "Account",
      icon: SettingsIcon,
      shortcut: "⌘,",
      keywords: ["preferences", "config"],
      run: () => goToSettings(navigate),
    },
    {
      id: "open-subscription",
      label: "Open subscription",
      group: "Account",
      icon: CreditCard,
      keywords: ["upgrade", "billing", "plan", "stripe"],
      run: () => goToSettings(navigate, "subscription"),
    },
    {
      id: "open-sync",
      label: "Open sync and data",
      group: "Account",
      icon: Cloud,
      keywords: ["import", "export", "backup", "vault"],
      run: () => goToSettings(navigate, "sync-and-data"),
    },
    {
      id: "open-shortcuts",
      label: "Show keyboard shortcuts",
      group: "Account",
      icon: Keyboard,
      shortcut: "?",
      keywords: ["help", "hotkeys", "kbd"],
      run: () => goToSettings(navigate, "help"),
    },
  ];
}
