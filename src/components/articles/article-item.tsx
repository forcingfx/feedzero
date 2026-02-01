import type { Article } from "@/types/index.ts";

interface ArticleItemProps {
  article: Article;
  isSelected: boolean;
  onSelect: (article: Article) => void;
}

function formatDate(timestamp: number): string {
  if (!timestamp) return "";
  const d = new Date(timestamp);
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ArticleItem({
  article,
  isSelected,
  onSelect,
}: ArticleItemProps) {
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect(article);
    }
  }

  return (
    <li
      role="option"
      tabIndex={0}
      aria-selected={isSelected}
      data-id={article.id}
      onClick={() => onSelect(article)}
      onKeyDown={handleKeyDown}
      className="px-sm py-sm border-b border-border cursor-pointer hover:bg-accent aria-selected:bg-accent"
    >
      <div className={article.read ? "text-muted-foreground" : "font-semibold"}>
        {article.title}
      </div>
      <div className="text-xs text-muted-foreground mt-xs">
        {article.author && <>{article.author} &bull; </>}
        {formatDate(article.publishedAt)}
      </div>
    </li>
  );
}
