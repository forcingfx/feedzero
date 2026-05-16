import { useState, useRef, useCallback } from "react";
import { Upload, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { parseOpmlFile } from "@/core/opml/opml-service";
import { parseUrlList, isOpmlFormat } from "@/core/opml/url-list-parser";
import {
  useImportStore,
  selectTotalCount,
  selectSuccessCount,
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

  const extractUrls = useCallback(
    async (content: string): Promise<string[]> => {
      // Detect format and parse accordingly
      if (isOpmlFormat(content)) {
        const result = parseOpmlFile(content);
        if (!result.ok) {
          throw new Error(result.error);
        }
        return result.value.map((entry) => entry.xmlUrl);
      } else {
        const result = parseUrlList(content);
        if (!result.ok) {
          throw new Error(result.error);
        }
        return result.value;
      }
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

      const urls = await extractUrls(content);
      if (urls.length === 0) {
        setParseError("No valid feed URLs found");
        return;
      }

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

      // Start import process
      startImport(urls);

      // Process each URL sequentially
      for (const url of urls) {
        const result = await addFeed(url);
        if (result.ok) {
          recordResult({ url, success: true });
        } else {
          recordResult({ url, success: false, error: result.error });
        }
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
    extractUrls,
    startImport,
    addFeed,
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
            accept=".opml,.xml"
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
                Drag and drop an OPML file, or
              </p>
              <Button
                variant="link"
                className="p-0 h-auto"
                onClick={() => fileInputRef.current?.click()}
              >
                browse to select
              </Button>
            </>
          )}
        </div>
      )}

      {inputMode === "text" && (
        <Textarea
          placeholder="Paste OPML XML or feed URLs (one per line)"
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
