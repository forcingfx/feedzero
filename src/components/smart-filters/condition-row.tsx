import { Trash2 } from "lucide-react";
import { useFeedStore } from "@/stores/feed-store.ts";
import { useSmartFilterStore } from "@/stores/smart-filter-store.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Switch } from "@/components/ui/switch.tsx";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover.tsx";
import { Checkbox } from "@/components/ui/checkbox.tsx";
import { Label } from "@/components/ui/label.tsx";
import { validateCondition } from "@/core/filters/validation.ts";
import type { Condition } from "@feedzero/core/types";

interface ConditionRowProps {
  condition: Condition;
  onChange: (next: Condition) => void;
  onRemove: () => void;
  /** Optional list of filter ids to omit from the filterRef selector
   *  (the current filter, to prevent immediate self-reference). */
  excludeFilterIds?: string[];
}

/**
 * Single editable condition row. Renders a field selector, an
 * operator selector that re-derives from the field, and a value
 * widget whose shape depends on (field, operator). When the user
 * switches field type, op + value reset to safe defaults via
 * `defaultConditionFor`.
 */
export function ConditionRow({
  condition,
  onChange,
  onRemove,
  excludeFilterIds = [],
}: ConditionRowProps) {
  const feeds = useFeedStore((s) => s.feeds);
  const folders = useFeedStore((s) => s.folders);
  const filters = useSmartFilterStore((s) => s.filters);
  const validation = validateCondition(condition);

  function handleFieldChange(kind: Condition["kind"]) {
    onChange(defaultConditionFor(kind));
  }

  return (
    <div
      data-testid="condition-row"
      className="flex flex-wrap items-center gap-2 py-1.5"
    >
      <select
        aria-label="Field"
        value={condition.kind}
        onChange={(e) =>
          handleFieldChange(e.target.value as Condition["kind"])
        }
        className="h-8 rounded-md border bg-background px-2 text-sm"
      >
        <option value="title">Title</option>
        <option value="author">Author</option>
        <option value="content">Content</option>
        <option value="feed">Feed</option>
        <option value="folder">Folder</option>
        <option value="tag">Tag</option>
        <option value="publishedAt">Date</option>
        <option value="read">Read</option>
        <option value="starred">Starred</option>
        <option value="extracted">Has offline copy</option>
        <option value="filterRef">Matches filter</option>
      </select>

      <OpSelector condition={condition} onChange={onChange} />

      <ValueWidget
        condition={condition}
        onChange={onChange}
        feeds={feeds}
        folders={folders}
        filters={filters.filter((f) => !excludeFilterIds.includes(f.id))}
      />

      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onRemove}
        className="ml-auto text-muted-foreground hover:text-destructive"
        aria-label="Remove condition"
      >
        <Trash2 className="size-3.5" />
      </Button>

      {!validation.ok && (
        <p
          data-testid="condition-row-error"
          className="basis-full text-xs text-destructive pl-1"
        >
          {validation.error}
        </p>
      )}
    </div>
  );
}

