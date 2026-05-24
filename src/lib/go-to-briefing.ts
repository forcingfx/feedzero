/**
 * Single entry point for navigating to a saved Signal Briefing.
 *
 * Briefings live at `/briefings/:briefingId` (the page) and `/briefings`
 * (the index, used when no briefing is selected yet). The page is
 * rendered inside the StageView slot, the same way Signal and Explore are.
 */
import type { NavigateFunction } from "react-router";

export function goToBriefing(
  navigate: NavigateFunction,
  briefingId?: string,
): void {
  navigate(briefingId ? `/briefings/${briefingId}` : "/briefings");
}
