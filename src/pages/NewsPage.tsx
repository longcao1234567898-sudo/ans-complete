/**
 * Trang "Tin tức": lọc theo chủ đề + lưới bản tin.
 */
import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import type { NewsTag } from '../types/news';
import { fetchNews } from '../services/newsService';
import NewsFilter from '../components/News/NewsFilter';
import NewsGrid from '../components/News/NewsGrid';
import PageBackground from '../components/common/PageBackground';

/* Mỗi lần hiện tối đa 21 tin: 1 tin nổi bật + 20 tin thường, chia hết cho
   lưới 2 cột (máy tính bảng) và 4 cột (máy tính) nên không lẻ hàng cuối. */
const MOI_LAN = 21;

export default function NewsPage() {
  const [tag, setTag] = useState<NewsTag | 'all'>('all');
  const [soHien, setSoHien] = useState(MOI_LAN);

  const { data, isLoading } = useQuery({
    queryKey: ['news', tag],
    queryFn: () => fetchNews(tag),
  });

  const tatCa = data ?? [];
  const dangHien = tatCa.slice(0, soHien);
  const conLai = tatCa.length - dangHien.length;

  /* Đổi chủ đề thì đếm lại từ đầu — không thì bà con bấm "Xem thêm" ở mục này
     rồi sang mục khác lại thấy hiện sẵn cả trăm tin, khác hẳn mong đợi. */
  function doiChuDe(t: NewsTag | 'all') {
    setTag(t);
    setSoHien(MOI_LAN);
  }

  return (
    <>
      <PageBackground anh="bg-ho-tinh-tam.webp" />
      <div className="container-page py-10 sm:py-14">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-extrabold text-slate-800 dark:text-slate-100 sm:text-3xl">Tin tức &amp; Pháp luật</h1>
        <p className="mx-auto mt-1.5 max-w-lg text-sm text-slate-500 dark:text-slate-400">
          Cập nhật tình hình an ninh trật tự, cảnh giác lừa đảo, hướng dẫn thủ tục và văn bản pháp luật mới.
        </p>
      </div>

      <div className="mb-6 flex justify-center">
        <NewsFilter value={tag} onChange={doiChuDe} />
      </div>

      <NewsGrid articles={dangHien} isLoading={isLoading} />

      {/* ==================================================================
          NÚT XEM THÊM — góc dưới bên phải

          Vì sao giới hạn: mục "Tin an ninh" có thể có hàng trăm bài. Đổ hết
          ra một lần thì trang nặng, bà con dùng 3G chờ lâu, mà lướt mãi
          không tới đáy cũng nản.

          Đặt bên PHẢI vì đó là hướng mắt đi tới sau khi đọc xong danh sách,
          và cũng là chỗ ngón cái chạm dễ nhất khi cầm điện thoại một tay.

          Hiện rõ CÒN BAO NHIÊU tin để bà con biết có đáng bấm không.
          ================================================================== */}
      {conLai > 0 && (
        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={() => setSoHien((n) => n + MOI_LAN)}
            className="inline-flex items-center gap-2 rounded-xl border-2 border-primary-600 bg-white px-5 py-2.5 text-sm font-bold text-primary-700 shadow-soft transition hover:bg-primary-50 dark:border-primary-500 dark:bg-slate-900 dark:text-primary-300 dark:hover:bg-primary-900/25"
          >
            Xem thêm {Math.min(conLai, MOI_LAN)} tin
            <ChevronDown className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Đã xem hết thì nói rõ, không để bà con tưởng còn nữa mà chờ */}
      {!isLoading && conLai === 0 && tatCa.length > MOI_LAN && (
        <p className="mt-6 text-center text-xs text-slate-500 dark:text-slate-400">
          Đã hiển thị toàn bộ {tatCa.length} bản tin.
        </p>
      )}
    </div>
    </>
  );
}
