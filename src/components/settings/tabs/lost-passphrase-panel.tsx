/**
 * <LostPassphrasePanel> — one-line muted note about passphrase recovery.
 *
 * Rendered under the sync toggle only when sync is actually enabled. Before
 * the redesign this was a full amber box shown even to local-only users,
 * which alarmed people who weren't using sync. The honest content is
 * short: we can't recover the passphrase, but the user can always set up
 * fresh sync — their local feeds are preserved either way.
 *
 * Distinct from license recovery (which IS possible via /billing/recover):
 * licenses are server-issued JWTs and can be re-emailed; passphrases are
 * client-only secrets and cannot be reissued without losing the vault.
 */
export function LostPassphrasePanel() {
  return (
    <p className="text-xs text-muted-foreground px-1">
      FeedZero cannot recover your sync passphrase if you lose it. You can
      always set up fresh cloud sync — your local feeds and articles are
      preserved either way.
    </p>
  );
}