function OpSelector({
  condition,
  onChange,
}: {
  condition: Condition;
  onChange: (next: Condition) => void;
}) {
  const ops = operatorsFor(condition.kind);
  return (
    <select
      aria-label="Operator"
      value={condition.op}
      onChange={(e) =>
        onChange({
          ...condition,
          op: e.target.value,
        } as Condition)
      }
      className="h-8 rounded-md border bg-background px-2 text-sm"
    >
      {ops.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function ValueWidget({
  condition,
  onChange,
  feeds,
  folders,
  filters,
}: {
  condition: Condition;
  onChange: (next: Condition) => void;
  feeds: ReturnType<typeof useFeedStore.getState>["feeds"];
  folders: ReturnType<typeof useFeedStore.getState>["folders"];
  filters: ReturnType<typeof useSmartFilterStore.getState>["filters"];
}) {
  // Text fields
  if (
    condition.kind === "title" ||
    condition.kind === "author" ||
    condition.kind === "content"
  ) {
    return (
      <Input
        type="text"
        value={condition.value}
        onChange={(e) => onChange({ ...condition, value: e.target.value })}
        placeholder={
          condition.op === "matches" ? "regex pattern" : "search text"
        }
        className="h-8 w-48"
        aria-label="Value"
      />
    );
  }

  // Free-form comma-separated input for tags. Unlike feed/folder we
  // don't pick from a list — tags are free-form strings (`Feed.tags`,
  // populated from OPML outline[category]) and the user typically
  // matches against the same labels they saw in their previous reader.
  if (condition.kind === "tag") {
    return (
      <Input
        value={condition.value.join(", ")}
        placeholder="tech, news"
        onChange={(e) =>
          onChange({
            ...condition,
            value: e.target.value
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean),
          })
        }
        className="h-8 min-w-40"
        aria-label="Value"
      />
    );
  }

  // Multi-select for feed / folder
  if (condition.kind === "feed" || condition.kind === "folder") {
    const items =
      condition.kind === "feed"
        ? feeds.map((f) => ({ id: f.id, label: f.title }))
        : folders.map((f) => ({ id: f.id, label: f.name }));
    const selected = new Set(condition.value);
    return (
      <Popover>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 min-w-32 justify-start"
          >
            {selected.size === 0
              ? "Pick…"
              : `${selected.size} selected`}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 max-h-64 overflow-y-auto p-2">
          {items.length === 0 ? (
            <p className="text-xs text-muted-foreground p-2">
              No {condition.kind === "feed" ? "feeds" : "folders"} yet.
            </p>
          ) : (
            items.map((item) => (
              <Label
                key={item.id}
                className="flex items-center gap-2 py-1 px-1 cursor-pointer hover:bg-accent rounded"
              >
                <Checkbox
                  checked={selected.has(item.id)}
                  onCheckedChange={(checked) => {
                    const next = new Set(selected);
                    if (checked) next.add(item.id);
                    else next.delete(item.id);
                    onChange({ ...condition, value: Array.from(next) });
                  }}
                />
                <span className="text-sm truncate">{item.label}</span>
              </Label>
            ))
          )}
        </PopoverContent>
      </Popover>
    );
  }

  // Date conditions
  if (condition.kind === "publishedAt") {
    if (condition.op === "in-last-days" || condition.op === "in-last-hours") {
      return (
        <Input
          type="number"
          min={1}
          value={typeof condition.value === "number" ? condition.value : ""}
          onChange={(e) =>
            onChange({ ...condition, value: Number(e.target.value) || 0 })
          }
          className="h-8 w-24"
          aria-label="Value"
        />
      );
    }
    if (condition.op === "before" || condition.op === "after") {
      return (
        <Input
          type="date"
          value={epochToDateInput(condition.value as number)}
          onChange={(e) =>
            onChange({
              ...condition,
              value: dateInputToEpoch(e.target.value),
            })
          }
          className="h-8 w-44"
          aria-label="Value"
        />
      );
    }
    if (condition.op === "between") {
      const [lo, hi] = condition.value as [number, number];
      return (
        <div className="flex items-center gap-1">
          <Input
            type="date"
            value={epochToDateInput(lo)}
            onChange={(e) =>
              onChange({
                ...condition,
                value: [dateInputToEpoch(e.target.value), hi],
              })
            }
            className="h-8 w-36"
            aria-label="From"
          />
          <span className="text-xs text-muted-foreground">→</span>
          <Input
            type="date"
            value={epochToDateInput(hi)}
            onChange={(e) =>
              onChange({
                ...condition,
                value: [lo, dateInputToEpoch(e.target.value)],
              })
            }
            className="h-8 w-36"
            aria-label="To"
          />
        </div>
      );
    }
  }

  // Boolean conditions
  if (
    condition.kind === "read" ||
    condition.kind === "starred" ||
    condition.kind === "extracted"
  ) {
    return (
      <Switch
        checked={condition.value}
        onCheckedChange={(checked) => onChange({ ...condition, value: checked })}
        aria-label="Value"
      />
    );
  }

  // filterRef
  if (condition.kind === "filterRef") {
    return (
      <select
        aria-label="Filter"
        value={condition.value}
        onChange={(e) => onChange({ ...condition, value: e.target.value })}
        className="h-8 rounded-md border bg-background px-2 text-sm"
      >
        <option value="">Pick a filter…</option>
        {filters.map((f) => (
          <option key={f.id} value={f.id}>
            {f.name}
          </option>
        ))}
      </select>
    );
  }

  return null;
}

// --- helpers -----------------------------------------------------------------

interface OperatorOption {
  value: string;
  label: string;
}

/**
 * Operators surfaced per condition kind. The labels read like
 * sentence fragments ("contains", "is", "in last") so the row reads
 * roughly: <field> <op> <value>.
 */
function operatorsFor(kind: Condition["kind"]): OperatorOption[] {
  switch (kind) {
    case "title":
    case "content":
      return [
        { value: "contains", label: "contains" },
        { value: "not-contains", label: "doesn't contain" },
        { value: "equals", label: "equals" },
        { value: "matches", label: "matches regex" },
      ];
    case "author":
      return [
        { value: "contains", label: "contains" },
        { value: "not-contains", label: "doesn't contain" },
        { value: "equals", label: "equals" },
      ];
    case "feed":
    case "folder":
    case "tag":
      return [
        { value: "in", label: "is any of" },
        { value: "not-in", label: "is none of" },
      ];
    case "publishedAt":
      return [
        { value: "in-last-days", label: "in last (days)" },
        { value: "in-last-hours", label: "in last (hours)" },
        { value: "before", label: "before" },
        { value: "after", label: "after" },
        { value: "between", label: "between" },
      ];
    case "read":
    case "starred":
    case "extracted":
      return [{ value: "is", label: "is" }];
    case "filterRef":
      return [{ value: "matches", label: "matches" }];
  }
}

/**
 * When the user switches the field, op and value need to reset to
 * something the operator-selector will recognise. Returning a fully-
 * formed default keeps the type-narrowing honest.
 */
function defaultConditionFor(kind: Condition["kind"]): Condition {
  switch (kind) {
    case "title":
    case "author":
    case "content":
      return { kind, op: "contains", value: "" };
    case "feed":
    case "folder":
    case "tag":
      return { kind, op: "in", value: [] };
    case "publishedAt":
      return { kind, op: "in-last-days", value: 7 };
    case "read":
    case "starred":
    case "extracted":
      return { kind, op: "is", value: false };
    case "filterRef":
      return { kind, op: "matches", value: "" };
  }
}

function epochToDateInput(epoch: number): string {
  if (!epoch || Number.isNaN(epoch)) return "";
  const d = new Date(epoch);
  // YYYY-MM-DD for <input type="date">
  return d.toISOString().slice(0, 10);
}

function dateInputToEpoch(date: string): number {
  if (!date) return 0;
  const d = new Date(date + "T00:00:00.000Z");
  return d.getTime();
}
