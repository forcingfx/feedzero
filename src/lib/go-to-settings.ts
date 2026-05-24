/**
 * Single entry point for navigating to the in-app Settings page.
 *
 * Settings lives at `/settings` and is rendered inside the stage panel of
 * the main feeds layout. The tab is carried in the `?tab=` query param so
 * Settings is deep-linkable and the browser back button moves between
 * tabs naturally.
 *
 * Callers pass their own `useNavigate()` result so router context stays
 * explicit at the call site — replaces the prior store-driven open() flow.
 */
import type { NavigateFunction } from "react-router";

export type SettingsTab =
  | "subscription"
  | "sync-and-data"
  | "reading"
  | "briefings"
  | "help";

export function goToSettings(
  navigate: NavigateFunction,
  tab?: SettingsTab,
): void {
  navigate(tab ? `/settings?tab=${tab}` : "/settings");
}

/** Send the user to the in-app upgrade affordance. */
export function goToUpgrade(navigate: NavigateFunction): void {
  goToSettings(navigate, "subscription");
}

/** Send the user to the sync-management section. */
export function goToSyncSetup(navigate: NavigateFunction): void {
  goToSettings(navigate, "sync-and-data");
}
