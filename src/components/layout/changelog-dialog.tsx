import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog.tsx";

export const APP_VERSION = "0.2.0";

interface ReleaseNote {
  version: string;
  date: string;
  title: string;
  items: string[];
}

const CHANGELOG: ReleaseNote[] = [
  {
    version: "0.2.0",
    date: "2026-03-25",
    title: "Explore & Discover",
    items: [
      "New Explore tab with 1,300+ feeds across 10 topic sections and 154 countries",
      "Search feeds by name or category — scoped to current view or search everywhere",
      "Preview any feed's articles before adding",
      "Add and remove feeds directly from the catalog",
      "Keyboard shortcuts: / to search, 1/2/3 for tabs, J/K/U/I for navigation",
      "Settings menu in sidebar footer with cloud sync toggle",
      "Local storage warning for users without cloud sync",
      "Removed onboarding flow — app starts instantly",
    ],
  },
  {
    version: "0.1.0",
    date: "2026-03-24",
    title: "Initial Alpha",
    items: [
      "Add and read RSS, Atom, and JSON Feed sources",
      "End-to-end encryption with zero-knowledge cloud sync",
      "Full-text article extraction",
      "Keyboard-driven navigation",
      "Dark mode support",
    ],
  },
];

const STORAGE_KEY = "feedzero:last-seen-version";

/** Returns true if the user hasn't seen the current version's changelog. */
export function shouldShowChangelog(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== APP_VERSION;
  } catch {
    return false;
  }
}

/** Marks the current version's changelog as seen. */
export function markChangelogSeen(): void {
  try {
    localStorage.setItem(STORAGE_KEY, APP_VERSION);
  } catch {
    // localStorage unavailable
  }
}

interface ChangelogDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ChangelogDialog({ open, onOpenChange }: ChangelogDialogProps) {
  function handleOpenChange(value: boolean) {
    if (!value) markChangelogSeen();
    onOpenChange(value);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>What&apos;s new</DialogTitle>
          <DialogDescription>
            Release notes for FeedZero
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-6 mt-2">
          {CHANGELOG.map((release) => (
            <div key={release.version}>
              <div className="flex items-baseline gap-2 mb-2">
                <span className="font-semibold text-sm">
                  v{release.version}
                </span>
                <span className="text-xs text-muted-foreground">
                  {release.title}
                </span>
                <span className="text-xs text-muted-foreground ml-auto">
                  {release.date}
                </span>
              </div>
              <ul className="space-y-1 text-sm text-muted-foreground">
                {release.items.map((item, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-muted-foreground/50 shrink-0">-</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
