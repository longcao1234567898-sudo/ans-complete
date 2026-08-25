/**
 * Trang "Tin tức": lọc theo chủ đề + lưới bản tin.
 */
import { useState } from 'react';
import { ChevronDown, TrendingUp } from 'lucide-react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import type { NewsArticle, NewsTag } from '../types/news';
import { fetchNews } from '../services/newsService';
import NewsFilter from '../components/News/NewsFilter';
import NewsGrid from '../components/News/NewsGrid';
import NgheTinMoi from '../components/News/NgheTinMoi';
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
  /* Lọc theo mốc thời gian, song song với lọc chủ đề. Giúp bà con nhanh thấy
     tin mới nhất — nhất là tin cảnh giác lừa đảo cần biết ngay trong ngày. */
  const [khoangTG, setKhoangTG] = useState<'all' | 'today' | 'week'>('all');

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

  /* Lọc theo mốc thời gian trên danh sách đã gộp trùng.
     Hôm nay = từ 0h hôm nay. Trong tuần = 7 ngày gần nhất. */
  const tatCaTheoTG = (() => {
    if (khoangTG === 'all') return tatCa;
    const bayGio = new Date();
    let moc: number;
    if (khoangTG === 'today') {
      const dauNgay = new Date(bayGio.getFullYear(), bayGio.getMonth(), bayGio.getDate());
      moc = dauNgay.getTime();
    } else {
      moc = bayGio.getTime() - 7 * 24 * 60 * 60 * 1000;
    }
    return tatCa.filter((a) => {
      const t = new Date(a.publishedAt).getTime();
      return !Number.isNaN(t) && t >= moc;
    });
  })();

  const dangHien = tatCaTheoTG.slice(0, soHien);
  const conLai = tatCaTheoTG.length - dangHien.length;

  /* Đổi chủ đề thì đếm lại từ đầu — không thì bà con bấm "Xem thêm" ở mục này
     rồi sang mục khác lại thấy hiện sẵn cả trăm tin, khác hẳn mong đợi. */
  function doiChuDe(t: NewsTag | 'all') {
    setTag(t);
    setSoHien(MOI_LAN);
  }

  /* Đổi mốc thời gian cũng đếm lại từ đầu, như đổi chủ đề. */
  function doiThoiGian(k: 'all' | 'today' | 'week') {
    setKhoangTG(k);
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

      <div className="mb-6 flex flex-col items-center gap-3">
        <NewsFilter value={tag} onChange={doiChuDe} />

        {/* LỌC THEO THỜI GIAN — cho bà con nhanh thấy tin mới nhất. Đặt cạnh lọc
            chủ đề. Nút "Hôm nay" và "Trong tuần" hiện số tin để biết có tin mới
            không mà không phải bấm vào. */}
        <div className="flex flex-wrap items-center justify-center gap-2">
          {([
            ['all', 'Tất cả', tatCa.length],
            ['today', 'Hôm nay', tatCa.filter((a) => {
              const d = new Date(a.publishedAt); const n = new Date();
              return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
            }).length],
            ['week', 'Trong tuần', tatCa.filter((a) => {
              const t = new Date(a.publishedAt).getTime();
              return !Number.isNaN(t) && t >= Date.now() - 7 * 864e5;
            }).length],
          ] as const).map(([giaTri, ten, so]) => (
            <button
              key={giaTri}
              type="button"
              onClick={() => doiThoiGian(giaTri)}
              className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-bold transition ${
                khoangTG === giaTri
                  ? 'bg-primary-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
              }`}
            >
              {ten}
              <span className={`rounded-full px-1.5 text-xs ${
                khoangTG === giaTri ? 'bg-white/25' : 'bg-slate-200 dark:bg-slate-700'
              }`}>{so}</span>
            </button>
          ))}
        </div>

        {/* Nút NGHE TOÀN BỘ TIN — cho người mắt kém, người không quen đọc chữ.
            Đọc lần lượt tiêu đề các tin đang hiện. Đặt ngay dưới bộ lọc để bà
            con thấy ngay khi vào trang, không phải cuộn tìm. */}
        <NgheTinMoi tieuDe={dangHien.map((a) => a.title)} />
      </div>

      {/* ==================================================================
          BÀ CON ĐANG QUAN TÂM — ba tin nhiều lượt xem nhất.

          Vì sao có: tin nhiều người đọc thì càng nhiều người đọc — hiệu ứng lan
          truyền có lợi cho tuyên truyền. Chỉ hiện khi có tin đạt từ 5 lượt trở
          lên, để lúc mới chạy chưa ai xem thì không hiện khu trống vô nghĩa.
          ================================================================== */}
      {!isLoading && khoangTG === 'all' && tag === 'all' && (() => {
        const nhieuNguoiXem = [...tatCa]
          .filter((a) => (a.viewCount ?? 0) >= 5)
          .sort((x, y) => (y.viewCount ?? 0) - (x.viewCount ?? 0))
          .slice(0, 3);
        if (nhieuNguoiXem.length === 0) return null;
        return (
          <div className="mb-8 rounded-2xl border border-amber-200 bg-amber-50/60 p-4 dark:border-amber-900/40 dark:bg-amber-900/10">
            <p className="mb-3 flex items-center gap-1.5 text-sm font-extrabold text-amber-800 dark:text-amber-300">
              <TrendingUp className="h-4 w-4" /> Bà con đang quan tâm
            </p>
            <div className="grid gap-2 sm:grid-cols-3">
              {nhieuNguoiXem.map((a) => (
                <a
                  key={a.id}
                  href={a.externalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-xl bg-white p-3 text-sm font-semibold text-slate-700 transition hover:shadow-soft dark:bg-slate-900 dark:text-slate-200"
                >
                  <span className="line-clamp-2">{a.title}</span>
                  <span className="mt-1 block text-xs font-normal text-slate-400">
                    {a.viewCount} lượt xem
                  </span>
                </a>
              ))}
            </div>
          </div>
        );
      })()}

      {!isLoading && khoangTG !== 'all' && dangHien.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-900">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {khoangTG === 'today'
              ? 'Hôm nay chưa có tin mới. Bà con xem "Trong tuần" hoặc "Tất cả" nhé.'
              : 'Tuần này chưa có tin mới. Bà con xem "Tất cả" để đọc các tin trước đó nhé.'}
          </p>
        </div>
      ) : (
        <NewsGrid articles={dangHien} isLoading={isLoading} />
      )}

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
