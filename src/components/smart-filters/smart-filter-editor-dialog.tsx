import { useEffect, useMemo, useState } from "react";
import { Filter } from "lucide-react";
import { useSmartFilterStore } from "@/stores/smart-filter-store.ts";
import { useArticleStore } from "@/stores/article-store.ts";
import { useFeedStore } from "@/stores/feed-store.ts";
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
import { ConditionGroupEditor } from "./condition-group-editor.tsx";
import { validateFilter } from "@/core/filters/validation.ts";
import {
  buildContext,
  evaluateFilter,
} from "@/core/filters/evaluator.ts";
import type {
  ConditionGroup,
  SmartFilter,
  ArticleSortMode,
} from "@/types/index.ts";

const EMPTY_RULE: ConditionGroup = {
  kind: "group",
  match: "all",
  children: [],
};

/**
 * Editor dialog for smart filters. Open / close + target are
 * controlled by useSmartFilterStore (editorOpen / editorTarget).
 *
 * State strategy: when the dialog opens, copy the target's fields
 * into local React state. Local edits never mutate the store until
 * the user clicks Save — Cancel just discards the local snapshot.
 * This makes "discard changes" trivial.
 */
export function SmartFilterEditorDialog() {
  const editorOpen = useSmartFilterStore((s) => s.editorOpen);
  const editorTarget = useSmartFilterStore((s) => s.editorTarget);
  const closeEditor = useSmartFilterStore((s) => s.closeEditor);
  const createFilter = useSmartFilterStore((s) => s.createFilter);
  const updateFilter = useSmartFilterStore((s) => s.updateFilter);
  const duplicateFilter = useSmartFilterStore((s) => s.duplicateFilter);
  const removeFilter = useSmartFilterStore((s) => s.removeFilter);

  const allArticles = useArticleStore((s) => s.articlesByFeedId);
  const feeds = useFeedStore((s) => s.feeds);
  const allFilters = useSmartFilterStore((s) => s.filters);

  const [name, setName] = useState("");
  const [rule, setRule] = useState<ConditionGroup>(EMPTY_RULE);
  const [sortMode, setSortMode] = useState<ArticleSortMode | undefined>(
    undefined,
  );
  const [limitText, setLimitText] = useState("");
  const [saving, setSaving] = useState(false);

  // Hydrate local state every time the dialog opens. Reset on close.
  useEffect(() => {
    if (!editorOpen) return;
    setName(editorTarget?.name ?? "");
    setRule(editorTarget?.rule ?? EMPTY_RULE);
    setSortMode(editorTarget?.sortMode);
    setLimitText(editorTarget?.limit ? String(editorTarget.limit) : "");
  }, [editorOpen, editorTarget]);

  // Live preview count — runs the evaluator over every loaded article
  // every render. Cheap for realistic article counts; if it ever shows
  // up in profiles we can debounce.
  const matchCount = useMemo(() => {
    if (!editorOpen) return 0;
    const ctx = buildContext({ feeds, filters: allFilters });
    const previewFilter: SmartFilter = {
      id: editorTarget?.id ?? "__preview__",
      name: name || "preview",
      rule,
      createdAt: 0,
      updatedAt: 0,
    };
    let count = 0;
    for (const list of Object.values(allArticles)) {
      for (const article of list) {
        if (evaluateFilter(previewFilter, article, ctx)) count++;
      }
    }
    return count;
  }, [editorOpen, editorTarget?.id, name, rule, feeds, allFilters, allArticles]);

  const validation = useMemo(() => {
    const previewFilter: SmartFilter = {
      id: editorTarget?.id ?? "__preview__",
      name,
      rule,
      createdAt: 0,
      updatedAt: 0,
    };
    return validateFilter(previewFilter);
  }, [name, rule, editorTarget?.id]);

  const saveDisabled = saving || !validation.ok;

  async function handleSave() {
    setSaving(true);
    try {
      const limit = parsePositiveInt(limitText);
      if (editorTarget) {
        await updateFilter({
          ...editorTarget,
          name: name.trim(),
          rule,
          sortMode,
          limit: limit ?? undefined,
        });
      } else {
        await createFilter({
          name: name.trim(),
          rule,
          sortMode,
          limit: limit ?? undefined,
        });
      }
      closeEditor();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={editorOpen}
      onOpenChange={(open) => {
        if (!open) closeEditor();
      }}
    >
      <DialogContent
        data-testid="smart-filter-editor-dialog"
        className="max-w-2xl max-h-[85vh] overflow-y-auto"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Filter className="size-4 text-violet-500" />
            {editorTarget ? "Edit filter" : "New smart filter"}
          </DialogTitle>
          <DialogDescription>
            Combine conditions to build a custom view across all your feeds.
            Articles are matched live — no background processing.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="smart-filter-name">Name</Label>
            <Input
              id="smart-filter-name"
              data-testid="smart-filter-name-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Recent AI news I haven't read"
              autoFocus
            />
          </div>

          <div className="rounded-md border bg-muted/30 p-3">
            <ConditionGroupEditor
              group={rule}
              onChange={setRule}
              excludeFilterIds={editorTarget ? [editorTarget.id] : []}
            />
          </div>

          <details className="text-sm">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
              Advanced — sort + limit
            </summary>
            <div className="mt-2 flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Label htmlFor="smart-filter-sort">Sort</Label>
                <select
                  id="smart-filter-sort"
                  value={sortMode ?? ""}
                  onChange={(e) =>
                    setSortMode(
                      e.target.value
                        ? (e.target.value as ArticleSortMode)
                        : undefined,
                    )
                  }
                  className="h-8 rounded-md border bg-background px-2 text-sm"
                >
                  <option value="">(default)</option>
                  <option value="newest">Newest first</option>
                  <option value="oldest">Oldest first</option>
                  <option value="unread-first">Unread first</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <Label htmlFor="smart-filter-limit">Limit</Label>
                <Input
                  id="smart-filter-limit"
                  type="number"
                  min={1}
                  value={limitText}
                  onChange={(e) => setLimitText(e.target.value)}
                  className="h-8 w-24"
                  placeholder="—"
                />
              </div>
            </div>
          </details>

          <div
            data-testid="smart-filter-preview-count"
            className="text-sm text-muted-foreground"
          >
            <span className="font-medium text-foreground">{matchCount}</span>{" "}
            article{matchCount === 1 ? "" : "s"} match currently.
          </div>

          {!validation.ok && (
            <p
              data-testid="smart-filter-error"
              className="text-sm text-destructive"
            >
              {validation.error}
            </p>
          )}
        </div>

        <DialogFooter className="sm:justify-between">
          <div className="flex gap-2">
            {editorTarget && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  data-testid="smart-filter-duplicate"
                  onClick={async () => {
                    await duplicateFilter(editorTarget.id);
                    closeEditor();
                  }}
                  disabled={saving}
                >
                  Duplicate
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  data-testid="smart-filter-delete"
                  onClick={async () => {
                    await removeFilter(editorTarget.id);
                    closeEditor();
                  }}
                  disabled={saving}
                >
                  Delete
                </Button>
              </>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={closeEditor}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              type="button"
              data-testid="smart-filter-save"
              onClick={handleSave}
              disabled={saveDisabled}
            >
              {editorTarget ? "Save changes" : "Create filter"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function parsePositiveInt(raw: string): number | null {
  if (!raw.trim()) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.floor(n);
}
