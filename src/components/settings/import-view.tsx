import { useState, useRef, useCallback } from "react";
import { Upload, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { parseOpmlFile } from "@/core/opml/opml-service";
import { parseUrlList, isOpmlFormat } from "@/core/opml/url-list-parser";
import {
  parsePocketExport,
  isPocketExport,
  parsePocketCsvExport,
  isPocketCsvExport,
} from "@/core/opml/pocket-parser";
import {
  parseOmnivoreExport,
  isOmnivoreExport,
} from "@/core/opml/omnivore-parser";
import {
  useImportStore,
  selectTotalCount,
  selectSuccessCount,
  selectPlaceholderCount,
  selectFailureCount,
  selectCurrentUrl,
  type ImportHeadInfo,
} from "@/stores/import-store";
import { useFeedStore } from "@/stores/feed-store";
import { useLicenseStore } from "@/stores/license-store";
import { isSelfHosted } from "@/core/features/self-hosted";
import { isPaidTierActive } from "@/core/features/paid-tier-active";
import { checkFeedQuota, quotaErrorMessage } from "@/core/features/quotas";
import { ImportProgress } from "./import-progress";
import { ImportResults } from "./import-results";

type InputMode = "file" | "text";

/**
 * Internal entry shape the import loop consumes. Mirrors the rich
 * `OpmlFeedEntry` plus the non-OPML formats (URL lists, Pocket,
 * Omnivore), where every OPML-specific field is just absent.
 */
interface ImportEntry {
  xmlUrl: string;
  title?: string;
  folderPath?: string[];
  description?: string;
  tags?: string[];
  createdAt?: number;
}

/** Pre-pass result: what to materialize before kicking off addFeed. */
interface OpmlPreamble {
  folders: { name: string; parentPath: string[] }[];
  head: ImportHeadInfo;
}

interface ImportViewProps {
  onClose: () => void;
}

export function ImportView({ onClose }: ImportViewProps) {
  const [inputMode, setInputMode] = useState<InputMode>("file");
  const [textInput, setTextInput] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const status = useImportStore((s) => s.status);
  const startImport = useImportStore((s) => s.startImport);
  const recordResult = useImportStore((s) => s.recordResult);
  const reset = useImportStore((s) => s.reset);

  const addFeed = useFeedStore((s) => s.addFeed);
  const addPlaceholderFeed = useFeedStore((s) => s.addPlaceholderFeed);
  const createFolder = useFeedStore((s) => s.createFolder);
  const moveFeedToFolder = useFeedStore((s) => s.moveFeedToFolder);

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        setSelectedFile(file);
        setParseError(null);
      }
    },
    [],
  );

  const handleFileDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) {
      setSelectedFile(file);
      setParseError(null);
    }
  }, []);

  /**
   * Parse the import content. OPML imports carry the full outline
   * metadata (title, htmlUrl, description, tags, createdAt, folderPath)
   * plus folder-tree + head-metadata preamble. Other formats yield
   * URL-only entries; the importer falls back to whatever the feed body
   * advertises for them.
   *
   * Specific-format detection runs before the URL-list fallback because
   * each format would otherwise be misread as a URL list and silently
   * produce garbage.
   */
  const parseImportContent = useCallback(
    (
      content: string,
    ): { entries: ImportEntry[]; preamble?: OpmlPreamble } => {
      if (isPocketCsvExport(content)) {
        const result = parsePocketCsvExport(content);
        if (!result.ok) throw new Error(result.error);
        return { entries: result.value.map((url) => ({ xmlUrl: url })) };
      }
      if (isOmnivoreExport(content)) {
        const result = parseOmnivoreExport(content);
        if (!result.ok) throw new Error(result.error);
        return { entries: result.value.map((url) => ({ xmlUrl: url })) };
      }
      if (isPocketExport(content)) {
        const result = parsePocketExport(content);
        if (!result.ok) throw new Error(result.error);
        // addFeedFlow runs origins through discoverFeed, so an origin like
        // https://nytimes.com becomes a subscription to the site's RSS.
        return { entries: result.value.map((url) => ({ xmlUrl: url })) };
      }
      if (isOpmlFormat(content)) {
        const result = parseOpmlFile(content);
        if (!result.ok) throw new Error(result.error);
        const doc = result.value;
        return {
          entries: doc.entries.map((entry) => ({
            xmlUrl: entry.xmlUrl,
            title: entry.title,
            folderPath: entry.folderPath,
            description: entry.description,
            tags: entry.tags,
            createdAt: entry.createdAt,
          })),
          preamble: { folders: doc.folders, head: doc.head },
        };
      }
      const result = parseUrlList(content);
      if (!result.ok) throw new Error(result.error);
      return { entries: result.value.map((url) => ({ xmlUrl: url })) };
    },
    [],
  );

  const handleImport = useCallback(async () => {
    setParseError(null);

    let content: string;
    try {
      if (inputMode === "file") {
        if (!selectedFile) {
          setParseError("Please select a file");
          return;
        }
        content = await selectedFile.text();
      } else {
        if (!textInput.trim()) {
          setParseError("Please enter OPML or URLs");
          return;
        }
        content = textInput;
      }

      const { entries, preamble } = parseImportContent(content);
      if (entries.length === 0) {
        setParseError("No valid feed URLs found");
        return;
      }

      const urls = entries.map((e) => e.xmlUrl);

      // Upfront quota check. The feed-store also gates per-URL, but doing
      // it once here lets us refuse cleanly before kicking off a loop that
      // would partially succeed and surface N cryptic per-URL failures.
      const quota = checkFeedQuota({
        currentCount: useFeedStore.getState().feeds.length,
        delta: urls.length,
        tier: useLicenseStore.getState().tier,
        isSelfHosted: isSelfHosted(),
        paidTierActive: isPaidTierActive(),
      });
      if (!quota.ok) {
        setParseError(quotaErrorMessage(quota));
        return;
      }

      // Pre-create folders depth-first so a child's parentId is always
      // resolvable when the child is created. Folder paths use `/` as the
      // separator since OPML folder names cannot themselves contain `/`
      // (the XML attribute string would survive but Folder.name would
      // need escaping — out of scope; conflicts get filed under the
      // existing same-name folder, which matches the legacy behavior).
      const folderIdByPath = new Map<string, string>();
      const opmlFolders = preamble?.folders ?? [];
      for (const folder of opmlFolders) {
        const parentKey = folder.parentPath.join("/");
        const parentId = parentKey ? folderIdByPath.get(parentKey) : undefined;
        await createFolder(folder.name, parentId);
        // Snapshot the just-created folder's id by name lookup against
        // siblings under the same parent. Multiple folders with the same
        // name under different parents are kept distinct by `parentKey`.
        const fullKey = [...folder.parentPath, folder.name].join("/");
        const justCreated = useFeedStore
          .getState()
          .folders.find(
            (f) => f.name === folder.name && (f.parentId ?? "") === (parentId ?? ""),
          );
        if (justCreated) folderIdByPath.set(fullKey, justCreated.id);
      }

      // Best-effort folder placement for a just-added feed (real or
      // placeholder). A missing folder or feed lookup leaves the
      // subscription unfiled, which is the safe fallback.
      const placeFeedIntoFolder = async (entry: ImportEntry) => {
        if (!entry.folderPath || entry.folderPath.length === 0) return;
        const folderId = folderIdByPath.get(entry.folderPath.join("/"));
        const addedFeed = useFeedStore
          .getState()
          .feeds.find((f) => f.url === entry.xmlUrl);
        if (folderId && addedFeed) {
          await moveFeedToFolder(addedFeed.id, folderId);
        }
      };

      // Start import process; thread the OPML head info so ImportResults
      // can show "Imported from {ownerName}'s OPML, created {dateCreated}".
      startImport(urls, preamble?.head);

      // Process each entry sequentially. Three outcomes per URL:
      //   * ok            → fully imported; move to folder, record success
      //   * fetch-failure → persist as placeholder so refresh can retry;
      //                     same folder placement, recorded as placeholder
      //   * other err     → permanent (parse / discovery / duplicate /
      //                     quota); record failure, no row created
      //
      // OPML metadata threading: title (issue #117), description fallback,
      // tags, and createdAt all flow into addFeed so the user's outline
      // metadata survives a reader migration intact.
      for (const entry of entries) {
        const titleOverride = entry.title?.trim();
        const opts = buildAddFeedOptions(entry, titleOverride);
        const result = await addFeed(entry.xmlUrl, opts);

        if (result.ok) {
          await placeFeedIntoFolder(entry);
          recordResult({ url: entry.xmlUrl, success: true });
          continue;
        }

        if (result.reason !== "fetch-failure") {
          recordResult({
            url: entry.xmlUrl,
            success: false,
            error: result.error,
          });
          continue;
        }

        // Recoverable fetch failure — persist a placeholder so the user
        // can hit refresh later to recover the feed.
        const placeholder = await addPlaceholderFeed(
          entry.xmlUrl,
          result.error,
        );
        if (!placeholder.ok) {
          // Placeholder creation itself failed (e.g. duplicate URL in
          // the database). Fall through to a hard failure.
          recordResult({
            url: entry.xmlUrl,
            success: false,
            error: placeholder.error,
          });
          continue;
        }
        await placeFeedIntoFolder(entry);
        recordResult({
          url: entry.xmlUrl,
          success: true,
          placeholder: true,
          error: result.error,
        });
      }
    } catch (err) {
      setParseError(
        err instanceof Error ? err.message : "Failed to parse input",
      );
    }
  }, [
    inputMode,
    selectedFile,
    textInput,
    parseImportContent,
    startImport,
    addFeed,
    addPlaceholderFeed,
    createFolder,
    moveFeedToFolder,
    recordResult,
  ]);

  const handleReset = useCallback(() => {
    reset();
    setSelectedFile(null);
    setTextInput("");
    setParseError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, [reset]);

  // Show progress view during import
  if (status === "importing") {
    const state = useImportStore.getState();
    return (
      <ImportProgress
        currentUrl={selectCurrentUrl(state)}
        currentIndex={state.currentIndex}
        totalCount={selectTotalCount(state)}
      />
    );
  }

  // Show results view after complete
  if (status === "complete") {
    const state = useImportStore.getState();
    return (
      <ImportResults
        successCount={selectSuccessCount(state)}
        placeholderCount={selectPlaceholderCount(state)}
        failureCount={selectFailureCount(state)}
        results={state.results}
        head={state.head}
        onDone={() => {
          handleReset();
          onClose();
        }}
        onImportMore={handleReset}
      />
    );
  }

  // Show error view
  if (status === "error") {
    const error = useImportStore.getState().error;
    return (
      <div className="space-y-4">
        <div className="rounded-md bg-destructive/10 p-4 text-center">
          <p className="text-sm text-destructive">{error}</p>
        </div>
        <Button variant="outline" onClick={handleReset} className="w-full">
          Try again
        </Button>
      </div>
    );
  }

  // Default: input view
  return (
    <div className="space-y-4">
      <ToggleGroup
        type="single"
        value={inputMode}
        onValueChange={(v) => v && setInputMode(v as InputMode)}
        className="justify-start"
      >
        <ToggleGroupItem value="file" aria-label="Upload file">
          <Upload className="mr-2 size-4" />
          File
        </ToggleGroupItem>
        <ToggleGroupItem value="text" aria-label="Paste text">
          <FileText className="mr-2 size-4" />
          Text
        </ToggleGroupItem>
      </ToggleGroup>

      {inputMode === "file" && (
        <div
          className="flex flex-col items-center justify-center rounded-md border-2 border-dashed p-8 transition-colors hover:border-primary/50"
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleFileDrop}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".opml,.xml,.html,.htm,.csv,.json"
            onChange={handleFileSelect}
            className="hidden"
          />
          {selectedFile ? (
            <div className="text-center">
              <p className="font-medium">{selectedFile.name}</p>
              <p className="text-sm text-muted-foreground">
                {(selectedFile.size / 1024).toFixed(1)} KB
              </p>
              <Button
                variant="ghost"
                size="sm"
                className="mt-2"
                onClick={() => fileInputRef.current?.click()}
              >
                Choose different file
              </Button>
            </div>
          ) : (
            <>
              <Upload className="mb-2 size-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Drag and drop an OPML, Pocket, or Omnivore export, or
              </p>
              <Button
                variant="link"
                className="p-0 h-auto"
                onClick={() => fileInputRef.current?.click()}
              >
                browse to select
              </Button>
              <p className="mt-2 text-xs text-muted-foreground/70">
                .opml, .xml, .html, .csv, .json
              </p>
            </>
          )}
        </div>
      )}

      {inputMode === "text" && (
        <Textarea
          placeholder="Paste OPML XML, Pocket HTML/CSV, Omnivore JSON, or feed URLs (one per line)"
          value={textInput}
          onChange={(e) => {
            setTextInput(e.target.value);
            setParseError(null);
          }}
          rows={8}
          className="font-mono text-sm"
        />
      )}

      {parseError && <p className="text-sm text-destructive">{parseError}</p>}

      <Button
        onClick={handleImport}
        disabled={inputMode === "file" ? !selectedFile : !textInput.trim()}
        className="w-full"
      >
        Import feeds
      </Button>
    </div>
  );
}

/**
 * Compose the `addFeed` options bag from a parsed entry. Returns
 * undefined when nothing OPML-specific is set so non-OPML imports keep
 * the lean call shape.
 */
function buildAddFeedOptions(
  entry: ImportEntry,
  titleOverride: string | undefined,
): Parameters<ReturnType<typeof useFeedStore.getState>["addFeed"]>[1] {
  const has =
    titleOverride ||
    entry.description ||
    (entry.tags && entry.tags.length > 0) ||
    entry.createdAt !== undefined;
  if (!has) return undefined;
  return {
    titleOverride: titleOverride || undefined,
    descriptionFallback: entry.description,
    tags: entry.tags,
    createdAtOverride: entry.createdAt,
  };
}
