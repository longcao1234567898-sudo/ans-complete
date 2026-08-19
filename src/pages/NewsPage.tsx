/**
 * Trang "Tin tức": lọc theo chủ đề + lưới bản tin.
 */
import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import type { NewsArticle, NewsTag } from '../types/news';
import { fetchNews } from '../services/newsService';
import NewsFilter from '../components/News/NewsFilter';
import NewsGrid from '../components/News/NewsGrid';
import PageBackground from '../components/common/PageBackground';

/* ============================================================================
   MỖI LẦN HIỆN 21 TIN: 1 tin nổi bật (ảnh lớn) + 20 tin thường.

   ⚠️ Chú thích cũ ghi "chia hết cho lưới 2 cột và 4 cột" — lưới thật ở
   NewsGrid là `sm:grid-cols-2 lg:grid-cols-3`, KHÔNG có mốc 4 cột nào. 20 tin
   chia 3 cột dư 2, nên hàng cuối trên màn hình rộng đứng lẻ 2 thẻ.

   Đó là chuyện thẩm mỹ nhỏ, không phải lỗi, nên giữ nguyên con số 21. Muốn
   hàng cuối luôn đầy ở CẢ 2 và 3 cột thì phần còn lại phải chia hết cho 6:
   đổi thành 19 (1 + 18) hoặc 25 (1 + 24).
   ============================================================================ */
const MOI_LAN = 21;

export default function NewsPage() {
  const [tag, setTag] = useState<NewsTag | 'all'>('all');
  const [soHien, setSoHien] = useState(MOI_LAN);

  /* --------------------------------------------------------------------------
     CHỈ TẢI ĐÚNG SỐ TIN ĐANG CẦN, CỘNG THÊM MỘT LƯỢT DỰ TRỮ

     ⚠️ Trước đây gọi fetchNews(tag) trần, không kèm limit. Máy chủ hiểu đó là
     "lấy tối đa" nên trả về tới 100 bài ngay từ lần mở trang đầu tiên. Hai hệ
     quả đều đi ngược ý định của nút "Xem thêm":
       1. Bà con dùng 3G tải trọn 100 bài rồi chỉ xem 21 — đúng thứ nút này
          sinh ra để tránh.
       2. Mục nào có hơn 100 bài thì bấm "Xem thêm" mãi cũng dừng ở 100, không
          báo gì cả, cứ như tin cũ biến mất.

     Lấy dư đúng MỘT lượt là vừa đủ: nút chỉ cần biết lượt kế tiếp còn bao
     nhiêu tin để ghi lên nhãn, không cần biết tổng kho có bao nhiêu.
     -------------------------------------------------------------------------- */
  const { data, isLoading } = useQuery({
    queryKey: ['news', tag, soHien],
    queryFn: () => fetchNews(tag, soHien + MOI_LAN),
    placeholderData: keepPreviousData,
  });

  /* ⚠️ LỌC TRÙNG TRƯỚC KHI CẮT.

     NewsGrid có bước lọc bài trùng tiêu đề, nhưng nó chạy SAU khi trang này đã
     cắt lấy 21 bài. Nên hai bài trùng lọt vào trong 21 thì lưới bỏ một, màn
     hình còn 20 — mà nhãn nút vẫn đếm theo danh sách chưa lọc. Lọc ở đây thì
     luôn hiện đủ 21 bài KHÁC NHAU và số trên nút mới khớp. */
  const tatCa = (() => {
    const list: NewsArticle[] = data ?? [];
    const theoTieuDe = new Map<string, NewsArticle>();
    for (const a of list) {
      const khoa = a.title.trim().toLowerCase();
      const cu = theoTieuDe.get(khoa);
      if (!cu || (!cu.thumbnail && a.thumbnail)) theoTieuDe.set(khoa, a);
    }
    return [...theoTieuDe.values()];
  })();

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
