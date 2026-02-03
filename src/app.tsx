import { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router";
import { useAppStore } from "@/stores/app-store.ts";
import { useFeedStore } from "@/stores/feed-store.ts";
import { Toaster } from "@/components/ui/sonner.tsx";
import { SyncSetupDialog } from "@/components/sync/sync-setup-dialog.tsx";
import { OnboardingModal } from "@/components/onboarding/onboarding-modal.tsx";
import { FeedsPage } from "@/pages/feeds-page.tsx";

const DEFAULT_PASSPHRASE = "feedzero-default-key";

function AppInit({ children }: { children: React.ReactNode }) {
  const isDbReady = useAppStore((s) => s.isDbReady);
  const error = useAppStore((s) => s.error);
  const hasCompletedOnboarding = useAppStore((s) => s.hasCompletedOnboarding);
  const checkOnboardingStatus = useAppStore((s) => s.checkOnboardingStatus);
  const initialize = useAppStore((s) => s.initialize);
  const loadFeeds = useFeedStore((s) => s.loadFeeds);
  const refreshAll = useFeedStore((s) => s.refreshAll);

  useEffect(() => {
    checkOnboardingStatus();
  }, []);

  // For returning users who completed onboarding, initialize the database
  useEffect(() => {
    if (hasCompletedOnboarding === true && !isDbReady) {
      initialize(DEFAULT_PASSPHRASE);
    }
  }, [hasCompletedOnboarding, isDbReady, initialize]);

  useEffect(() => {
    if (isDbReady) {
      loadFeeds();
      refreshAll();
    }
  }, [isDbReady, loadFeeds, refreshAll]);

  if (error) {
    return (
      <div className="p-4 text-destructive">Failed to initialize: {error}</div>
    );
  }

  if (hasCompletedOnboarding === null) {
    return <div className="p-4 text-muted-foreground">Loading…</div>;
  }

  if (hasCompletedOnboarding === false) {
    return null;
  }

  if (!isDbReady) {
    return <div className="p-4 text-muted-foreground">Loading…</div>;
  }

  return <>{children}</>;
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
            <Route path="*" element={<Navigate to="/feeds" replace />} />
          </Routes>
        </AppInit>
        <Toaster />
      </BrowserRouter>
      <OnboardingModal />
      <SyncSetupDialog />
    </>
  );
}
