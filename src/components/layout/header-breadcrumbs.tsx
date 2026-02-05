import { useNavigate } from "react-router";
import { decodeEntities } from "@/lib/decode-entities.ts";
import { useFeedStore } from "@/stores/feed-store.ts";
import { useArticleStore } from "@/stores/article-store.ts";
import { FeedFavicon } from "@/components/feeds/feed-favicon.tsx";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb.tsx";

interface HeaderBreadcrumbsProps {
  fallback?: string;
}

/** Breadcrumb trail showing current feed and article in the header. */
export function HeaderBreadcrumbs({ fallback }: HeaderBreadcrumbsProps) {
  const feeds = useFeedStore((s) => s.feeds);
  const selectedFeedId = useFeedStore((s) => s.selectedFeedId);
  const selectedArticle = useArticleStore((s) => s.selectedArticle);
  const navigate = useNavigate();

  const feed = feeds.find((f) => f.id === selectedFeedId);
  if (!feed) {
    return fallback ? (
      <span className="text-sm font-medium truncate">{fallback}</span>
    ) : null;
  }

  return (
    <Breadcrumb className="min-w-0 flex-1">
      <BreadcrumbList className="flex-nowrap">
        <BreadcrumbItem className="shrink-0">
          <BreadcrumbLink
            onClick={() => navigate(`/feeds/${feed.id}`)}
            className="flex items-center gap-1.5 cursor-pointer"
          >
            <FeedFavicon siteUrl={feed.siteUrl} className="size-4 shrink-0" />
            <span className="truncate">{feed.title}</span>
          </BreadcrumbLink>
        </BreadcrumbItem>
        {selectedArticle && (
          <>
            <BreadcrumbSeparator />
            <BreadcrumbItem className="min-w-0">
              <BreadcrumbPage className="truncate">
                {decodeEntities(selectedArticle.title)}
              </BreadcrumbPage>
            </BreadcrumbItem>
          </>
        )}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
