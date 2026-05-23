/**
 * Read-only audit view of every rule across every subscribed feed.
 *
 * Answers the "what's hiding articles from me right now?" question.
 * Clicking a row opens the rules editor for that feed (write-side
 * happens in the editor dialog; this view never mutates).
 */

import { Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFeedStore } from "@/stores/feed-store";
import { useFeatureGate } from "@/hooks/use-feature-gate";
import type { Feed, Rule, RuleAction } from "@feedzero/core/types";

interface FeedWithRules {
  feed: Feed;
  rules: Rule[];
}

function flattenFeedRules(feeds: Feed[]): FeedWithRules[] {
  const out: FeedWithRules[] = [];
  for (const f of feeds) {
    if (f.rules && f.rules.length > 0) out.push({ feed: f, rules: f.rules });
  }
  return out;
}

function summariseActions(actions: RuleAction[]): string {
  return actions
    .map((a) => {
      switch (a.kind) {
        case "mark-read":
          return "mark read";
        case "star":
          return "star";
        case "mute":
          return "mute";
        case "route-to-folder":
          return "route";
      }
    })
    .join(", ");
}

export function RulesAuditPanel() {
  const feeds = useFeedStore((s) => s.feeds);
  const openRulesEditor = useFeedStore((s) => s.openRulesEditor);
  const gate = useFeatureGate("rules");
  // Existing rules can linger after a downgrade; route Edit to upgrade
  // when the gate is closed rather than opening an editor that can't save.
  const editRules = (feedId: string) =>
    gate.enabled ? openRulesEditor(feedId) : gate.promptUpgrade();

  const groups = flattenFeedRules(feeds);
  const totalRules = groups.reduce((sum, g) => sum + g.rules.length, 0);

  return (
    <div
      className="rounded-lg border border-border bg-card p-4 space-y-3"
      data-testid="rules-audit-panel"
    >
      <div className="flex items-center gap-2">
        <Settings2 className="size-4 text-muted-foreground" />
        <p className="text-sm font-medium">Rules</p>
      </div>
      <p className="text-xs text-muted-foreground">
        Per-feed rules run as new articles arrive — mute, star, mark
        read, or route to a folder. Edit rules from each feed&apos;s menu.
      </p>

      {totalRules === 0 ? (
        <p
          className="text-sm text-muted-foreground"
          data-testid="rules-audit-empty"
        >
          No rules yet. Open any feed&apos;s menu and choose &quot;Rules…&quot;
          to add one.
        </p>
      ) : (
        <div className="space-y-2">
          {groups.map(({ feed, rules }) => (
            <div
              key={feed.id}
              className="rounded-md border bg-background"
              data-testid="rules-audit-feed-group"
            >
              <div className="flex items-center gap-2 border-b px-3 py-2">
                <p className="flex-1 truncate text-sm font-medium">
                  {feed.title}
                </p>
                <p className="text-xs text-muted-foreground">
                  {rules.length} rule{rules.length === 1 ? "" : "s"}
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => editRules(feed.id)}
                  aria-label={`Edit rules for ${feed.title}`}
                >
                  Edit
                </Button>
              </div>
              <ul className="divide-y">
                {rules.map((rule) => (
                  <li
                    key={rule.id}
                    data-testid="rules-audit-rule"
                    className="flex items-center gap-2 px-3 py-2 text-sm"
                  >
                    <span className="flex-1 truncate">{rule.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {summariseActions(rule.actions)}
                    </span>
                    {!rule.enabled && (
                      <span className="text-xs text-muted-foreground">
                        (paused)
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
