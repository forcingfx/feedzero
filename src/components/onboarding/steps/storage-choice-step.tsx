import { Smartphone, Cloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useOnboardingStore } from "@/stores/onboarding-store";

export function StorageChoiceStep() {
  const chooseStorageMode = useOnboardingStore((s) => s.chooseStorageMode);

  return (
    <>
      <DialogHeader>
        <DialogTitle>Where should we store your data?</DialogTitle>
        <DialogDescription className="text-destructive">
          Your data lives in this browser. Clearing browser data or cookies will
          delete your feeds permanently.
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-3">
        <Button
          variant="outline"
          className="h-auto flex-col items-start gap-1 p-4"
          onClick={() => chooseStorageMode("local")}
        >
          <span className="flex items-center gap-2 font-medium">
            <Smartphone className="size-4" />
            Local only
          </span>
          <span className="text-xs text-muted-foreground">
            Quick start, single device
          </span>
        </Button>

        <Button
          variant="outline"
          className="h-auto flex-col items-start gap-1 p-4"
          onClick={() => chooseStorageMode("sync")}
        >
          <span className="flex items-center gap-2 font-medium">
            <Cloud className="size-4" />
            Set up sync
          </span>
          <span className="text-xs text-muted-foreground">
            Access from any device
          </span>
        </Button>
      </div>
    </>
  );
}
