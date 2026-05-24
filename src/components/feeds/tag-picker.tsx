import { useMemo, useState, useRef, useCallback } from "react";
import { X } from "lucide-react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command.tsx";
import { useFeedStore } from "@/stores/feed-store.ts";
import { cn } from "@/lib/utils.ts";

interface TagPickerProps {
  /** Current tags. Order matters — pills render in this order. */
  value: string[];
  /** Called with the new tag list whenever the user adds/removes one. */
  onChange: (next: string[]) => void;
  /**
   * Existing tag suggestions. Defaults to "every tag across every
   * feed in the store" — the natural lookup the user wants. Override
   * for test fixtures or scoped pickers.
   */
  suggestions?: string[];
  placeholder?: string;
  /** Render a smaller input — used inside the feed-settings dialog. */
  size?: "default" | "sm";
  /**
   * When set, the rendered input gets this id so a sibling <label> can
   * point at it.
   */
  id?: string;
  "data-testid"?: string;
}

/**
 * Free-form tag input with pill rendering + autocomplete from
 * existing tags. Built on cmdk so keyboard nav (↑/↓ to select,
 * Enter to commit, Escape to dismiss list) comes for free.
 *
 * Interaction:
 *   - Pills render to the left of the input; each pill has × to remove.
 *   - Typing into the input filters the dropdown of existing-tag
 *     suggestions (fuzzy via cmdk).
 *   - Enter on a highlighted suggestion adds it. Enter with no
 *     suggestion highlighted (or no input) commits the raw typed text
 *     as a new tag — matching the "OPML's free-form tags" semantics.
 *   - Comma in the input behaves like Enter (mirror the smart-filter
 *     condition row users have already learned).
 *   - Backspace on an empty input removes the last pill.
 *
 * Already-selected tags are filtered out of the suggestion list so
 * the user can't add the same tag twice.
 */
export function TagPicker({
  value,
  onChange,
  suggestions,
  placeholder = "Type to add a tag…",
  size = "default",
  id,
  "data-testid": testId,
}: TagPickerProps) {
  const allFeeds = useFeedStore((s) => s.feeds);
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Default suggestions: every tag across every feed in the store,
  // alphabetical for stable ordering. Already-selected tags are
  // filtered out so they don't appear in the dropdown.
  const allTags = useMemo(() => {
    if (suggestions) return suggestions;
    const set = new Set<string>();
    for (const f of allFeeds) for (const t of f.tags ?? []) if (t) set.add(t);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [suggestions, allFeeds]);

  const valueSet = useMemo(() => new Set(value), [value]);
  const availableSuggestions = useMemo(
    () => allTags.filter((t) => !valueSet.has(t)),
    [allTags, valueSet],
  );

  const addTag = useCallback(
    (raw: string) => {
      const trimmed = raw.trim();
      if (!trimmed || valueSet.has(trimmed)) {
        setInput("");
        return;
      }
      onChange([...value, trimmed]);
      setInput("");
    },
    [onChange, value, valueSet],
  );

  const removeTag = useCallback(
    (tag: string) => {
      onChange(value.filter((t) => t !== tag));
      // Refocus the input so the user can keep typing without re-clicking.
      inputRef.current?.focus();
    },
    [onChange, value],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      // Comma → commit current input as a tag. Lets users paste
      // "tech,news,frontend" and get three tags. cmdk's own Enter
      // handling commits via the highlighted item; comma is the
      // explicit no-suggestions-needed path.
      if (e.key === ",") {
        e.preventDefault();
        addTag(input);
        return;
      }
      // Backspace on empty input removes the last pill — the common
      // chip-input convention.
      if (e.key === "Backspace" && input === "" && value.length > 0) {
        e.preventDefault();
        removeTag(value[value.length - 1]);
      }
    },
    [addTag, input, removeTag, value],
  );

  const inputSizeClass = size === "sm" ? "h-7 text-xs" : "h-8 text-sm";

  return (
    <Command
      // Allow cmdk to score against the typed input even when no
      // suggestion exactly matches — so Enter on novel text falls
      // through to our addTag(input) path via the synthetic free-form
      // item rendered below.
      shouldFilter
      data-testid={testId}
      className="border bg-background overflow-visible"
    >
      <div className="flex flex-wrap items-center gap-1 p-1.5">
        {value.map((tag) => (
          <span
            key={tag}
            data-testid={`tag-pill-${tag}`}
            className="inline-flex items-center gap-1 rounded-md bg-secondary text-secondary-foreground text-xs pl-2 pr-1 py-0.5"
          >
            <span>{tag}</span>
            <button
              type="button"
              aria-label={`Remove ${tag}`}
              onClick={() => removeTag(tag)}
              className="rounded-sm hover:bg-muted-foreground/20 p-0.5"
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          id={id}
          data-testid={testId ? `${testId}-input` : "tag-picker-input"}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={value.length === 0 ? placeholder : ""}
          className={cn(
            "flex-1 min-w-32 bg-transparent outline-none placeholder:text-muted-foreground",
            inputSizeClass,
          )}
        />
      </div>
      {/* Dropdown only renders when there's a meaningful suggestion
          set OR the user has typed something novel. Empty + empty =
          nothing on screen. */}
      {(input.length > 0 || availableSuggestions.length > 0) && (
        <CommandList className="border-t max-h-48">
          <CommandEmpty className="py-2 px-3 text-xs text-muted-foreground">
            {input.trim()
              ? `Press Enter to add "${input.trim()}" as a new tag`
              : "No existing tags yet"}
          </CommandEmpty>
          {availableSuggestions.length > 0 && (
            <CommandGroup heading="Existing tags">
              {availableSuggestions.map((tag) => (
                <CommandItem
                  key={tag}
                  value={tag}
                  onSelect={() => addTag(tag)}
                >
                  {tag}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {input.trim() && !availableSuggestions.includes(input.trim()) && (
            <CommandGroup heading="Add new">
              <CommandItem
                value={`__add__${input.trim()}`}
                onSelect={() => addTag(input)}
                data-testid="tag-picker-add-new"
              >
                Add "{input.trim()}"
              </CommandItem>
            </CommandGroup>
          )}
        </CommandList>
      )}
    </Command>
  );
}
