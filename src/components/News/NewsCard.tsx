/**
 * Thẻ hiển thị 1 bản tin: thumbnail lazy-load kèm skeleton, tag phân loại,
 * liên kết ra nguồn ngoài (vbpl.vn, luatvietnam.vn, ...).
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
    <Card hover className="flex flex-col overflow-hidden !p-0">
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-slate-100 dark:bg-slate-800">
        {!loaded && <Skeleton className="absolute inset-0 rounded-none" />}
        <img
          src={article.thumbnail}
          alt={article.title}
          loading="lazy"
          decoding="async"
          onLoad={() => setLoaded(true)}
          className={`h-full w-full object-cover transition-opacity duration-500 ${loaded ? 'opacity-100' : 'opacity-0'}`}
        />
        <Badge colorClass={tag.colorClass} className="absolute left-3 top-3 shadow-sm">
          {tag.label}
        </Badge>
      </div>

      <div className="flex flex-1 flex-col p-4">
        <p className="mb-1.5 text-xs text-slate-400">{formatDate(article.publishedAt, false)}</p>
        <h3 className="mb-2 line-clamp-2 text-sm font-bold leading-snug text-slate-800 dark:text-slate-100">
          {article.title}
        </h3>
        <p className="mb-4 line-clamp-3 flex-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
          {article.summary}
        </p>
        <a
          href={article.externalUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary-600 transition hover:text-primary-700 dark:text-primary-400"
        >
          Đọc tại {article.source} <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </Card>
  );
}
