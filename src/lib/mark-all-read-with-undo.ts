import { toast } from "sonner";
import { useArticleStore } from "@/stores/article-store.ts";

/**
 * Mark every visible unread article as read and show a toast with an
 * Undo action that restores exactly the articles the sweep touched.
 *
 * Undo instead of a confirmation dialog: the 99% case (an intentional
 * sweep) stays one tap, while a mistaken sweep remains recoverable.
 * Shared by the "Mark N read" pill and the command palette so both
 * entry points behave identically.
 */
export async function markAllReadWithUndo(): Promise<void> {
  const swept = await useArticleStore.getState().markAllAsRead();
  if (swept.length === 0) return;

  const sweptIds = swept.map((a) => a.id);
  toast(`Marked ${swept.length} read`, {
    action: {
      label: "Undo",
      onClick: () => {
        void useArticleStore.getState().markUnread(sweptIds);
      },
    },
  });
}
