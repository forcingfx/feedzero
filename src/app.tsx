import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route } from "react-router";
import { useAppStore } from "@/stores/app-store.ts";
import { useFeedStore } from "@/stores/feed-store.ts";
import { useArticleStore } from "@/stores/article-store.ts";
import { useSyncStore } from "@/stores/sync-store.ts";
import { CHANGELOG_FEED_URL } from "@/utils/constants.ts";
import { generatePassphrase } from "@/core/crypto/passphrase-generator.ts";
import { Toaster } from "@/components/ui/sonner.tsx";
import { SyncMigrationDialog } from "@/components/sync/sync-migration-dialog.tsx";
import { DeviceSetupWizard } from "@/components/billing/device-setup-wizard.tsx";
import { NavigateWithSearch } from "@/components/routing/navigate-with-search.tsx";
import { SpeedInsights } from "@vercel/speed-insights/react";
import { FeedsPage } from "@/pages/feeds-page.tsx";
import { BillingSuccess } from "@/pages/billing-success.tsx";
import { BillingCancelled } from "@/pages/billing-cancelled.tsx";
import { BillingRecover } from "@/pages/billing-recover.tsx";
import { BillingIssued } from "@/pages/billing-issued.tsx";
import { SubscribeDeeplink } from "@/components/billing/subscribe-deeplink.tsx";
import { useLicenseStore } from "@/stores/license-store.ts";
import { Button } from "@/components/ui/button.tsx";
import {
  checkSecureContext,
  type SecureContextProblemKind,
} from "@/core/security/secure-context.ts";
import { InvalidKeysScreen } from "@/components/recovery/invalid-keys-screen";

