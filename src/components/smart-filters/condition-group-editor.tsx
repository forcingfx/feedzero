import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Switch } from "@/components/ui/switch.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import { ConditionRow } from "./condition-row.tsx";
import type {
  Condition,
  ConditionGroup,
} from "@feedzero/core/types";

interface ConditionGroupEditorProps {
  group: ConditionGroup;
  onChange: (next: ConditionGroup) => void;
  /** When provided, renders a header with "remove this group" affordance.
   *  Root group passes undefined; nested groups always pass this. */
  onRemove?: () => void;
  /** Visual nesting depth, used for indent + border. */
  depth?: number;
  /** Optional filter ids to exclude from the filterRef selector. */
  excludeFilterIds?: string[];
}

/**
 * Recursive editor for a condition group. Renders a "match all/any"
 * toggle + an optional NOT inversion + a list of children, each of
 * which is either a leaf ConditionRow or another nested
 * ConditionGroupEditor.
 *
 * State lives in the parent — every change rebuilds the group from
 * the child's onChange callback. The component is a controlled
 * editor, no internal state beyond what the props provide.
 */
export function ConditionGroupEditor({
  group,
  onChange,
  onRemove,
  depth = 0,
  excludeFilterIds = [],
}: ConditionGroupEditorProps) {
  function updateChild(index: number, next: Condition | ConditionGroup) {
    onChange({
      ...group,
      children: group.children.map((c, i) => (i === index ? next : c)),
    });
  }

  function removeChild(index: number) {
    onChange({
      ...group,
      children: group.children.filter((_, i) => i !== index),
    });
  }

  function addCondition() {
    const blank: Condition = { kind: "title", op: "contains", value: "" };
    onChange({ ...group, children: [...group.children, blank] });
  }

  function addGroup() {
    const blank: ConditionGroup = {
      kind: "group",
      match: "all",
      children: [],
    };
    onChange({ ...group, children: [...group.children, blank] });
  }

  return (
    <div
      data-testid="condition-group-editor"
      data-depth={depth}
      className={
        depth === 0
          ? "space-y-2"
          : "space-y-2 pl-4 border-l-2 border-muted ml-2"
      }
    >
      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">Match</span>
        <select
          aria-label="Match mode"
          value={group.match}
          onChange={(e) =>
            onChange({ ...group, match: e.target.value as "all" | "any" })
          }
          className="h-8 rounded-md border bg-background px-2 text-sm"
        >
          <option value="all">all</option>
          <option value="any">any</option>
        </select>
        <span className="text-muted-foreground">of the following</span>
        <Label className="flex items-center gap-2 ml-2 text-xs text-muted-foreground cursor-pointer">
          <Switch
            checked={Boolean(group.not)}
            onCheckedChange={(checked) =>
              onChange({ ...group, not: checked })
            }
            aria-label="Negate this group"
          />
          NOT
        </Label>
        {onRemove && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onRemove}
            className="ml-auto text-muted-foreground hover:text-destructive"
            aria-label="Remove group"
          >
            <Trash2 className="size-3.5" />
          </Button>
        )}
      </div>

      {group.children.length === 0 && (
        <p className="text-xs text-muted-foreground italic pl-1">
          No conditions yet. Add one below to start filtering.
        </p>
      )}

      {group.children.map((child, index) =>
        child.kind === "group" ? (
          <ConditionGroupEditor
            key={index}
            group={child}
            depth={depth + 1}
            onChange={(next) => updateChild(index, next)}
            onRemove={() => removeChild(index)}
            excludeFilterIds={excludeFilterIds}
          />
        ) : (
          <ConditionRow
            key={index}
            condition={child}
            onChange={(next) => updateChild(index, next)}
            onRemove={() => removeChild(index)}
            excludeFilterIds={excludeFilterIds}
          />
        ),
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            data-testid={`add-child-${depth}`}
          >
            <Plus className="size-3 mr-1" />
            Add
            <ChevronDown className="size-3 ml-1" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onClick={addCondition}>
            <Plus className="size-3.5 mr-2" />
            Condition
          </DropdownMenuItem>
          <DropdownMenuItem onClick={addGroup}>
            <ChevronUp className="size-3.5 mr-2 rotate-90" />
            Nested group
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
