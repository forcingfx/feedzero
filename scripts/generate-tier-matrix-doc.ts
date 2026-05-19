/**
 * Regenerate `docs/tier-matrix.md` from `src/core/features/tier-matrix.ts`.
 *
 * Usage:
 *   npm run docs:tier-matrix          — overwrite the doc
 *   npm run docs:tier-matrix -- --check  — exit 1 if the doc is stale (CI guard)
 *
 * The doc is the human-readable view of the canonical TS module. Code is
 * the source of truth — the markdown table is generated and should not be
 * edited by hand.
 */

import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  TIER_MATRIX,
  TIER_ORDER,
  CATEGORY_ORDER,
  CATEGORY_LABELS,
  type FeatureId,
  type Tier,
  type TierAvailability,
} from "../src/core/features/tier-matrix.ts";

const OUTPUT_PATH = resolve(import.meta.dirname, "../docs/tier-matrix.md");
const SOURCE_REL = "src/core/features/tier-matrix.ts";

function cell(slot: TierAvailability): string {
  if (!slot.available) return "—";
  if (slot.limit === undefined) return "✓";
  if (slot.limit === "unlimited") return "Unlimited";
  const unit = slot.limitUnit ? ` ${slot.limitUnit}` : "";
  return `${slot.limit}${unit}`;
}

function statusBadge(status: "shipped" | "coming-soon"): string {
  return status === "shipped" ? "Shipped" : "Coming soon";
}

function tierHeader(tier: Tier): string {
  return tier[0].toUpperCase() + tier.slice(1);
}

function buildDoc(): string {
  const lines: string[] = [];
  lines.push("# Tier matrix");
  lines.push("");
  lines.push(
    `_Generated from \`${SOURCE_REL}\` via \`npm run docs:tier-matrix\`. Do not edit by hand._`,
  );
  lines.push("");
  lines.push(
    "Canonical reference for what FeedZero offers at each tier. Edit the TS module to change availability or limits; the gates and quotas read from it directly.",
  );
  lines.push("");
  lines.push("Legend:");
  lines.push("");
  lines.push("- `✓` — available with no scope cap");
  lines.push('- `N <unit>` — available, capped (e.g. `25 feeds`)');
  lines.push("- `Unlimited` — available with the cap lifted");
  lines.push("- `—` — not available on this tier");
  lines.push(
    "- _Coming soon_ entries describe the planned tier placement; the gate still returns `not-built` until the feature ships.",
  );
  lines.push("");

  const ids = Object.keys(TIER_MATRIX) as FeatureId[];

  for (const category of CATEGORY_ORDER) {
    const inCategory = ids.filter((id) => TIER_MATRIX[id].category === category);
    if (inCategory.length === 0) continue;

    lines.push(`## ${CATEGORY_LABELS[category]}`);
    lines.push("");
    lines.push(
      `| Feature | ${TIER_ORDER.map(tierHeader).join(" | ")} | Status |`,
    );
    lines.push(`|---|${TIER_ORDER.map(() => "---").join("|")}|---|`);

    for (const id of inCategory) {
      const entry = TIER_MATRIX[id];
      const tierCells = TIER_ORDER.map((t) => cell(entry.tiers[t])).join(" | ");
      lines.push(
        `| **${entry.name}** — ${entry.description} | ${tierCells} | ${statusBadge(entry.status)} |`,
      );
    }
    lines.push("");
  }

  lines.push("## Self-hosting and pre-launch");
  lines.push("");
  lines.push(
    "Two flags bypass the tier checks for shipped features (coming-soon features stay locked regardless):",
  );
  lines.push("");
  lines.push(
    "- `VITE_SELF_HOSTED=1` — self-host bypass. The operator runs their own server; the gate reports `self-hosted-bypass`.",
  );
  lines.push(
    "- `VITE_PAID_TIER_VISIBLE=0` — paid tier dormant. No Subscribe path exists yet, so Free users get full functionality with `paid-tier-inactive`.",
  );
  lines.push("");
  lines.push("See [ADR 012](decisions/012-open-core-feature-gating.md) for the rationale.");
  lines.push("");

  return lines.join("\n");
}

function main(): void {
  const doc = buildDoc();
  const check = process.argv.includes("--check");

  if (check) {
    if (!existsSync(OUTPUT_PATH)) {
      console.error(`docs/tier-matrix.md is missing. Run: npm run docs:tier-matrix`);
      process.exit(1);
    }
    const current = readFileSync(OUTPUT_PATH, "utf8");
    if (current !== doc) {
      console.error(
        `docs/tier-matrix.md is stale. Run: npm run docs:tier-matrix`,
      );
      process.exit(1);
    }
    console.log("docs/tier-matrix.md is up to date.");
    return;
  }

  writeFileSync(OUTPUT_PATH, doc, "utf8");
  console.log(`Wrote ${OUTPUT_PATH}`);
}

main();
