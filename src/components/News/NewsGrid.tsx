/**
 * Lưới hiển thị danh sách bản tin (3 cột trên desktop) với trạng thái loading skeleton.
 */
import type { NewsArticle } from '../../types/news';
import NewsCard from './NewsCard';

interface NewsGridProps {
  articles: NewsArticle[];
  isLoading?: boolean;
}

export default function NewsGrid({ articles, isLoading }: NewsGridProps) {
  if (isLoading) {
    // 1 animation pulse duy nhất trên lưới cha — nhẹ hơn hẳn 24 animation riêng lẻ
    return (
      <div className="grid animate-pulse gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="overflow-hidden rounded-2xl border border-slate-100 dark:border-slate-800">
            <div className="aspect-[16/10] w-full bg-slate-200 dark:bg-slate-700/60" />
            <div className="space-y-2 p-4">
              <div className="h-3 w-1/3 rounded bg-slate-200 dark:bg-slate-700/60" />
              <div className="h-4 w-full rounded bg-slate-200 dark:bg-slate-700/60" />
              <div className="h-4 w-2/3 rounded bg-slate-200 dark:bg-slate-700/60" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (articles.length === 0) {
    return (
      <p className="py-16 text-center text-sm text-slate-400">Chưa có bản tin nào thuộc chủ đề này.</p>
    );
  }

  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {articles.map((a) => (
        <NewsCard key={a.id} article={a} />
      ))}
    </div>
  );
}
