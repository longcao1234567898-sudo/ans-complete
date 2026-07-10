/**
 * Trang "Tin tức": lọc theo chủ đề + lưới bản tin.
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { NewsTag } from '../types/news';
import { fetchNews } from '../services/newsService';
import NewsFilter from '../components/News/NewsFilter';
import NewsGrid from '../components/News/NewsGrid';
import PageBackground from '../components/common/PageBackground';

export default function NewsPage() {
  const [tag, setTag] = useState<NewsTag | 'all'>('all');

  const { data, isLoading } = useQuery({
    queryKey: ['news', tag],
    queryFn: () => fetchNews(tag),
  });

  return (
    <>
      <PageBackground video="bg-ho-tinh-tam.mp4" />
      <div className="container-page py-10 sm:py-14">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-extrabold text-slate-800 dark:text-slate-100 sm:text-3xl">Tin tức &amp; Pháp luật</h1>
        <p className="mx-auto mt-1.5 max-w-lg text-sm text-slate-500 dark:text-slate-400">
          Cập nhật tình hình an ninh trật tự, cảnh giác lừa đảo, hướng dẫn thủ tục và văn bản pháp luật mới.
        </p>
      </div>

      <div className="mb-6 flex justify-center">
        <NewsFilter value={tag} onChange={setTag} />
      </div>

      <NewsGrid articles={data ?? []} isLoading={isLoading} />
    </div>
    </>
  );
}
