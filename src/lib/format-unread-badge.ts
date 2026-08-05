/**
 * Render an unread count for a sidebar badge. Caps at "99+" so a
 * runaway feed can't stretch the badge — the cap is a display policy
 * shared by feed rows and folder aggregates alike.
 */
export function formatUnreadBadge(count: number): string {
  return count > 99 ? "99+" : String(count);
}
