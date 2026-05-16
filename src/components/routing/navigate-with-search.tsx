/**
 * <NavigateWithSearch> — like react-router's <Navigate> but preserves the
 * query string.
 *
 * The vanilla <Navigate to="/feeds"> drops the search string because `to`
 * is a pathname-only target. This bit the production deeplink flow:
 * `https://my.feedzero.app/?subscribe=personal-monthly` matched the
 * catchall `path="*"` route, which redirected to `/feeds` and silently
 * dropped `?subscribe=...`. SubscribeDeeplink then ran at the next route
 * with no params, so no Stripe Checkout session ever fired from the
 * deeplink path.
 *
 * Use this anywhere the redirect should carry the user's intent forward
 * — deeplinks, share links, bookmarked URLs with state in the query.
 */
import { Navigate, useLocation } from "react-router";

interface NavigateWithSearchProps {
  to: string;
  replace?: boolean;
}

export function NavigateWithSearch({ to, replace = true }: NavigateWithSearchProps) {
  const { search } = useLocation();
  return <Navigate to={{ pathname: to, search }} replace={replace} />;
}
