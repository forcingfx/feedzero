/**
 * <LostPassphrasePanel> — blunt copy about the irrecoverable nature of
 * lost sync passphrases.
 *
 * The sync passphrase decrypts the cloud vault end-to-end; we do not
 * hold an escrow key. If the user loses the passphrase, the encrypted
 * vault is permanently unreadable — not by us, not by recovery flow,
 * not by support. The panel says so plainly so users don't waste time
 * looking for a button that can't exist.
 *
 * Distinct from license recovery (which IS possible — see Recovery tab):
 * licenses are server-issued JWTs and can be re-emailed; passphrases
 * are client-only secrets and cannot be reissued without losing the
 * vault.
 */
import { AlertTriangle } from "lucide-react";
import { ContactSupport } from "@/components/settings/contact-support";
import { getLicenseToken } from "@/core/license/license-token-store";

export function LostPassphrasePanel() {
  const token = getLicenseToken();
  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-50 dark:bg-amber-950/20 p-4 space-y-3">
      <div className="flex items-start gap-2">
        <AlertTriangle className="size-5 shrink-0 text-amber-600" />
        <div>
          <h3 className="text-sm font-semibold">Lost your sync passphrase?</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Your encrypted vault is unrecoverable — we don&apos;t hold any
            escrow key, by design. Recovering your subscription does{" "}
            <strong>not</strong> recover the vault. Support can confirm
            this limitation, not work around it.
          </p>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        If your data still exists on another device that&apos;s already
        decrypted, the easiest recovery is to re-enable sync there and
        pull from that device&apos;s next push.
      </p>

      <ContactSupport
        token={token}
        diagnosticContext={{ Source: "lost-passphrase" }}
      />
    </div>
  );
}
