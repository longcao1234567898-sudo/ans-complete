/**
 * Thanh lọc tin tức theo tag: Tất cả + 4 nhóm.
 */
import type { NewsTag } from '../../types/news';
import { NEWS_TAGS } from '../../utils/constants';
import { cn } from '../../utils/helpers';

interface NewsFilterProps {
  value: NewsTag | 'all';
  onChange: (tag: NewsTag | 'all') => void;
}

export default function NewsFilter({ value, onChange }: NewsFilterProps) {
  const tags: Array<{ id: NewsTag | 'all'; label: string }> = [
    { id: 'all', label: 'Tất cả' },
    ...(Object.keys(NEWS_TAGS) as NewsTag[]).map((id) => ({ id, label: NEWS_TAGS[id].label })),
  ];

  return (
    <div className="flex flex-wrap gap-2" role="tablist" aria-label="Lọc tin tức theo chủ đề">
      {tags.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
          className={cn(
            'rounded-full border px-3.5 py-1.5 text-xs font-semibold transition',
            value === t.id
              ? 'border-primary-600 bg-primary-600 text-white shadow-soft'
              : 'border-slate-200 bg-white text-slate-600 hover:border-primary-300 hover:text-primary-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
