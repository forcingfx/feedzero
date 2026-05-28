/**
 * Per-feed rules editor. A single dialog with two modes:
 *  - LIST: shows the feed's existing rules with edit + delete actions.
 *  - EDIT: shows the rule editor for one rule (new or existing).
 *
 * Mode lives in component state; the store only tracks which feed is
 * open. Opening the dialog from a feed's dropdown sets
 * `rulesEditorFeedId`; closing clears it.
 */

import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Pencil, ChevronLeft, Play, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { useFeedStore } from "@/stores/feed-store.ts";
import { useArticleStore } from "@/stores/article-store.ts";
import { useSmartFilterStore } from "@/stores/smart-filter-store.ts";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Switch } from "@/components/ui/switch.tsx";
import { ConditionGroupEditor } from "@/components/smart-filters/condition-group-editor.tsx";
import { ActionPicker } from "./action-picker.tsx";
import {
  buildContext,
  evaluateGroup,
} from "@/core/filters/evaluator.ts";
import type {
  Article,
  ConditionGroup,
  Feed,
  Rule,
  RuleAction,
} from "@feedzero/core/types";

type Mode = { kind: "list" } | { kind: "edit"; rule: Rule | null };

const EMPTY_CONDITION: ConditionGroup = {
  kind: "group",
  match: "all",
  children: [],
};

