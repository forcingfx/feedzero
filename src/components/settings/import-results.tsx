import { CheckCircle2, Clock, XCircle, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type { ImportResult } from "@/stores/import-store";

interface ImportResultsProps {
  successCount: number;
  /** Placeholder feeds (added but initial fetch failed; will retry on refresh). */
  placeholderCount: number;
  failureCount: number;
  results: ImportResult[];
  onDone: () => void;
  onImportMore: () => void;
}

/**
 * Compose the result summary line out of three buckets. Drops zero-counts
 * so the user doesn't see ", 0 queued" noise.
 */
function summary(success: number, placeholder: number, failure: number) {
  const parts: string[] = [];
  parts.push(`${success} feed${success !== 1 ? "s" : ""} added`);
  if (placeholder > 0) parts.push(`${placeholder} queued for retry`);
  if (failure > 0) parts.push(`${failure} failed`);
  return parts.join(", ");
}

export function ImportResults({
  successCount,
  placeholderCount,
  failureCount,
  results,
  onDone,
  onImportMore,
}: ImportResultsProps) {
  const successes = results.filter((r) => r.success && !r.placeholder);
  const placeholders = results.filter((r) => r.success && r.placeholder);
  const failures = results.filter((r) => !r.success);

  return (
    <div className="space-y-4">
      <div className="text-center py-4">
        <div className="flex justify-center mb-2">
          {failureCount === 0 && placeholderCount === 0 ? (
            <div className="flex size-12 items-center justify-center rounded-full bg-green-100">
              <CheckCircle2 className="size-6 text-green-600" />
            </div>
          ) : successCount === 0 && placeholderCount === 0 ? (
            <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10">
              <XCircle className="size-6 text-destructive" />
            </div>
          ) : (
            <div className="flex size-12 items-center justify-center rounded-full bg-amber-100">
              <CheckCircle2 className="size-6 text-amber-600" />
            </div>
          )}
        </div>
        <p className="font-medium">
          {summary(successCount, placeholderCount, failureCount)}
        </p>
        {placeholderCount > 0 && (
          <p className="mt-1 text-xs text-muted-foreground">
            Queued feeds appear in the sidebar — press <kbd>r</kbd> or
            right-click → Refresh to retry them.
          </p>
        )}
      </div>

      {successes.length > 0 && (
        <Collapsible>
          <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md border p-3 text-sm hover:bg-muted/50">
            <span className="flex items-center gap-2">
              <CheckCircle2 className="size-4 text-green-600" />
              Successful ({successes.length})
            </span>
            <ChevronDown className="size-4" />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <ul className="mt-2 space-y-1 rounded-md border p-2">
              {successes.map((result, i) => (
                <li
                  key={i}
                  className="truncate text-sm text-muted-foreground"
                  title={result.url}
                >
                  {result.url}
                </li>
              ))}
            </ul>
          </CollapsibleContent>
        </Collapsible>
      )}

      {placeholders.length > 0 && (
        <Collapsible defaultOpen>
          <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md border p-3 text-sm hover:bg-muted/50">
            <span className="flex items-center gap-2">
              <Clock className="size-4 text-amber-600" />
              Queued for retry ({placeholders.length})
            </span>
            <ChevronDown className="size-4" />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <ul className="mt-2 space-y-2 rounded-md border p-2">
              {placeholders.map((result, i) => (
                <li key={i} className="text-sm">
                  <p className="truncate font-medium" title={result.url}>
                    {result.url}
                  </p>
                  {result.error && (
                    <p className="text-amber-700 text-xs">{result.error}</p>
                  )}
                </li>
              ))}
            </ul>
          </CollapsibleContent>
        </Collapsible>
      )}

      {failures.length > 0 && (
        <Collapsible defaultOpen>
          <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md border p-3 text-sm hover:bg-muted/50">
            <span className="flex items-center gap-2">
              <XCircle className="size-4 text-destructive" />
              Failed ({failures.length})
            </span>
            <ChevronDown className="size-4" />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <ul className="mt-2 space-y-2 rounded-md border p-2">
              {failures.map((result, i) => (
                <li key={i} className="text-sm">
                  <p className="truncate font-medium" title={result.url}>
                    {result.url}
                  </p>
                  {result.error && (
                    <p className="text-destructive text-xs">{result.error}</p>
                  )}
                </li>
              ))}
            </ul>
          </CollapsibleContent>
        </Collapsible>
      )}

      <div className="flex gap-2">
        <Button variant="outline" onClick={onImportMore} className="flex-1">
          Import more
        </Button>
        <Button onClick={onDone} className="flex-1">
          Done
        </Button>
      </div>
    </div>
  );
}
