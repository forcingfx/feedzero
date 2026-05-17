/**
 * Inline tier comparison for the Subscription tab.
 *
 * Same four tier cards — Free / Personal / Pro / Self-host — same CTAs,
 * no modal chrome. Personal CTAs use same-tab Stripe Checkout deeplinks;
 * the customer returns to /billing/success which auto-fills the license.
 */
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { openLogin } from "@/lib/open-login";

export function SubscriptionUpgrade() {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Cloud sync, auto-organize, and more — for the price of a coffee.
      </p>

      <p className="text-xs text-muted-foreground">
        Already have a FeedZero account?{" "}
        <button
          type="button"
          onClick={openLogin}
          className="text-primary underline hover:no-underline"
        >
          Log in
        </button>
      </p>

      <TierCard
        name="Free"
        price="$0"
        blurb="Up to 25 feeds. No account. Stays in your browser."
        features={[
          "1,300+ curated feeds in Explore",
          "OPML import / export",
          "Full-text extraction",
          "Offline support",
        ]}
        cta="Current plan"
        ctaDisabled
      />

      <TierCard
        name="Personal"
        price="$5/mo"
        priceSub="or $50/yr — save 17%"
        blurb="Sync across every device. Unlimited feeds."
        featured
        features={[
          "Everything in Free",
          "End-to-end encrypted cloud sync",
          "Auto-organize folders",
          "Unlimited feeds",
        ]}
        cta="Subscribe to Personal — $5/mo"
        ctaHref="/?subscribe=personal-monthly"
        secondaryCta="or $50/yr — save 17%"
        secondaryCtaHref="/?subscribe=personal-yearly"
      />

      <TierCard
        name="Pro"
        price="Coming 2026"
        blurb="When RSS becomes your work."
        comingSoon
        features={[
          "Everything in Personal",
          "AI Signal — summaries & briefings",
          "Full-text search across articles",
          "Send to Kindle",
        ]}
        cta="Coming soon"
        ctaDisabled
      />

      <TierCard
        name="Self-host"
        price="$0 · MIT"
        blurb="Run your own copy. Every shipped feature unlocked."
        features={[
          "Unlimited feeds, cloud sync on your own server",
          "No license check, no kill switch",
          "Open source under MIT",
        ]}
        cta="Self-hosting guide →"
        ctaHref="https://www.feedzero.app/docs/self-hosting"
        ctaTargetBlank
      />
    </div>
  );
}

interface TierCardProps {
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

function TierCard({
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
