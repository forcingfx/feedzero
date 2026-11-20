/**
 * Signal's settings, in a dialog on the Signal page.
 *
 * They used to be a section of Settings → Reading. That tab had grown to
 * about 17 controls, and Signal's were the ones with no bearing on
 * reading, so they moved to the page they change.
 *
 * Open state is the `?settings=open` search param, not component state:
 * the legacy `/settings?tab=briefings` link can land on the open dialog,
 * the browser's back button closes it, and any control on the page can
 * open it without owning it.
 */
import { useSearchParams } from "react-router";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SignalSection } from "@/components/settings/signal-section";

const SETTINGS_PARAM = "settings";
const SETTINGS_OPEN = "open";

/** Whether Signal's settings are open, and a setter that keeps other params. */
export function useSignalSettingsOpen(): [boolean, (open: boolean) => void] {
  const [searchParams, setSearchParams] = useSearchParams();
  const isOpen = searchParams.get(SETTINGS_PARAM) === SETTINGS_OPEN;

  function setOpen(open: boolean) {
    const next = new URLSearchParams(searchParams);
    if (open) next.set(SETTINGS_PARAM, SETTINGS_OPEN);
    else next.delete(SETTINGS_PARAM);
    setSearchParams(next);
  }

  return [isOpen, setOpen];
}

/** Mounted once by the Signal page; opened through `useSignalSettingsOpen`. */
export function SignalSettingsDialog() {
  const [isOpen, setOpen] = useSignalSettingsOpen();
  return (
    <Dialog open={isOpen} onOpenChange={setOpen}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Signal settings</DialogTitle>
          <DialogDescription>
            Cross-feed intelligence: the local frequency engine, an optional AI overview, and saved
            briefings.
          </DialogDescription>
        </DialogHeader>
        <SignalSection />
      </DialogContent>
    </Dialog>
  );
}
