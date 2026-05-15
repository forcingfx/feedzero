import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router";
import { useAppStore } from "@/stores/app-store.ts";
import { useFeedStore } from "@/stores/feed-store.ts";
import { useArticleStore } from "@/stores/article-store.ts";
import { useSyncStore } from "@/stores/sync-store.ts";
import { CHANGELOG_FEED_URL } from "@/utils/constants.ts";
import { generatePassphrase } from "@/core/crypto/passphrase-generator.ts";
import { Toaster } from "@/components/ui/sonner.tsx";
import { SyncSetupDialog } from "@/components/sync/sync-setup-dialog.tsx";
import { SpeedInsights } from "@vercel/speed-insights/react";
import { FeedsPage } from "@/pages/feeds-page.tsx";
import { BillingSuccess } from "@/pages/billing-success.tsx";
import { BillingCancelled } from "@/pages/billing-cancelled.tsx";
import { SubscribeDeeplink } from "@/components/billing/subscribe-deeplink.tsx";
import { Button } from "@/components/ui/button.tsx";

function AppInit({ children }: { children: React.ReactNode }) {
  const isDbReady = useAppStore((s) => s.isDbReady);
  const error = useAppStore((s) => s.error);
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

  useEffect(() => {
    checkOnboardingStatus();
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
      if (!globalThis.crypto?.subtle) {
        useAppStore.getState().setError(
          "Your browser does not support the Web crypto API required for encryption. " +
          "This can happen in iOS Lockdown Mode or very old browsers.",
        );
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
    await resetApp();
    setIsResetting(false);
  };

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
            <Route path="/billing/success" element={<BillingSuccess />} />
            <Route path="/billing/cancelled" element={<BillingCancelled />} />
            <Route path="*" element={<Navigate to="/feeds" replace />} />
          </Routes>
        </AppInit>
        <Toaster position="bottom-center" />
      </BrowserRouter>
      <SyncSetupDialog />
      <SpeedInsights />
    </>
  );
}
