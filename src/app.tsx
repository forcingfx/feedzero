import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router";
import { useAppStore } from "@/stores/app-store.ts";
import { useFeedStore } from "@/stores/feed-store.ts";
import { Toaster } from "@/components/ui/sonner.tsx";
import { SyncSetupDialog } from "@/components/sync/sync-setup-dialog.tsx";
import { OnboardingModal } from "@/components/onboarding/onboarding-modal.tsx";
import { FeedsPage } from "@/pages/feeds-page.tsx";
import { Button } from "@/components/ui/button.tsx";

function AppInit({ children }: { children: React.ReactNode }) {
  const isDbReady = useAppStore((s) => s.isDbReady);
  const error = useAppStore((s) => s.error);
  const hasCompletedOnboarding = useAppStore((s) => s.hasCompletedOnboarding);
  const checkOnboardingStatus = useAppStore((s) => s.checkOnboardingStatus);
  const initializeReturningUser = useAppStore((s) => s.initializeReturningUser);
  const resetApp = useAppStore((s) => s.resetApp);
  const loadFeeds = useFeedStore((s) => s.loadFeeds);
  const refreshAll = useFeedStore((s) => s.refreshAll);
  const [isResetting, setIsResetting] = useState(false);

  useEffect(() => {
    checkOnboardingStatus();
  }, []);

  useEffect(() => {
    if (hasCompletedOnboarding === true && !isDbReady) {
      initializeReturningUser();
    }
  }, [hasCompletedOnboarding, isDbReady, initializeReturningUser]);

  useEffect(() => {
    if (isDbReady) {
      loadFeeds();
      refreshAll();
    }
  }, [isDbReady, loadFeeds, refreshAll]);

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
