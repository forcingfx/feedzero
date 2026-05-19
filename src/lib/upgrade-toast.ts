/**
 * Unified "upgrade-required" toast affordance.
 *
 * Every gated surface that stays *discoverable* to free users (smart filters,
 * auto-organize, feed quota at 26+) needs the same pattern: tell the user
 * what was blocked, offer a one-click route to the Subscription tab. Routing
 * through `goToUpgrade` keeps the destination in one place (`go-to-settings`).
 *
 * Honor-system open-core (ADR 012): the affordance only ever fires for
 * hosted free users with paid tier active; self-hosters bypass at the gate
 * and never reach this helper.
 */
import { toast } from "sonner";
import type { NavigateFunction } from "react-router";
import { goToUpgrade } from "./go-to-settings";

interface UpgradeToastOptions {
  /** Replace an existing loading toast id from `toast.loading(...)`. */
  id?: string | number;
  description?: string;
}

export function upgradeToast(
  message: string,
  navigate: NavigateFunction,
  options?: UpgradeToastOptions,
): void {
  toast.error(message, {
    id: options?.id,
    description: options?.description,
    duration: 8000,
    action: {
      label: "Upgrade",
      onClick: () => goToUpgrade(navigate),
    },
  });
}
