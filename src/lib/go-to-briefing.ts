/**
 * Single entry point for navigating to a saved Signal Briefing.
 *
 * Briefings live as a sub-tab under Signal: /signal/briefings is the
 * index, /signal/briefings/:briefingId is the page. The pre-merge
 * top-level /briefings URLs still resolve via a redirect in app.tsx.
 */
import type { NavigateFunction } from "react-router";

export function goToBriefing(
  navigate: NavigateFunction,
  briefingId?: string,
): void {
  navigate(
    briefingId ? `/signal/briefings/${briefingId}` : "/signal/briefings",
  );
}
