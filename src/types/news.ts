/**
 * Kiểu dữ liệu cho mục Tin tức & Pháp luật.
 */

/** Phân loại bản tin */
export type NewsTag = 'an_ninh' | 'canh_giac' | 'thu_tuc' | 'van_ban';

export interface NewsArticle {
  id: string;
  title: string;
  summary: string;
  thumbnail: string;
  publishedAt: string; // ISO string
  tag: NewsTag;
  /** Link ngoài đến trang thông tin pháp luật (vbpl.vn, luatvietnam.vn, ...) */
  externalUrl: string;
  source: string;
}
