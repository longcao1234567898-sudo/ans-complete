/**
 * Thẻ hiển thị 1 bản tin.
 *
 * CẢ THẺ đều bấm được -> mở bài viết gốc ở tab mới.
 * (Trước đây chỉ dòng chữ "Đọc tại..." mới bấm được — bà con thường bấm
 *  vào ảnh hoặc tiêu đề rồi tưởng web hỏng.)
 */
import { useState } from 'react';
import { ExternalLink } from 'lucide-react';
import type { NewsArticle } from '../../types/news';
import { NEWS_TAGS } from '../../utils/constants';
import { formatDate } from '../../utils/helpers';
import Badge from '../common/Badge';
import Card from '../common/Card';
import { Skeleton } from '../common/Loading';

export default function NewsCard({ article }: { article: NewsArticle }) {
  const [loaded, setLoaded] = useState(false);
  const tag = NEWS_TAGS[article.tag];

  return (
    <a
      href={article.externalUrl}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Đọc bài: ${article.title}`}
      className="group block h-full rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
    >
      <Card className="tilt-3d flex h-full flex-col overflow-hidden !p-0">
        <div className="relative aspect-[16/10] w-full overflow-hidden bg-slate-100 dark:bg-slate-800">
          {!loaded && <Skeleton className="absolute inset-0 rounded-none" />}
          <img
            src={article.thumbnail}
            alt={article.title}
            loading="lazy"
            decoding="async"
            onLoad={() => setLoaded(true)}
            className={`h-full w-full object-cover transition duration-500 group-hover:scale-105 ${
              loaded ? 'opacity-100' : 'opacity-0'
            }`}
          />
          <Badge colorClass={tag.colorClass} className="absolute left-3 top-3 shadow-sm">
            {tag.label}
          </Badge>
        </div>

        <div className="flex flex-1 flex-col p-4">
          <p className="mb-1.5 text-xs text-slate-400">{formatDate(article.publishedAt, false)}</p>

          <h3 className="mb-2 line-clamp-2 text-sm font-bold leading-snug text-slate-800 transition group-hover:text-primary-600 dark:text-slate-100 dark:group-hover:text-primary-400">
            {article.title}
          </h3>

          <p className="mb-4 line-clamp-3 flex-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
            {article.summary}
          </p>

          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary-600 transition group-hover:gap-2.5 dark:text-primary-400">
            Đọc tại {article.source} <ExternalLink className="h-3 w-3" />
          </span>
        </div>
      </Card>
    </a>
  );
}