function AppInit({ children }: { children: React.ReactNode }) {
  const isDbReady = useAppStore((s) => s.isDbReady);
  const error = useAppStore((s) => s.error);
  const recoveryMode = useAppStore((s) => s.recoveryMode);
  const hasCompletedOnboarding = useAppStore((s) => s.hasCompletedOnboarding);
  const checkOnboardingStatus = useAppStore((s) => s.checkOnboardingStatus);
  const initialize = useAppStore((s) => s.initialize);
  const completeOnboarding = useAppStore((s) => s.completeOnboarding);
  const initializeReturningUser = useAppStore((s) => s.initializeReturningUser);
  const resetApp = useAppStore((s) => s.resetApp);
  const loadFeeds = useFeedStore((s) => s.loadFeeds);
  const refreshAll = useFeedStore((s) => s.refreshAll);
  const preloadArticles = useArticleStore((s) => s.preloadAll);
  const [isResetting, setIsResetting] = useState(false);
  const [securityProblem, setSecurityProblem] = useState<{
    kind: SecureContextProblemKind;
    message: string;
    origin?: string;
  } | null>(null);

  useEffect(() => {
    checkOnboardingStatus();
    // Resolve the user's license tier once at startup so gated UI (Sidebar
    // status chip, feature gates) doesn't flash "Free" for paid users.
    void useLicenseStore.getState().refresh();
  }, []);

  // Returning users: restore from stored keys
  useEffect(() => {
    if (hasCompletedOnboarding === true && !isDbReady) {
      initializeReturningUser();
    }
  }, [hasCompletedOnboarding, isDbReady, initializeReturningUser]);

  // New users: auto-initialize with local-only mode (no onboarding modal)
  useEffect(() => {
    if (hasCompletedOnboarding === false && !isDbReady) {
      const check = checkSecureContext({
        isSecureContext: globalThis.isSecureContext ?? false,
        crypto: globalThis.crypto as Pick<Crypto, "subtle"> | undefined,
        origin: typeof window !== "undefined" ? window.location.origin : undefined,
      });
      if (!check.ok) {
        setSecurityProblem({ kind: check.kind, message: check.error, origin: check.origin });
        return;
      }
      generatePassphrase()
        .then((passphrase) => initialize(passphrase, { sync: false }))
        .then(() => {
          // initialize() reports failures by setting `error` on the store
          // without throwing. Don't mark onboarding complete in that case —
          // the user needs to see the error and retry, not be promoted to a
          // returning user with a half-initialized DB.
          if (!useAppStore.getState().error) completeOnboarding();
        })
        .catch((err) => {
          useAppStore.getState().setError(
            err instanceof Error ? err.message : "Initialization failed",
          );
        });
    }
  }, [hasCompletedOnboarding, isDbReady, initialize, completeOnboarding]);

  const addFeed = useFeedStore((s) => s.addFeed);

  useEffect(() => {
    if (isDbReady) {
      loadFeeds().then(async () => {
        // Auto-subscribe new users to the release notes feed published by the
        // landing site. addFeed handles the cross-origin fetch via the feed
        // service (CORS is enabled on feedzero.app/releases.xml).
        const { feeds } = useFeedStore.getState();
        if (feeds.length === 0) {
          try {
            await addFeed(CHANGELOG_FEED_URL);
          } catch { /* noop — first-launch auto-subscribe is best-effort */ }
        }
        preloadArticles();
      });
      // Sync users: initializeReturningUser already pulled the cloud vault,
      // so an immediate refreshAll() would do a redundant second pull whose
      // importAll's clear+bulkPut window races with consumers reading feeds.
      // Local users still get auto-refresh on boot (no pull involved).
      if (!useSyncStore.getState().credentials) {
        refreshAll();
      }
    }
  }, [isDbReady, loadFeeds, refreshAll, preloadArticles, addFeed]);

  const handleReset = async () => {
    setIsResetting(true);
    // resetApp() can hang in an insecure context — IndexedDB ops may sit
    // forever without throwing. Race against a 5s ceiling so the user
    // isn't trapped on a frozen button. The hard fallback wipes
    // localStorage on its own so re-onboarding can start fresh.
    const RESET_TIMEOUT_MS = 5000;
    const timed = new Promise<void>((resolve) =>
      setTimeout(() => {
        try { localStorage.clear(); } catch { /* noop */ }
        resolve();
      }, RESET_TIMEOUT_MS),
    );
    await Promise.race([resetApp(), timed]);
    setIsResetting(false);
  };

  if (securityProblem) {
    return (
      <div className="p-6 max-w-xl mx-auto space-y-4">
        <h1 className="text-lg font-semibold">FeedZero can't start here</h1>
        <p className="text-sm text-muted-foreground whitespace-pre-line">
          {securityProblem.message}
        </p>
        {securityProblem.origin ? (
          <p className="text-sm">
            <span className="text-muted-foreground">You're loading from:</span>{" "}
            <code className="text-foreground">{securityProblem.origin}</code>
          </p>
        ) : null}
        {securityProblem.kind === "insecure-context" ? (
          <div className="text-sm space-y-2">
            <p>Common fixes for self-hosters:</p>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              <li>Put Caddy or nginx in front of <code>:3000</code> with a TLS cert.</li>
              <li>Or open the app via <code>http://localhost:3000</code> from the host itself.</li>
              <li>Or trust a self-signed cert for the LAN address.</li>
            </ul>
            <p className="pt-2">
              <a
                className="underline"
                href="https://feedzero.app/docs/self-hosting"
                target="_blank"
                rel="noreferrer noopener"
              >
                Self-hosting guide →
              </a>
            </p>
          </div>
        ) : null}
      </div>
    );
  }

  // Invalid-keys recovery screen replaces the previous boot-time
  // auto-destroy cascade. Surface explicit choices instead of silently
  // deleting the user's cloud vault (issue #117).
  if (recoveryMode === "invalid-keys") {
    return <InvalidKeysScreen />;
  }

  if (error) {
    return (
      <div className="p-4 space-y-4">
        <div className="text-destructive">Failed to initialize: {error}</div>
        <div className="text-sm text-muted-foreground">
          Your local data may be corrupted or was encrypted with a different
          passphrase. You can reset the app to start fresh.
        </div>
        <Button
          variant="destructive"
          onClick={handleReset}
          disabled={isResetting}
        >
          {isResetting ? "Resetting..." : "Reset App"}
        </Button>
      </div>
    );
  }

  if (!isDbReady) {
    return <div className="p-4 text-muted-foreground">Loading…</div>;
  }

  return (
    <>
      <SubscribeDeeplink
        paidTierVisible={import.meta.env.VITE_PAID_TIER_VISIBLE === "1"}
        priceIds={{
          personalMonthly:
            import.meta.env.VITE_PRICE_PERSONAL_MONTHLY ?? "",
          personalYearly:
            import.meta.env.VITE_PRICE_PERSONAL_YEARLY ?? "",
        }}
      />
      {children}
    </>
  );
}

export function App() {
  return (
    <>
      <BrowserRouter>
        <AppInit>
          <Routes>
            <Route path="/feeds" element={<FeedsPage />} />
            <Route path="/feeds/:feedId" element={<FeedsPage />} />
            <Route
              path="/feeds/:feedId/articles/:articleId"
              element={<FeedsPage />}
            />
            <Route path="/explore" element={<FeedsPage />} />
            <Route path="/stats" element={<FeedsPage />} />
            <Route path="/settings" element={<FeedsPage />} />
            <Route path="/billing/success" element={<BillingSuccess />} />
            <Route path="/billing/cancelled" element={<BillingCancelled />} />
            <Route path="/billing/recover" element={<BillingRecover />} />
            <Route path="/billing/issued" element={<BillingIssued />} />
            <Route path="*" element={<NavigateWithSearch to="/feeds" />} />
          </Routes>
        </AppInit>
        {/* Top-level dialogs mounted inside the Router so hooks like
            useNavigate and useWhatsNew (which Settings → Help calls)
            have router context. */}
        <SyncMigrationDialog />
        <DeviceSetupWizard />
        <Toaster position="bottom-center" />
      </BrowserRouter>
      <SpeedInsights />
    </>
  );
}
