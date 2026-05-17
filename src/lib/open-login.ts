/**
 * Single entry point for "user wants to log in with an existing license."
 *
 * Opens <DeviceSetupWizard> — a 2-stage flow that handles license entry
 * (paste token OR recover via email) and, optionally afterward, sync
 * restoration. Funnels every "Log in"
 * affordance funnels through one place.
 */
import { useLoginStore } from "@/stores/login-store";

export function openLogin(): void {
  useLoginStore.setState({ open: true });
}

export function closeLogin(): void {
  useLoginStore.setState({ open: false });
}
