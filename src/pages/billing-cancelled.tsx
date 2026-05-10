/**
 * Stripe Checkout cancellation redirect target.
 *
 * Stripe sends customers here when they back out of the hosted Checkout
 * page (close the tab, click the back arrow, etc.). No charge happens —
 * Stripe doesn't process anything until the customer hits Confirm.
 *
 * UX contract: explicit reassurance that no charge was made + a clear way
 * back to the reader. Intentionally minimal — there's nothing for the user
 * to do here other than navigate away.
 */

export function BillingCancelled() {
  return (
    <div className="mx-auto max-w-xl p-8 space-y-6">
      <h1 className="text-2xl font-semibold">No problem — no charge made</h1>

      <p>
        You backed out of the Stripe checkout page before confirming. No
        payment was processed and no subscription was created.
      </p>

      <p>
        You can subscribe again any time from the FeedZero app.
      </p>

      <p>
        <a href="/feeds">Back to FeedZero</a>
      </p>
    </div>
  );
}
