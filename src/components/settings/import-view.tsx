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
} from "@/stores/import-store";
import { useFeedStore } from "@/stores/feed-store";
import { useLicenseStore } from "@/stores/license-store";
import { isSelfHosted } from "@/core/features/self-hosted";
import { isPaidTierActive } from "@/core/features/paid-tier-active";
import { checkFeedQuota, quotaErrorMessage } from "@/core/features/quotas";
import { ImportProgress } from "./import-progress";
import { ImportResults } from "./import-results";

type InputMode = "file" | "text";

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
   * Parse the import content into rich entries that carry folder context.
   * Shutdown-migration formats (Pocket HTML, Pocket CSV, Omnivore JSON)
   * have folderName=undefined; OPML imports carry the parent group name
   * when one exists (PR E).
   *
   * Specific-format detection runs before the URL-list fallback because
   * each format would otherwise be misread as a URL list and silently
   * produce garbage.
   */
  const extractEntries = useCallback(
    async (
      content: string,
    ): Promise<Array<{ xmlUrl: string; folderName?: string }>> => {
      if (isPocketCsvExport(content)) {
        const result = parsePocketCsvExport(content);
        if (!result.ok) throw new Error(result.error);
        return result.value.map((url) => ({ xmlUrl: url }));
      }
      if (isOmnivoreExport(content)) {
        const result = parseOmnivoreExport(content);
        if (!result.ok) throw new Error(result.error);
        return result.value.map((url) => ({ xmlUrl: url }));
      }
      if (isPocketExport(content)) {
        const result = parsePocketExport(content);
        if (!result.ok) throw new Error(result.error);
        // addFeedFlow runs origins through discoverFeed, so an origin like
        // https://nytimes.com becomes a subscription to the site's RSS.
        return result.value.map((url) => ({ xmlUrl: url }));
      }
      if (isOpmlFormat(content)) {
        const result = parseOpmlFile(content);
        if (!result.ok) throw new Error(result.error);
        return result.value.map((entry) => ({
          xmlUrl: entry.xmlUrl,
          folderName: entry.folderName,
        }));
      }
      const result = parseUrlList(content);
      if (!result.ok) throw new Error(result.error);
      return result.value.map((url) => ({ xmlUrl: url }));
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

      const entries = await extractEntries(content);
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

      // Pre-create one folder per unique folderName so per-feed assignment
      // afterward is a cheap lookup, and we don't pay createFolder cost on
      // every loop iteration. PR E.
      const folderNames = Array.from(
        new Set(
          entries
            .map((e) => e.folderName)
            .filter((n): n is string => typeof n === "string" && n.length > 0),
        ),
      );
      for (const name of folderNames) {
        await createFolder(name);
      }
      const folderIdByName = new Map<string, string>();
      for (const f of useFeedStore.getState().folders ?? []) {
        if (folderNames.includes(f.name)) folderIdByName.set(f.name, f.id);
      }

      // Best-effort folder placement for a just-added feed (real or
      // placeholder). A missing folder or feed lookup leaves the
      // subscription unfiled, which is the safe fallback.
      const placeFeedIntoFolder = async (entry: {
        xmlUrl: string;
        folderName?: string;
      }) => {
        if (!entry.folderName) return;
        const folderId = folderIdByName.get(entry.folderName);
        const addedFeed = useFeedStore
          .getState()
          .feeds.find((f) => f.url === entry.xmlUrl);
        if (folderId && addedFeed) {
          await moveFeedToFolder(addedFeed.id, folderId);
        }
      };

      // Start import process
      startImport(urls);

      // Process each entry sequentially. Three outcomes per URL:
      //   * ok            → fully imported; move to folder, record success
      //   * fetch-failure → persist as placeholder so refresh can retry;
      //                     same folder placement, recorded as placeholder
      //   * other err     → permanent (parse / discovery / duplicate /
      //                     quota); record failure, no row created
      for (const entry of entries) {
        const result = await addFeed(entry.xmlUrl);

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
    extractEntries,
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
