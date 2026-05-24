import { useLocation, useNavigate } from "react-router";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useBriefingStore } from "@/stores/briefing-store";

/**
 * Sub-navigation strip at the top of /signal and /signal/briefings.
 *
 * Briefings used to be a top-level sidebar entry; we folded it under
 * Signal so the sidebar stays compact and the two AI/cross-feed
 * surfaces sit together. Both routes render this strip so the
 * sub-tab is reachable from either.
 *
 * Active-tab detection is path-prefix based (everything under
 * /signal/briefings is the "briefings" tab) so deep links to a
 * specific briefing keep the right sub-tab highlighted.
 */
export type SignalTab = "topics" | "briefings";

interface Props {
  active: SignalTab;
}

export function SignalTabs({ active }: Props) {
  const navigate = useNavigate();
  const location = useLocation();
  const briefings = useBriefingStore((s) => s.briefings);
  const staleCount = briefings.reduce(
    (n, b) => n + (b.staleArticleCount > 0 ? 1 : 0),
    0,
  );

  function handleChange(value: string) {
    if (!value) return;
    if (value === "topics" && !location.pathname.startsWith("/signal/briefings")) {
      // Already on /signal or some other /signal/* — only navigate if
      // we're moving out of the briefings subtree.
      navigate("/signal");
      return;
    }
    if (value === "topics") {
      navigate("/signal");
      return;
    }
    if (value === "briefings") {
      navigate("/signal/briefings");
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-6 pt-4">
      <ToggleGroup
        type="single"
        value={active}
        onValueChange={handleChange}
        className="justify-start"
      >
        <ToggleGroupItem value="topics" aria-label="Topics">
          Topics
        </ToggleGroupItem>
        <ToggleGroupItem
          value="briefings"
          aria-label="Briefings"
          className="relative"
        >
          Briefings
          {staleCount > 0 && (
            <span
              aria-label={`${staleCount} briefing(s) have new matching articles`}
              className="ml-1.5 size-1.5 rounded-full bg-amber-500"
            />
          )}
        </ToggleGroupItem>
      </ToggleGroup>
    </div>
  );
}