export function RulesEditorDialog() {
  const feedId = useFeedStore((s) => s.rulesEditorFeedId);
  const closeEditor = useFeedStore((s) => s.closeRulesEditor);
  const feeds = useFeedStore((s) => s.feeds);
  const folders = useFeedStore((s) => s.folders);
  const addFeedRule = useFeedStore((s) => s.addFeedRule);
  const updateFeedRule = useFeedStore((s) => s.updateFeedRule);
  const removeFeedRule = useFeedStore((s) => s.removeFeedRule);
  const applyRuleToExistingArticles = useFeedStore(
    (s) => s.applyRuleToExistingArticles,
  );

  const feed: Feed | undefined = feeds.find((f) => f.id === feedId);
  const rules = feed?.rules ?? [];

  async function runRuleNow(ruleId: string) {
    if (!feedId) return;
    const result = await applyRuleToExistingArticles(feedId, ruleId);
    if (!result.ok) {
      toast.error(`Couldn't apply rule: ${result.error}`);
      return;
    }
    toast.success(
      result.value.changed === 0
        ? "No existing articles matched"
        : `Applied to ${result.value.changed} of ${result.value.total} articles`,
    );
  }

  const [mode, setMode] = useState<Mode>({ kind: "list" });

  useEffect(() => {
    if (!feedId) setMode({ kind: "list" });
  }, [feedId]);

  return (
    <Dialog
      open={Boolean(feedId)}
      onOpenChange={(open) => {
        if (!open) closeEditor();
      }}
    >
      <DialogContent
        data-testid="rules-editor-dialog"
        className="max-w-2xl max-h-[85vh] overflow-y-auto"
      >
        {mode.kind === "list" ? (
          <ListView
            feed={feed}
            rules={rules}
            onEdit={(rule) => setMode({ kind: "edit", rule })}
            onAdd={() => setMode({ kind: "edit", rule: null })}
            onDelete={async (id) => {
              if (!feedId) return;
              await removeFeedRule(feedId, id);
            }}
            onRunNow={runRuleNow}
            onClose={closeEditor}
          />
        ) : (
          <EditView
            feed={feed}
            target={mode.rule}
            folders={folders}
            onBack={() => setMode({ kind: "list" })}
            onSave={async (next, applyOnSave) => {
              if (!feedId) return;
              let ruleId: string | null = null;
              if (mode.rule) {
                await updateFeedRule(feedId, { ...mode.rule, ...next });
                ruleId = mode.rule.id;
              } else {
                const result = await addFeedRule(feedId, next);
                if (result.ok) ruleId = result.value.id;
              }
              if (applyOnSave && ruleId) {
                await runRuleNow(ruleId);
              }
              setMode({ kind: "list" });
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

interface ListViewProps {
  feed: Feed | undefined;
  rules: Rule[];
  onEdit: (rule: Rule) => void;
  onAdd: () => void;
  onDelete: (id: string) => void | Promise<void>;
  onRunNow: (id: string) => void | Promise<void>;
  onClose: () => void;
}

function ListView({
  feed,
  rules,
  onEdit,
  onAdd,
  onDelete,
  onRunNow,
  onClose,
}: ListViewProps) {
  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Settings2 className="size-4 text-violet-500" />
          Rules for {feed?.title ?? "this feed"}
        </DialogTitle>
        <DialogDescription>
          Rules run as new articles arrive. They modify the article — star
          it, mark it read, hide it, or route it to a folder — before it
          shows up in your reader.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-2">
        {rules.length === 0 && (
          <p
            data-testid="rules-empty-state"
            className="text-sm text-muted-foreground"
          >
            No rules yet. Add one to filter what shows up here automatically.
          </p>
        )}
        {rules.map((rule) => (
          <div
            key={rule.id}
            data-testid="rule-list-item"
            className="flex items-center gap-2 rounded-md border bg-background px-3 py-2"
          >
            <div className="flex-1 min-w-0">
              <p className="truncate text-sm font-medium">{rule.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {summariseActions(rule.actions)}
              </p>
            </div>
            {!rule.enabled && (
              <span className="text-xs text-muted-foreground">Paused</span>
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              aria-label={`Run "${rule.name}" now`}
              data-testid={`rule-run-now-${rule.id}`}
              onClick={() => onRunNow(rule.id)}
            >
              <Play className="size-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              aria-label="Edit rule"
              onClick={() => onEdit(rule)}
            >
              <Pencil className="size-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 text-destructive"
              aria-label="Delete rule"
              onClick={() => onDelete(rule.id)}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onAdd}
          data-testid="rule-add"
        >
          <Plus className="size-4" /> Add rule
        </Button>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Done
        </Button>
      </DialogFooter>
    </>
  );
}

interface EditViewProps {
  feed: Feed | undefined;
  target: Rule | null;
  folders: import("@feedzero/core/types").Folder[];
  onBack: () => void;
  onSave: (
    next: {
      name: string;
      condition: ConditionGroup;
      actions: RuleAction[];
      enabled?: boolean;
    },
    applyOnSave: boolean,
  ) => void | Promise<void>;
}

function EditView({ feed, target, folders, onBack, onSave }: EditViewProps) {
  const [name, setName] = useState(target?.name ?? "");
  const [enabled, setEnabled] = useState(target?.enabled ?? true);
  // Default ON — the most common reason users open this dialog is to
  // *retroactively* mute/star/route articles already in the feed. A
  // silent default-off would reproduce the "I set a rule and nothing
  // happened" gap that motivated this work.
  const [applyOnSave, setApplyOnSave] = useState(true);
  const [condition, setCondition] = useState<ConditionGroup>(
    target?.condition ?? EMPTY_CONDITION,
  );
  const [actions, setActions] = useState<RuleAction[]>(target?.actions ?? []);
  const [saving, setSaving] = useState(false);

  const canSave = !saving && name.trim().length > 0 && actions.length > 0;

  async function save() {
    if (!canSave) return;
    setSaving(true);
    try {
      await onSave(
        { name: name.trim(), condition, actions, enabled },
        applyOnSave,
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <DialogHeader>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            aria-label="Back to rules list"
            onClick={onBack}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <DialogTitle>
            {target ? "Edit rule" : "New rule"} — {feed?.title ?? "this feed"}
          </DialogTitle>
        </div>
        <DialogDescription>
          Define when this rule matches and what it does to matching articles.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="rule-name">Name</Label>
            <Input
              id="rule-name"
              data-testid="rule-name-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Mute sponsored posts"
              autoFocus
            />
          </div>
          <div className="flex items-center gap-2 self-end pb-1.5">
            <Switch
              id="rule-enabled"
              checked={enabled}
              onCheckedChange={setEnabled}
              data-testid="rule-enabled-switch"
            />
            <Label htmlFor="rule-enabled" className="text-sm">
              Enabled
            </Label>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>When an article matches</Label>
          <div className="rounded-md border bg-muted/30 p-3">
            <ConditionGroupEditor group={condition} onChange={setCondition} />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Do this</Label>
          <ActionPicker
            value={actions}
            onChange={setActions}
            folders={folders}
          />
        </div>

        <RuleMatchPreview feed={feed} condition={condition} />

        <div className="flex items-center gap-2 rounded-md border bg-muted/30 p-3">
          <Switch
            id="rule-apply-on-save"
            checked={applyOnSave}
            onCheckedChange={setApplyOnSave}
            data-testid="rule-apply-on-save-switch"
          />
          <Label
            htmlFor="rule-apply-on-save"
            className="text-sm cursor-pointer flex-1"
          >
            Apply to existing articles when saved
            <span className="block text-xs text-muted-foreground font-normal">
              Otherwise the rule only runs on articles fetched after this save.
            </span>
          </Label>
        </div>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onBack}>
          Cancel
        </Button>
        <Button
          type="button"
          onClick={save}
          disabled={!canSave}
          data-testid="rule-save"
        >
          {target ? "Save changes" : "Create rule"}
        </Button>
      </DialogFooter>
    </>
  );
}

function summariseActions(actions: RuleAction[]): string {
  if (actions.length === 0) return "No actions";
  return actions
    .map((a) => {
      switch (a.kind) {
        case "mark-read":
          return "mark as read";
        case "star":
          return "star";
        case "mute":
          return "mute";
        case "route-to-folder":
          return "route to folder";
      }
    })
    .join(", ");
}

const PREVIEW_LIMIT = 8;
// Stable reference for the empty-articles case so the selector doesn't
// hand React a fresh `[]` literal each render — Zustand + useSyncExternalStore
// treat the new reference as a state change and you get an infinite loop.
const EMPTY_ARTICLES: Article[] = Object.freeze([] as Article[]) as Article[];

/**
 * Live "what will this rule catch?" preview. Reads the article store's
 * in-memory snapshot for this feed, evaluates the condition against
 * each article, and surfaces the count + a short list of titles. Pure
 * front-end derivation — no DB read, no rule write.
 *
 * Empty conditions are vacuously true for `match: "all"`, which would
 * "match every article" and is almost never what the user wants while
 * they're still editing. We hide the list in that case and show a
 * gentle hint instead.
 */
function RuleMatchPreview({
  feed,
  condition,
}: {
  feed: Feed | undefined;
  condition: ConditionGroup;
}) {
  const articles =
    useArticleStore((s) =>
      feed ? s.articlesByFeedId[feed.id] : undefined,
    ) ?? EMPTY_ARTICLES;
  const feeds = useFeedStore((s) => s.feeds);
  const filters = useSmartFilterStore((s) => s.filters);
  const matches = useMemo(() => {
    if (!feed) return [];
    if (condition.children.length === 0) return [];
    const ctx = buildContext({ feeds, filters });
    const hits: Article[] = [];
    for (const a of articles) {
      if (evaluateGroup(condition, a, ctx)) hits.push(a);
    }
    return hits;
  }, [feed, articles, condition, feeds, filters]);

  const total = articles.length;
  const isEmpty = condition.children.length === 0;
  return (
    <div className="space-y-1.5" data-testid="rule-preview">
      <Label>Preview</Label>
      <div className="rounded-md border bg-muted/30 p-3 text-sm">
        {isEmpty ? (
          <p className="text-xs text-muted-foreground italic">
            Add a condition above to see which existing articles would match.
          </p>
        ) : (
          <>
            <p className="text-xs text-muted-foreground mb-2">
              Matches {matches.length} of {total} loaded article
              {total === 1 ? "" : "s"}
              {matches.length > PREVIEW_LIMIT
                ? ` (showing first ${PREVIEW_LIMIT})`
                : ""}
            </p>
            {matches.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">
                Nothing in the loaded snapshot matches this condition.
              </p>
            ) : (
              <ul className="space-y-1">
                {matches.slice(0, PREVIEW_LIMIT).map((a) => (
                  <li
                    key={a.id}
                    className="truncate text-xs"
                    data-testid="rule-preview-match"
                  >
                    {a.title || "(untitled)"}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}
