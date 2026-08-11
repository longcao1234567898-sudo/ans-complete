/**
 * LƯỚI BẢN TIN
 * ============================================================================
 *
 * BỐ CỤC KHÁC NHAU THEO MÀN HÌNH:
 *
 *   ĐIỆN THOẠI          MÁY TÍNH
 *   ┌──────────────┐    ┌────────────────────────────┐
 *   │  TIN NỔI BẬT │    │        TIN NỔI BẬT         │
 *   │   (ảnh lớn)  │    │         (ảnh lớn)          │
 *   ├──────────────┤    ├────────┬────────┬──────────┤
 *   │▣ tin gọn     │    │  thẻ   │  thẻ   │   thẻ    │
 *   │▣ tin gọn     │    │  dọc   │  dọc   │   dọc    │
 *   │▣ tin gọn     │    ├────────┼────────┼──────────┤
 *   │▣ tin gọn     │    │  thẻ   │  thẻ   │   thẻ    │
 *   │▣ tin gọn     │    └────────┴────────┴──────────┘
 *   │▣ tin gọn     │
 *   └──────────────┘
 *
 * VÌ SAO TÁCH HAI KIỂU:
 * Thẻ dọc cao khoảng 300px — màn hình điện thoại chỉ chứa 2 tin, muốn xem 10
 * tin phải lướt 5 lần. Thẻ ngang gọn cao khoảng 96px, cùng màn hình đó chứa
 * 6-7 tin. Bà con lướt ít hơn hẳn.
 *
 * Máy tính thì ngược lại: màn hình rộng, thẻ dọc 3 cột tận dụng được chiều
 * ngang và ảnh lớn dễ nhìn. Ép thẻ ngang lên máy tính chỉ tổ thừa chỗ trống.
 *
 * CÁCH LÀM: vẽ CẢ HAI, dùng lớp ẩn/hiện của CSS để chọn. Tốn thêm chút mã HTML
 * nhưng đổi bố cục ngay khi xoay ngang máy, không phải chờ tính lại kích thước
 * màn hình rồi vẽ lại — cách đó gây nháy.
 */
import type { NewsArticle } from '../../types/news';
import NewsCard from './NewsCard';

interface NewsGridProps {
  articles: NewsArticle[];
  isLoading?: boolean;
  /** Có tách bài đầu tiên ra làm tin nổi bật không. Mặc định: có */
  coTinNoiBat?: boolean;
}

/** Khung xương lúc đang tải — một hiệu ứng chung, nhẹ hơn nhiều hiệu ứng rời */
function KhungXuong() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="aspect-[16/10] w-full rounded-2xl bg-slate-200 dark:bg-slate-700/60 sm:aspect-[21/9]" />

      {/* Điện thoại: khung xương thẻ ngang */}
      <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-100 px-2 dark:divide-slate-800 dark:border-slate-800 sm:hidden">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="flex gap-2.5 py-2">
            <div className="h-[76px] w-[76px] shrink-0 rounded-lg bg-slate-200 dark:bg-slate-700/60" />
            <div className="flex-1 space-y-2 py-1 pr-1">
              <div className="h-2.5 w-1/3 rounded bg-slate-200 dark:bg-slate-700/60" />
              <div className="h-3 w-full rounded bg-slate-200 dark:bg-slate-700/60" />
              <div className="h-3 w-4/5 rounded bg-slate-200 dark:bg-slate-700/60" />
            </div>
          </div>
        ))}
      </div>

      {/* Máy tính: khung xương thẻ dọc */}
      <div className="hidden gap-6 sm:grid sm:grid-cols-2 lg:grid-cols-3">
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
    </div>
  );
}

export default function NewsGrid({ articles, isLoading, coTinNoiBat = true }: NewsGridProps) {
  if (isLoading) return <KhungXuong />;

  if (articles.length === 0) {
    return (
      <p className="py-16 text-center text-sm text-slate-400">
        Chưa có bản tin nào thuộc chủ đề này.
      </p>
    );
  }

  /* Chỉ tách tin nổi bật khi có từ 2 bài trở lên — một bài mà tách ra thì
     phần danh sách bên dưới trống trơn, nhìn như thiếu nội dung. */
  const tachNoiBat = coTinNoiBat && articles.length >= 2;
  const noiBat = tachNoiBat ? articles[0] : null;
  const conLai = tachNoiBat ? articles.slice(1) : articles;

  return (
    <div className="space-y-5">
      {noiBat && <NewsCard article={noiBat} kieu="noi-bat" />}

      {/* ==================================================================
          ĐIỆN THOẠI — DANH SÁCH LIỀN, NGĂN BẰNG ĐƯỜNG KẺ

          Trước là các thẻ rời, mỗi thẻ có viền và bóng đổ riêng. Cách đó tốn
          chỗ (viền + bóng + khoảng cách 12px) mà nhìn cũng rời rạc.

          Nay gom vào MỘT khối, ngăn nhau bằng đường kẻ mảnh. Vừa tiết kiệm
          chiều cao, vừa đọc ra ngay đây là một danh sách tin — giống cách các
          báo điện tử trình bày trên điện thoại.
          ================================================================== */}
      <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-100 bg-white px-2 shadow-soft dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900 sm:hidden">
        {conLai.map((a) => (
          <NewsCard key={a.id} article={a} kieu="gon" />
        ))}
      </div>

      {/* MÁY TÍNH — lưới thẻ dọc */}
      <div className="hidden gap-6 sm:grid sm:grid-cols-2 lg:grid-cols-3">
        {conLai.map((a) => (
          <NewsCard key={a.id} article={a} kieu="thuong" />
        ))}
      </div>
    </div>
  );
}
