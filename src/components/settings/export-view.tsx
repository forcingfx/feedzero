import { useState, useCallback } from "react";
import { Download, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useFeedStore } from "@/stores/feed-store";
import { generateOpmlFile, generateUrlList } from "@/core/opml/opml-service";
import { toast } from "sonner";

export function ExportView() {
  const feeds = useFeedStore((s) => s.feeds);
  const folders = useFeedStore((s) => s.folders);
  const [copied, setCopied] = useState(false);

  const urlList = generateUrlList(feeds);

  const handleDownloadOpml = useCallback(() => {
    // Pass folders so the exported OPML preserves the user's organization
    // (PR E round-trip fidelity). Older readers ignore the nested <outline>
    // wrappers and read the inner feed entries flat.
    const opml = generateOpmlFile(feeds, folders);
    const blob = new Blob([opml], { type: "application/xml" });
    const url = URL.createObjectURL(blob);

    const date = new Date().toISOString().split("T")[0];
    const filename = `feedzero-${date}.opml`;

    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast("OPML file downloaded");
  }, [feeds, folders]);

  const handleCopyUrls = useCallback(async () => {
    await navigator.clipboard.writeText(urlList);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast("URLs copied to clipboard");
  }, [urlList]);

  if (feeds.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground">No feeds to export</p>
        <p className="text-sm text-muted-foreground mt-1">
          Add some feeds first, then come back here to export them.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-muted-foreground mb-2">
          {feeds.length} feed{feeds.length !== 1 ? "s" : ""} to export
        </p>
      </div>

      <Button
        variant="outline"
        onClick={handleDownloadOpml}
        className="w-full"
      >
        <Download className="mr-2 size-4" />
        Download OPML
      </Button>

      <div className="relative">
        <Textarea
          value={urlList}
          readOnly
          rows={6}
          className="font-mono text-sm resize-none"
        />
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-2 right-2 size-7"
          onClick={handleCopyUrls}
          title="Copy to clipboard"
        >
          {copied ? (
            <Check className="size-3.5" />
          ) : (
            <Copy className="size-3.5" />
          )}
        </Button>
      </div>

      <p className="text-xs text-muted-foreground text-center">
        OPML is compatible with most feed readers. The URL list can be pasted
        into any text file.
      </p>
    </div>
  );
}
