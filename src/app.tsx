import { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router";
import { useAppStore } from "@/stores/app-store.ts";
import { useFeedStore } from "@/stores/feed-store.ts";
import { FeedsPage } from "@/pages/feeds-page.tsx";

function AppInit({ children }: { children: React.ReactNode }) {
  const isDbReady = useAppStore((s) => s.isDbReady);
  const error = useAppStore((s) => s.error);
  const initialize = useAppStore((s) => s.initialize);
  const loadFeeds = useFeedStore((s) => s.loadFeeds);
  const refreshAll = useFeedStore((s) => s.refreshAll);

  useEffect(() => {
    initialize("feedzero-default-key");
  }, [initialize]);

  useEffect(() => {
    if (isDbReady) {
      loadFeeds();
      refreshAll();
    }
  }, [isDbReady, loadFeeds, refreshAll]);

  if (error) {
    return (
      <div className="p-md text-destructive">Failed to initialize: {error}</div>
    );
  }

  if (!isDbReady) {
    return <div className="p-md text-muted-foreground">Loading…</div>;
  }

  return <>{children}</>;
}

export function App() {
  return (
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
    </BrowserRouter>
  );
}
