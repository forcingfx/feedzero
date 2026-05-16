/**
 * Single in-app entry point for "user wants to upgrade".
 *
 * Replaces direct `navigate("/?subscribe=personal-monthly")` calls. Every
 * in-app upgrade button calls this helper so future routing decisions
 * (highlight Plan card, log conversion intent, A/B test destination) have
 * one place to live.
 *
 * Stripe Checkout is still reachable from the Subscribe CTAs on the Plan
 * card inside Settings → Account; this helper opens that surface — it
 * doesn't bypass it. The marketing `/?subscribe=…` deeplink lives on for
 * external entry (email campaigns, landing pages) via SubscribeDeeplink.
 */
import { openSettings } from "@/lib/open-settings";

export function openUpgrade(): void {
  openSettings("account");
}
