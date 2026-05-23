import { useMemo } from "react";
import { useNavigate } from "react-router";
import { useTheme } from "next-themes";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command.tsx";
import { useCommandPaletteStore } from "@/stores/command-palette-store.ts";
import { useFeedStore } from "@/stores/feed-store.ts";
import { useArticleStore } from "@/stores/article-store.ts";
import {
  buildCommandActions,
  type CommandAction,
} from "@/components/command-palette/actions.ts";

/**
 * Global command palette (⌘K / Ctrl+K).
 *
 * Three sections, in order:
 *   1. Actions     — buildCommandActions() with the route/theme context
 *   2. Feeds       — fuzzy match by feed.title; Enter opens the feed
 *   3. Articles    — fuzzy match by article.title against the currently
 *                    loaded list (NOT a global full-text search yet;
 *                    that's its own follow-up)
 *
 * cmdk handles fuzzy scoring + keyboard nav (↑/↓/Enter/Escape) and
 * ARIA combobox semantics. We just declare the items.
 */
export function CommandPalette() {
  const isOpen = useCommandPaletteStore((s) => s.isOpen);
  const close = useCommandPaletteStore((s) => s.close);
  const navigate = useNavigate();
  const theme = useTheme();
  const feeds = useFeedStore((s) => s.feeds);
  const articles = useArticleStore((s) => s.articles);

  const actions = useMemo<CommandAction[]>(
    () =>
      buildCommandActions({
        navigate,
        theme: { setTheme: theme.setTheme },
      }),
    [navigate, theme.setTheme],
  );

  const groupedActions = useMemo(() => {
    const groups = new Map<CommandAction["group"], CommandAction[]>();
    for (const action of actions) {
      const bucket = groups.get(action.group) ?? [];
      bucket.push(action);
      groups.set(action.group, bucket);
    }
    return Array.from(groups.entries());
  }, [actions]);

  const runAction = (action: CommandAction) => {
    close();
    void action.run();
  };

  const openFeed = (feedId: string) => {
    close();
    navigate(`/feeds/${feedId}`);
  };

  const openArticle = (feedId: string, articleId: string) => {
    close();
    navigate(`/feeds/${feedId}/articles/${articleId}`);
  };

  return (
    <CommandDialog open={isOpen} onOpenChange={(open) => !open && close()}>
      <CommandInput placeholder="Search actions, feeds, articles…" />
      <CommandList>
        <CommandEmpty>No matches.</CommandEmpty>

        {groupedActions.map(([groupName, items], idx) => (
          <div key={groupName}>
            {idx > 0 && <CommandSeparator />}
            <CommandGroup heading={groupName}>
              {items.map((action) => (
                <CommandItem
                  key={action.id}
                  value={`${action.label} ${action.keywords?.join(" ") ?? ""}`}
                  onSelect={() => runAction(action)}
                >
                  {action.icon && <action.icon />}
                  <span>{action.label}</span>
                  {action.shortcut && (
                    <CommandShortcut>{action.shortcut}</CommandShortcut>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </div>
        ))}

        {feeds.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Feeds">
              {feeds.map((feed) => (
                <CommandItem
                  key={feed.id}
                  value={`feed ${feed.title} ${feed.url}`}
                  onSelect={() => openFeed(feed.id)}
                >
                  <span className="truncate">{feed.title}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {articles.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Articles">
              {articles.slice(0, 50).map((article) => (
                <CommandItem
                  key={article.id}
                  value={`article ${article.title}`}
                  onSelect={() => openArticle(article.feedId, article.id)}
                >
                  <span className="truncate">{article.title}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
