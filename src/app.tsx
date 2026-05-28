import { useEffect, useRef, useState, lazy, Suspense } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  useNavigate,
  Navigate,
  useParams,
} from "react-router";
import { useAppStore } from "@/stores/app-store.ts";
import { useFeedStore } from "@/stores/feed-store.ts";
import { useArticleStore } from "@/stores/article-store.ts";
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
import { AppShellSkeleton } from "@/components/loading/app-shell-skeleton.tsx";
import { OnboardingModal } from "@/components/onboarding/onboarding-modal.tsx";

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
const BriefingPage = lazy(() =>
  import("@/pages/briefing-page.tsx").then((m) => ({
    default: m.BriefingPage,
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

function BriefingRoute() {
  return (
    <StageView>
      <Suspense>
        <BriefingPage />
      </Suspense>
    </StageView>
  );
}

/**
 * Legacy redirect: /briefings → /signal/briefings (and /briefings/:id →
 * /signal/briefings/:id). Briefings moved under Signal as a sub-tab;
 * the old top-level URLs from in-flight bookmarks redirect cleanly.
 */
function BriefingsLegacyRedirect() {
  const { briefingId } = useParams();
  const target = briefingId
    ? `/signal/briefings/${briefingId}`
    : "/signal/briefings";
  return <Navigate to={target} replace />;
}

function AppInit({ children }: { children: React.ReactNode }) {
  // bootState is now the canonical pre-mount lifecycle. The legacy
  // `isDbReady` / `error` / `recoveryMode` / `securityProblem` fields
  // remain available as derived mirrors for consumers we haven't yet
  // migrated, but the renderer here reads bootState directly so
  // every UI branch corresponds to exactly one FSM state.
  const bootState = useAppStore((s) => s.bootState);
  const dispatch = useAppStore((s) => s.dispatch);
  const startNewUserOnboarding = useAppStore((s) => s.startNewUserOnboarding);
  const resetApp = useAppStore((s) => s.resetApp);
  const loadFeeds = useFeedStore((s) => s.loadFeeds);
  const refreshAll = useFeedStore((s) => s.refreshAll);
  const preloadArticles = useArticleStore((s) => s.preloadAll);
  const loadSmartFilters = useSmartFilterStore((s) => s.loadFilters);
  const addFeed = useFeedStore((s) => s.addFeed);
  const [isResetting, setIsResetting] = useState(false);
  const newUserDispatched = useRef(false);

  // Kick the FSM once on mount. From `unknown` it walks itself through
  // checking-onboarding → restoring → hydrating → ready (or to any of
  // the failure terminal states). No cascading useEffects co-ordinating
  // who can fire when — the side-effect runner in app-store owns that.
  useEffect(() => {
    void dispatch({ type: "boot" });
    // License re-verification and the extension probe are independent
    // of the boot FSM: they run regardless of which state we land in.
    void useLicenseStore.getState().refresh();
    if (isExtensionEnabled()) {
      void useExtensionStore.getState().detect();
    }
    // Empty deps: one-shot. dispatch is a stable reference.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // New-user path: when the FSM reaches needs-onboarding the auto
  // onboarding sequence (secure-context check + passphrase + initialize
  // + completeOnboarding) runs alongside the OnboardingModal that
  // mounts at App() level. Guarded by a ref so React StrictMode's
  // double-invoke doesn't fire it twice.
  useEffect(() => {
    if (bootState.kind !== "needs-onboarding") return;
    if (newUserDispatched.current) return;
    newUserDispatched.current = true;
    void startNewUserOnboarding();
  }, [bootState.kind, startNewUserOnboarding]);

  // Post-ready: load the user's feeds, smart filters, articles, and
  // kick off the first publisher refresh. Sync users have already had
  // their vault pull fired in the background by the FSM's `hydrating`
  // side effect; refreshAll's internal syncStore.pull() awaits the
  // same in-flight promise via the inFlightPull dedup.
  useEffect(() => {
    if (bootState.kind !== "ready") return;
    loadFeeds().then(async () => {
      const { feeds } = useFeedStore.getState();
      if (feeds.length === 0) {
        try {
          await addFeed(CHANGELOG_FEED_URL);
        } catch { /* noop — first-launch auto-subscribe is best-effort */ }
      }
      preloadArticles();
    });
    void loadSmartFilters();
    refreshAll();
  }, [bootState.kind, loadFeeds, refreshAll, preloadArticles, loadSmartFilters, addFeed]);

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

  if (bootState.kind === "security-blocked") {
    const { problem } = bootState;
    return (
      <div className="p-6 max-w-xl mx-auto space-y-4">
        <h1 className="text-lg font-semibold">FeedZero can't start here</h1>
        <p className="text-sm text-muted-foreground whitespace-pre-line">
          {problem.message}
        </p>
        {problem.origin ? (
          <p className="text-sm">
            <span className="text-muted-foreground">You're loading from:</span>{" "}
            <code className="text-foreground">{problem.origin}</code>
          </p>
        ) : null}
        {problem.kind === "insecure-context" ? (
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
  if (bootState.kind === "needs-recovery") {
    return <InvalidKeysScreen />;
  }

  if (bootState.kind === "error") {
    return (
      <div className="p-4 space-y-4">
        <div className="text-destructive">Failed to initialize: {bootState.message}</div>
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

  if (bootState.kind !== "ready") {
    // unknown / checking-onboarding / needs-onboarding / restoring / hydrating
    // — all "still booting" states render the same skeleton chrome.
    // OnboardingModal mounts at App() level and opens itself when
    // bootState transitions to needs-onboarding.
    return <AppShellSkeleton />;
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
              <Route path="/signal/briefings" element={<BriefingRoute />} />
              <Route
                path="/signal/briefings/:briefingId"
                element={<BriefingRoute />}
              />
              {/* Legacy /briefings URLs from before the sub-tab merge. */}
              <Route path="/briefings" element={<BriefingsLegacyRedirect />} />
              <Route
                path="/briefings/:briefingId"
                element={<BriefingsLegacyRedirect />}
              />
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
            have router context. OnboardingModal gates itself on
            `hasCompletedOnboarding === false` and is the one piece
            of UI a never-onboarded user is allowed to see. */}
        <OnboardingModal />
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
