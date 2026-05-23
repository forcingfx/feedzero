import { useEffect, useState, lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, useNavigate } from "react-router";
import { useAppStore } from "@/stores/app-store.ts";
import { useFeedStore } from "@/stores/feed-store.ts";
import { useArticleStore } from "@/stores/article-store.ts";
import { useSyncStore } from "@/stores/sync-store.ts";
import { useSmartFilterStore } from "@/stores/smart-filter-store.ts";
import { CHANGELOG_FEED_URL } from "@feedzero/core/utils/constants";
import { Toaster } from "@/components/ui/sonner.tsx";
import { SmartFilterEditorDialog } from "@/components/smart-filters/smart-filter-editor-dialog.tsx";
import { RulesEditorDialog } from "@/components/rules/rules-editor-dialog.tsx";
import { FeedSettingsDialog } from "@/components/feeds/feed-settings-dialog.tsx";
import { FolderSettingsDialog } from "@/components/folders/folder-settings-dialog.tsx";
import { DeviceSetupWizard } from "@/components/billing/device-setup-wizard.tsx";
import { CommandPalette } from "@/components/command-palette/command-palette.tsx";
import { NavigateWithSearch } from "@/components/routing/navigate-with-search.tsx";
import { AppLayout } from "@/pages/app-layout.tsx";
import { FeedsRoute } from "@/pages/feeds-route.tsx";
import { StageView } from "@/pages/stage-view.tsx";
import { BillingSuccess } from "@/pages/billing-success.tsx";
import { BillingCancelled } from "@/pages/billing-cancelled.tsx";
import { BillingRecover } from "@/pages/billing-recover.tsx";
import { BillingIssued } from "@/pages/billing-issued.tsx";
import { SubscribeDeeplink } from "@/components/billing/subscribe-deeplink.tsx";
import { useLicenseStore } from "@/stores/license-store.ts";
import { useExtensionStore } from "@/stores/extension-store.ts";
import { isExtensionEnabled } from "@/core/extension/extension-enabled.ts";
import { Button } from "@/components/ui/button.tsx";
import { InvalidKeysScreen } from "@/components/recovery/invalid-keys-screen";

const ExploreCatalog = lazy(() =>
  import("@/components/explore/explore-catalog.tsx").then((m) => ({
    default: m.ExploreCatalog,
  })),
);
const StatsPage = lazy(() =>
  import("@/components/stats/stats-page.tsx").then((m) => ({
    default: m.StatsPage,
  })),
);
const SettingsPage = lazy(() =>
  import("@/pages/settings-page.tsx").then((m) => ({
    default: m.SettingsPage,
  })),
);
const SignalPage = lazy(() =>
  import("@/pages/signal-page.tsx").then((m) => ({
    default: m.SignalPage,
  })),
);

function ExploreRoute() {
  const navigate = useNavigate();
  return (
    <StageView>
      <Suspense>
        <ExploreCatalog onFeedAdded={(id) => navigate(`/feeds/${id}`)} />
      </Suspense>
    </StageView>
  );
}

function StatsRoute() {
  return (
    <StageView>
      <Suspense>
        <StatsPage />
      </Suspense>
    </StageView>
  );
}

function SettingsRoute() {
  return (
    <StageView>
      <Suspense>
        <SettingsPage />
      </Suspense>
    </StageView>
  );
}

function SignalRoute() {
  return (
    <StageView>
      <Suspense>
        <SignalPage />
      </Suspense>
    </StageView>
  );
}

function AppInit({ children }: { children: React.ReactNode }) {
  const isDbReady = useAppStore((s) => s.isDbReady);
  const error = useAppStore((s) => s.error);
  const recoveryMode = useAppStore((s) => s.recoveryMode);
  const securityProblem = useAppStore((s) => s.securityProblem);
  const hasCompletedOnboarding = useAppStore((s) => s.hasCompletedOnboarding);
  const checkOnboardingStatus = useAppStore((s) => s.checkOnboardingStatus);
  const initializeReturningUser = useAppStore((s) => s.initializeReturningUser);
  const startNewUserOnboarding = useAppStore((s) => s.startNewUserOnboarding);
  const resetApp = useAppStore((s) => s.resetApp);
  const loadFeeds = useFeedStore((s) => s.loadFeeds);
  const refreshAll = useFeedStore((s) => s.refreshAll);
  const preloadArticles = useArticleStore((s) => s.preloadAll);
  const loadSmartFilters = useSmartFilterStore((s) => s.loadFilters);
  const [isResetting, setIsResetting] = useState(false);

  useEffect(() => {
    checkOnboardingStatus();
    // Resolve the user's license tier once at startup so gated UI (Sidebar
    // status chip, feature gates) doesn't flash "Free" for paid users.
    void useLicenseStore.getState().refresh();
    // Probe for the FeedZero browser extension only when the surface is
    // enabled. Short timeout (200ms), resolves to "installed" / "absent"
    // so the reader pane's paywall prompts can pick the right CTA without
    // ping-on-every-render. While the extension is undistributed
    // (VITE_EXTENSION_ENABLED off) there's nothing to probe for.
    if (isExtensionEnabled()) {
      void useExtensionStore.getState().detect();
    }
  }, []);

  // Returning users: restore from stored keys.
  useEffect(() => {
    if (hasCompletedOnboarding === true && !isDbReady) {
      initializeReturningUser();
    }
  }, [hasCompletedOnboarding, isDbReady, initializeReturningUser]);

  // New users: fire the full new-user boot sequence in app-store.
  // The action handles secure-context check + passphrase generation +
  // DB init + completeOnboarding; AppInit just renders the resulting
  // state (isDbReady / error / securityProblem).
  useEffect(() => {
    if (hasCompletedOnboarding === false && !isDbReady) {
      void startNewUserOnboarding();
    }
  }, [hasCompletedOnboarding, isDbReady, startNewUserOnboarding]);

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
      // Load smart filters once on boot. Like folders, they're
      // user-defined config that the sidebar needs immediately;
      // the encrypted-blob read is cheap (typically <10 rows).
      void loadSmartFilters();
      // Sync users: initializeReturningUser already pulled the cloud vault,
      // so an immediate refreshAll() would do a redundant second pull whose
      // importAll's clear+bulkPut window races with consumers reading feeds.
      // Local users still get auto-refresh on boot (no pull involved).
      if (!useSyncStore.getState().credentials) {
        refreshAll();
      }
    }
  }, [isDbReady, loadFeeds, refreshAll, preloadArticles, loadSmartFilters, addFeed]);

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
            <Route element={<AppLayout />}>
              <Route path="/feeds" element={<FeedsRoute />} />
              <Route path="/feeds/:feedId" element={<FeedsRoute />} />
              <Route
                path="/feeds/:feedId/articles/:articleId"
                element={<FeedsRoute />}
              />
              <Route path="/explore" element={<ExploreRoute />} />
              <Route path="/signal" element={<SignalRoute />} />
              <Route path="/stats" element={<StatsRoute />} />
              <Route path="/settings" element={<SettingsRoute />} />
            </Route>
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
        <DeviceSetupWizard />
        <SmartFilterEditorDialog />
        <RulesEditorDialog />
        <FeedSettingsDialog />
        <FolderSettingsDialog />
        <CommandPalette />
        <Toaster position="bottom-center" />
      </BrowserRouter>
    </>
  );
}
