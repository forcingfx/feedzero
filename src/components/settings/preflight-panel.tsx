/**
 * Self-host preflight panel — Settings → Help.
 *
 * A self-hoster clicks "Run preflight" to verify the deployment is wired
 * correctly. The panel runs `runSelfHostPreflight()` (pure helper in
 * `@/core/diagnostics/self-host-preflight`) and renders each check's
 * result with a clear pass/fail and per-check detail string.
 *
 * Component takes `runPreflight` as a prop rather than calling the
 * helper directly — tests inject a mock; production wiring lives in
 * the parent (HelpTab) that closes over the real env.
 */
import { useState } from "react";
import { CheckCircle2, XCircle, Loader2, Stethoscope } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PreflightReport } from "@/core/diagnostics/self-host-preflight";

const CHECK_LABELS: Record<string, string> = {
  "secure-context": "Secure context (HTTPS or localhost)",
  "crypto-subtle": "Web Crypto API exposed",
  "api-feed": "/api/feed reachable",
  "api-sync": "/api/sync reachable",
};

interface Props {
  runPreflight: () => Promise<PreflightReport>;
}

export function PreflightPanel({ runPreflight }: Props) {
  const [state, setState] = useState<
    | { kind: "idle" }
    | { kind: "running" }
    | { kind: "done"; report: PreflightReport }
  >({ kind: "idle" });

  async function handleRun() {
    setState({ kind: "running" });
    const report = await runPreflight();
    setState({ kind: "done", report });
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Stethoscope className="size-4 text-muted-foreground" />
        <p className="text-sm font-medium">Self-host preflight</p>
      </div>
      <p className="text-xs text-muted-foreground">
        Run a quick diagnostic against your deployment. Useful when feeds
        won't load or sync misbehaves — the preflight tells you which
        layer is wrong.
      </p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleRun}
        disabled={state.kind === "running"}
      >
        {state.kind === "running" ? (
          <>
            <Loader2 className="mr-2 size-4 animate-spin" />
            Running…
          </>
        ) : (
          "Run preflight"
        )}
      </Button>
      {state.kind === "done" ? (
        <div className="space-y-2 pt-2">
          {state.report.allPassed ? (
            <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
              All checks passed ✓
            </p>
          ) : (
            <p className="text-sm font-medium text-destructive">
              Some checks failed.
            </p>
          )}
          <ul className="space-y-1.5">
            {state.report.checks.map((c) => (
              <li key={c.id} className="flex items-start gap-2 text-xs">
                {c.passed ? (
                  <CheckCircle2 className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400 mt-0.5" />
                ) : (
                  <XCircle className="size-4 shrink-0 text-destructive mt-0.5" />
                )}
                <div className="min-w-0">
                  <p className="font-medium text-foreground">
                    {CHECK_LABELS[c.id] ?? c.id}
                  </p>
                  <p className="text-muted-foreground break-words">{c.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
