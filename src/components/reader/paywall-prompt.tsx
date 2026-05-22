import { ExternalLink, LockKeyhole, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button.tsx";
import { useExtensionStore } from "@/stores/extension-store.ts";
import { isExtensionEnabled } from "@/core/extension/extension-enabled.ts";
import { cn } from "@/lib/utils.ts";

/**
 * The four states the reader pane can show when /api/page returns content
 * the paywall detector flags as gated.
 *
 * paywall          — anonymous fetch returned a stub; user has options
 * session-expired  — extension fetched with cookies but still got a stub
 *                    (cookie expired since last grant)
 * authorize        — handled implicitly via extension status; not a prop value
 *                    (the component derives this from useExtensionStore)
 * tier-mismatch    — Phase 4 polish; not implemented in this slice
 */
export type PaywallPromptReason = "paywall" | "session-expired";

interface PaywallPromptProps {
  /** Canonical publisher host (e.g. "nytimes.com"). null when URL is unparseable. */
  publisher: string | null;
  /** The original article URL; used as the "Open original" / sign-in target. */
  articleUrl: string;
  /** Defaults to "paywall". Pass "session-expired" when the authenticated
   *  fetch still returned a stub (cookies expired). */
  reason?: PaywallPromptReason;
  className?: string;
}

const EXTENSION_INSTALL_URL = "https://feedzero.app/extension";

/**
 * Reader-pane affordance for paywalled articles. Reads from the extension
 * store to pick the right call-to-action:
 *
 *   status=absent             → "Install the FeedZero extension" + Open original
 *   status=installed, !authz  → "Authorize <publisher>" + Open original
 *   reason=session-expired    → "Open <publisher> to sign in"
 *   status=unknown            → quiet stub (still probing; avoid flashing CTAs)
 */
export function PaywallPrompt({
  publisher,
  articleUrl,
  reason = "paywall",
  className,
}: PaywallPromptProps) {
  const status = useExtensionStore((s) => s.status);
  const authorizationInFlight = useExtensionStore((s) => s.authorizationInFlight);
  const requestPublisherAccess = useExtensionStore(
    (s) => s.requestPublisherAccess,
  );

  const isAuthorized = useExtensionStore((s) =>
    publisher ? s.authorizedDomains.includes(publisher) : false,
  );

  // The extension surface is hidden until it's actually distributed (see
  // extension-enabled.ts). Until then the prompt is purely informational +
  // "Open original" — no install/authorize buttons that lead nowhere.
  const extensionEnabled = isExtensionEnabled();
  const showSessionExpired =
    extensionEnabled && reason === "session-expired" && Boolean(publisher);
  const showAuthorize =
    extensionEnabled &&
    !showSessionExpired &&
    status === "installed" &&
    Boolean(publisher) &&
    !isAuthorized;
  const showInstall =
    extensionEnabled && !showSessionExpired && status === "absent";

  function handleAuthorize() {
    if (publisher) void requestPublisherAccess(publisher);
  }

  return (
    <section
      role="region"
      aria-label="Paywall prompt"
      className={cn(
        "my-4 rounded-lg border bg-card text-card-foreground p-4 flex flex-col gap-3",
        className,
      )}
    >
      <header className="flex items-start gap-2">
        <LockKeyhole className="size-4 mt-0.5 text-muted-foreground" />
        <div>
          <h3 className="font-medium leading-tight">
            {showSessionExpired
              ? `${publisher} session needs refreshing`
              : "Paywalled article"}
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            {showSessionExpired
              ? `Your sign-in to ${publisher} appears to have expired. Open the publisher to sign back in, then reload this article.`
              : publisher
                ? `${publisher} requires a subscription to read the full article.`
                : "This article appears to be behind a paywall."}
          </p>
        </div>
      </header>

      <div className="flex flex-wrap gap-2">
        {showAuthorize && publisher && (
          <Button
            type="button"
            size="sm"
            onClick={handleAuthorize}
            disabled={authorizationInFlight === publisher}
          >
            <LockKeyhole className="size-3.5" />
            Authorize {publisher}
          </Button>
        )}
        {showSessionExpired && publisher && (
          <Button asChild size="sm" variant="default">
            <a
              href={`https://${publisher}/`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <RefreshCw className="size-3.5" />
              Open {publisher} to sign in
            </a>
          </Button>
        )}
        {showInstall && (
          <Button asChild size="sm" variant="default">
            <a
              href={EXTENSION_INSTALL_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              <LockKeyhole className="size-3.5" />
              Install the FeedZero extension
            </a>
          </Button>
        )}
        <Button asChild size="sm" variant="outline">
          <a href={articleUrl} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="size-3.5" />
            Open original
          </a>
        </Button>
      </div>
    </section>
  );
}
