/**
 * Editor for a Rule's action list. Renders each action as a chip with
 * an inline parameter editor (folder picker for route-to-folder) and
 * a delete button. The "Add action" dropdown surfaces the kinds the
 * current selection does not already include — duplicate boolean
 * actions are meaningless so we don't offer them twice.
 */

import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import type { Folder, RuleAction } from "@feedzero/core/types";

interface ActionPickerProps {
  value: RuleAction[];
  onChange: (next: RuleAction[]) => void;
  folders: Folder[];
}

const KIND_LABELS: Record<RuleAction["kind"], string> = {
  "mark-read": "Mark as read",
  star: "Star",
  mute: "Mute",
  "route-to-folder": "Route to folder",
};

export function ActionPicker({ value, onChange, folders }: ActionPickerProps) {
  const presentKinds = new Set(value.map((a) => a.kind));

  function add(kind: RuleAction["kind"]) {
    if (kind === "route-to-folder") {
      const first = folders[0];
      if (!first) return;
      onChange([...value, { kind: "route-to-folder", folderId: first.id }]);
      return;
    }
    onChange([...value, { kind }]);
  }

  function update(index: number, next: RuleAction) {
    onChange(value.map((a, i) => (i === index ? next : a)));
  }

  function remove(index: number) {
    onChange(value.filter((_, i) => i !== index));
  }

  // Boolean actions can only appear once; route-to-folder can repeat
  // but later-wins, so usually one is enough — surface it only if not
  // already present for the same UX consistency.
  const available = (
    ["mark-read", "star", "mute", "route-to-folder"] as const
  ).filter((kind) => {
    if (presentKinds.has(kind)) return false;
    if (kind === "route-to-folder" && folders.length === 0) return false;
    return true;
  });

  return (
    <div className="space-y-2" data-testid="rule-action-picker">
      {value.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No actions yet. Add one to make the rule do something.
        </p>
      )}
      {value.map((action, index) => (
        <div
          key={`${action.kind}-${index}`}
          className="flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm"
        >
          <span className="font-medium">{KIND_LABELS[action.kind]}</span>
          {action.kind === "route-to-folder" && (
            <select
              value={action.folderId}
              onChange={(e) =>
                update(index, {
                  kind: "route-to-folder",
                  folderId: e.target.value,
                })
              }
              className="ml-2 h-8 rounded-md border bg-background px-2 text-sm"
              data-testid="rule-action-folder-select"
            >
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="ml-auto h-7 w-7 p-0"
            aria-label={`Remove ${KIND_LABELS[action.kind]}`}
            onClick={() => remove(index)}
          >
            <X className="size-3.5" />
          </Button>
        </div>
      ))}
      {available.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              data-testid="rule-action-add"
            >
              <Plus className="size-3.5" /> Add action
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {available.map((kind) => (
              <DropdownMenuItem key={kind} onClick={() => add(kind)}>
                {KIND_LABELS[kind]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
