/**
 * Inline tier comparison for the Subscription tab.
 *
 * Renders the three tier cards — Free / Supporter / Self-host — with
 * checkout deeplinks. The Supporter CTA uses a same-tab Stripe Checkout
 * deeplink; the customer returns to /billing/success which auto-fills the
 * license.
 *
 * Pro was retired when pricing collapsed to a single $9/year plan, so there
 * is one paid card rather than two plus a roadmap placeholder.
 *
 * The "Already have a FeedZero account? Log in" muted link has been
 * promoted to a primary "Activate existing license" CTA on the Subscription
 * tab itself (see <SubscriptionTab>) — that's a top-level action, not a
 * footnote to pricing.
 *
 * <TierCard> is exported so paid users can be shown only the alternative
 * tiers (upgrade / downgrade) rather than the full pricing grid.
 */
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { pricingBullets, tierLabel } from "@/core/features/tier-matrix";
import { PAID_PLAN } from "@/core/features/pricing";
import { FREE_FEED_LIMIT } from "@/core/features/quotas";
import type { Tier } from "@/core/features/tier-matrix";

/** Feature bullets for a tier card: structural lead bullets (quota /
 *  "everything in …") followed by the matrix-derived feature bullets for
 *  that tier. Re-tiering a feature in the matrix moves its bullet here
 *  automatically — see `pricingBullets`. */
function bulletsFor(tier: Tier, lead: string[]): string[] {
  return [...lead, ...pricingBullets(tier).map((b) => b.blurb)];
}

export function SubscriptionUpgrade() {
  return (
    <div className="space-y-3">
      <TierCard
        name={tierLabel("free")}
        price="$0"
        blurb={`Up to ${FREE_FEED_LIMIT} feeds. Optional end-to-end encrypted cloud sync. No account.`}
        features={bulletsFor("free", [])}
        cta="Current plan"
        ctaDisabled
      />

      <TierCard
        name={tierLabel("personal")}
        price={PAID_PLAN.display}
        blurb={`Unlimited feeds and power-user organization. ${PAID_PLAN.trialDays} days free, cancel anytime.`}
        featured
        features={bulletsFor("personal", ["Everything in Free", "Unlimited feeds"])}
        cta={`Start ${PAID_PLAN.trialDays}-day free trial — then ${PAID_PLAN.display}`}
        ctaHref="/?subscribe=personal-yearly"
      />

      <TierCard
        name="Self-host"
        price="$0 · AGPL"
        blurb="Run your own copy. Every shipped feature unlocked."
        features={[
          "Unlimited feeds, cloud sync on your own server",
          "No license check, no kill switch",
          "Open source under AGPL-3.0",
        ]}
        cta="Self-hosting guide →"
        ctaHref="https://www.feedzero.app/docs/self-hosting"
        ctaTargetBlank
      />
    </div>
  );
}

export interface TierCardProps {
  name: string;
  price: string;
  priceSub?: string;
  blurb: string;
  features: string[];
  featured?: boolean;
  comingSoon?: boolean;
  cta?: string;
  ctaHref?: string;
  ctaDisabled?: boolean;
  ctaTargetBlank?: boolean;
  secondaryCta?: string;
  secondaryCtaHref?: string;
}

export function TierCard({
  name,
  price,
  priceSub,
  blurb,
  features,
  featured,
  comingSoon,
  cta,
  ctaHref,
  ctaDisabled,
  ctaTargetBlank,
  secondaryCta,
  secondaryCtaHref,
}: TierCardProps) {
  const borderClass = featured
    ? "border-emerald-300 dark:border-emerald-700 shadow-sm"
    : comingSoon
      ? "border-dashed border-border bg-card/50"
      : "border-border";

  return (
    <div className={`rounded-lg border ${borderClass} bg-card p-4 space-y-2`}>
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          {featured && <Sparkles className="size-4 text-emerald-600" />}
          <h3 className="text-base font-semibold">{name}</h3>
        </div>
        <div className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{price}</span>
          {priceSub && <span className="ml-1.5 text-xs">({priceSub})</span>}
        </div>
      </div>
      <p className="text-sm text-muted-foreground">{blurb}</p>
      <ul className="text-xs text-muted-foreground space-y-0.5 pl-4 list-disc">
        {features.map((f) => (
          <li key={f}>{f}</li>
        ))}
      </ul>
      {cta && (
        <div className="pt-1 flex flex-col gap-1">
          {ctaHref && !ctaDisabled ? (
            <Button
              asChild
              size="sm"
              variant={featured ? "default" : "outline"}
              className="w-full sm:w-auto"
            >
              <a
                href={ctaHref}
                {...(ctaTargetBlank
                  ? { target: "_blank", rel: "noreferrer noopener" }
                  : {})}
              >
                {cta}
              </a>
            </Button>
          ) : (
            <Button size="sm" variant="ghost" disabled className="w-full sm:w-auto">
              {cta}
            </Button>
          )}
          {secondaryCta && secondaryCtaHref && (
            <a
              href={secondaryCtaHref}
              className="text-xs text-muted-foreground hover:underline self-start"
            >
              {secondaryCta}
            </a>
          )}
        </div>
      )}
    </div>
  );
}
