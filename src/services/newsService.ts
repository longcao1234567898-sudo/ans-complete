/**
 * Dịch vụ tin tức & pháp luật.
 * Có backend → đọc từ bảng news (MySQL); không có → dùng mock.
 */
import type { NewsArticle, NewsTag } from '../types/news';
import { MOCK_NEWS } from '../utils/mockData';
import { delay } from '../utils/helpers';
import { apiFetch, hasBackend } from './api';

export async function fetchNews(tag?: NewsTag | 'all', limit?: number): Promise<NewsArticle[]> {
  if (hasBackend) {
    const params = new URLSearchParams();
    if (tag && tag !== 'all') params.set('tag', tag);
    if (typeof limit === 'number') params.set('limit', String(limit));
    const qs = params.toString();
    return apiFetch<NewsArticle[]>(`/api/news${qs ? '?' + qs : ''}`);
  }

  await delay(700);
  let list = [...MOCK_NEWS].sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  );
  if (tag && tag !== 'all') list = list.filter((n) => n.tag === tag);
  return typeof limit === 'number' ? list.slice(0, limit) : list;
}
