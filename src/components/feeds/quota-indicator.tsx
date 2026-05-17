/**
 * Free-tier quota footer for the sidebar.
 *
 * Renders only for hosted Free users. Paid users and self-hosters see
 * nothing — the cap doesn't apply to them, and a quota chip would be
 * visual noise. At or above the cap, the indicator surfaces an Upgrade
 * link pointing at the Personal monthly deeplink so the user can convert
 * inline without leaving the sidebar.
 *
 * Reads tier from `useLicenseStore` and the feed count from `useFeedStore`
 * so it stays in sync with adds/removes without prop drilling.
 */

import { useNavigate } from "react-router";
import { useFeedStore } from "@/stores/feed-store";
import { useLicenseStore } from "@/stores/license-store";
import { isSelfHosted } from "@/core/features/self-hosted";
import { FREE_FEED_LIMIT } from "@/core/features/quotas";
import { goToUpgrade } from "@/lib/go-to-settings";
import { cn } from "@/lib/utils";

export function QuotaIndicator() {
  const tier = useLicenseStore((s) => s.tier);
  const count = useFeedStore((s) => s.feeds.length);
  const navigate = useNavigate();

  if (tier !== "free") return null;
  if (isSelfHosted()) return null;

  const atOrOverLimit = count >= FREE_FEED_LIMIT;

  return (
    <div
      className={cn(
        "text-muted-foreground border-sidebar-border flex items-center justify-between border-t px-3 py-2 text-xs",
        atOrOverLimit && "text-destructive",
      )}
    >
      <span>
        {count} / {FREE_FEED_LIMIT} feeds
      </span>
      {atOrOverLimit && (
        <button
          type="button"
          onClick={() => goToUpgrade(navigate)}
          className="text-primary font-medium hover:underline"
        >
          Upgrade
        </button>
      )}
    </div>
  );
}
