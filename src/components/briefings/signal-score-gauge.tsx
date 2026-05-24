import { scoreBand } from "@/core/briefings/signal-score";
import { cn } from "@/lib/utils";

interface Props {
  score: number;
  className?: string;
}

/**
 * 0–100 signal-score gauge for a briefing. Shows the numeric score, a
 * coloured band label (Weak / Moderate / Strong), and a fill bar.
 * Bands match `scoreBand()` in core so a future band tweak flows from
 * one place.
 */
export function SignalScoreGauge({ score, className }: Props) {
  const band = scoreBand(score);
  const label =
    band === "strong" ? "Strong" : band === "moderate" ? "Moderate" : "Weak";
  const fillColor =
    band === "strong"
      ? "bg-emerald-500"
      : band === "moderate"
        ? "bg-amber-500"
        : "bg-rose-500";
  const labelColor =
    band === "strong"
      ? "text-emerald-700 dark:text-emerald-400"
      : band === "moderate"
        ? "text-amber-700 dark:text-amber-400"
        : "text-rose-700 dark:text-rose-400";

  return (
    <div className={cn("space-y-1", className)} aria-label="Signal score">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-medium text-muted-foreground">
          Signal score
        </span>
        <span className="flex items-baseline gap-2">
          <span className={cn("text-xs font-medium", labelColor)}>{label}</span>
          <span className="text-2xl font-semibold tabular-nums">{score}</span>
          <span className="text-xs text-muted-foreground">/ 100</span>
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuenow={score}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
      >
        <div
          className={cn("h-full transition-all", fillColor)}
          style={{ width: `${score}%` }}
        />
      </div>
    </div>
  );
}
