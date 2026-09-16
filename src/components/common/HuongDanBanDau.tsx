/**
 * HuongDanBanDau — hướng dẫn 8 bước cho người vào trang lần đầu.
 *
 * VÌ SAO CẦN: bà con lớn tuổi và người ít dùng máy vào trang thường không biết
 * bắt đầu từ đâu. Một vòng hướng dẫn ngắn chỉ đúng nút cần bấm giải quyết được
 * rào cản đó, mà không phải ai cũng cần — nên có nút bỏ qua ngay từ bước đầu.
 *
 * CÁCH HOẠT ĐỘNG:
 *   - Hiện tự động lần đầu vào trang, sau đó nhớ là đã xem
 *   - Mỗi bước làm NỔI BẬT đúng phần giao diện đang nói tới (nếu phần đó có
 *     trên trang hiện tại), phần còn lại làm mờ đi
 *   - Tự chuyển sang trang tương ứng khi bước cần
 *
 * ⚠️ BỎ QUA LÀ BỎ HẲN. Bấm "Bỏ qua" thì không hiện lại nữa, kể cả lần sau vào
 *    trang. Hỏi đi hỏi lại một người đã từ chối là phiền, và với người lớn tuổi
 *    thì mỗi lần hiện lại là một lần họ tưởng mình bấm sai gì đó.
 *
 * ⚠️ VẪN MỞ LẠI ĐƯỢC. Có mục "Xem lại hướng dẫn" ở trang Giới thiệu cho người
 *    lỡ bỏ qua rồi muốn xem — bỏ hẳn mà không có đường quay lại là cụt.
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Rocket, CheckCircle2, Volume2, VolumeX } from 'lucide-react';
import { STORAGE_KEYS } from '../../utils/constants';
import { docTiengViet, type DieuKhienDoc } from '../../utils/tiengNoi';

/** Khoá nhớ đã xem hướng dẫn. */
const KHOA = STORAGE_KEYS.daXemHuongDan ?? 'ans_da_xem_huong_dan';

/** Cách bao lâu thì hiện lại hướng dẫn. Một giờ — xem chú thích ở chỗ dùng. */
const HAN_HIEN_LAI_MS = 60 * 60 * 1000;

interface Buoc {
  /** Tiêu đề in đậm trên thẻ hướng dẫn */
  tieuDe: string;
  /** Lời giải thích, viết như nói chuyện với bà con */
  noiDung: string;
  /** Đường dẫn cần mở để thấy phần đang nói tới. Bỏ trống = giữ nguyên trang. */
  duong?: string;
  /** Bộ chọn phần tử cần làm nổi bật. Không tìm thấy thì chỉ hiện thẻ, không sao. */
  chon?: string;
}

const CAC_BUOC: Buoc[] = [
  {
    tieuDe: 'Chào mừng đến với Hộp Thư An Ninh Số',
    noiDung: 'Để gửi ý kiến, phản ánh hoặc tố giác tội phạm, bà con bấm vào mục '
           + '"Gửi ý kiến" trên thanh menu.',
    duong: '/',
    chon: 'a[href="/gui-y-kien"]',
  },
  {
    tieuDe: 'Bước 1 — Kể sự việc',
    noiDung: 'Bà con kể ngắn gọn chuyện muốn báo. Có thể gõ chữ, bấm nút micro để nói '
           + 'thay vì gõ, hoặc chụp ảnh nếu có hình.',
    duong: '/gui-y-kien',
    chon: '[data-buoc="1"]',
  },
  {
    tieuDe: 'Bước 2 — Máy xem lại',
    noiDung: 'Hệ thống đọc lại lời bà con vừa kể và sắp xếp cho rõ ràng. Bà con xem có '
           + 'đúng ý không, có nút Nghe để nghe đọc to.',
    duong: '/gui-y-kien',
    chon: '[data-buoc="2"]',
  },
  {
    tieuDe: 'Bước 3 — Chọn loại việc',
    noiDung: 'Chọn nhóm việc phù hợp: tố giác tội phạm, khiếu nại tố cáo, phản ánh kiến '
           + 'nghị, hay đề xuất thắc mắc. Máy đã gợi ý sẵn, đúng thì bấm đi tiếp.',
    duong: '/gui-y-kien',
    chon: '[data-buoc="3"]',
  },
  {
    tieuDe: 'Bước 4 — Cách liên hệ',
    noiDung: 'Bà con điền tên và số điện thoại để cán bộ liên hệ lại. Hoặc chọn gửi kín '
           + 'không cần cho tên. Email không bắt buộc.',
    duong: '/gui-y-kien',
    chon: '[data-buoc="4"]',
  },
  {
    tieuDe: 'Gửi kín — chỉ có ở nhóm tố giác tội phạm',
    noiDung: 'Bà con lo ngại bị trả thù thì chọn Gửi ẩn danh. Không cần cho tên, số '
           + 'điện thoại hay email. Bà con vẫn được cấp mã tra cứu để theo dõi kết quả.',
    duong: '/gui-y-kien',
    chon: '[data-buoc="4"]',
  },
  {
    tieuDe: 'Bước 5 — Kiểm lại và gửi',
    noiDung: 'Bà con đọc lại lần cuối rồi bấm gửi. Xong sẽ có mã tra cứu, nhớ lưu lại '
           + 'mã đó để xem tiến độ xử lý.',
    duong: '/gui-y-kien',
    chon: '[data-buoc="5"]',
  },
  {
    tieuDe: 'Xem tin tức và tra cứu',
    noiDung: 'Mục Tin tức có tin cảnh giác lừa đảo và hướng dẫn thủ tục. Mục Tra cứu '
           + 'để xem ý kiến đã gửi xử lý tới đâu. Bà con đã nắm được các bước rồi!',
    duong: '/',
    chon: 'a[href="/tin-tuc"]',
  },
];

export default function HuongDanBanDau() {
  const [hien, setHien] = useState(false);
  const [buoc, setBuoc] = useState(0);
  const [oSang, setOSang] = useState<DOMRect | null>(null);
  const [dangDoc, setDangDoc] = useState(false);
  /* Giữ bộ điều khiển của lần đọc đang chạy để dừng được khi chuyển bước. */
  const dieuKhienDoc = useRef<DieuKhienDoc | null>(null);

  function dungDoc() {
    dieuKhienDoc.current?.dung();
    dieuKhienDoc.current = null;
    setDangDoc(false);
  }
  const navigate = useNavigate();
  const location = useLocation();

  /* Hiện lần đầu. Chờ một nhịp cho trang vẽ xong, nếu không thẻ hướng dẫn nhảy
     ra khi trang còn trống, bà con chưa kịp nhìn thấy gì đã bị che. */
  useEffect(() => {
    let daHuy = false;
    try {
      /* HIỆN LẠI SAU MỖI GIỜ, không phải một lần rồi thôi.

         Lý do: bà con lớn tuổi thường không nhớ hết sau một lần xem, mà cũng
         ít khi chủ động đi tìm lại hướng dẫn. Cách một giờ hiện lại là vừa —
         người vào lướt qua vài trang trong một buổi thì không bị làm phiền,
         còn người quay lại hôm sau vẫn được nhắc.

         Ghi MỐC THỜI GIAN thay vì ghi cờ đã xem: cờ thì chỉ biết có hay không,
         mốc thời gian mới tính được đã qua bao lâu. */
      const luc = Number(localStorage.getItem(KHOA) || 0);
      if (luc && Date.now() - luc < HAN_HIEN_LAI_MS) return;
    } catch {
      return;   // trình duyệt chặn lưu trữ -> không hiện, tránh hiện lại mỗi lần
    }
    const t = setTimeout(() => { if (!daHuy) setHien(true); }, 1200);
    return () => { daHuy = true; clearTimeout(t); };
  }, []);

  /* Cho phép mở lại từ nơi khác (trang Giới thiệu) bằng một sự kiện chung. */
  useEffect(() => {
    const moLai = () => { setBuoc(0); setHien(true); };
    window.addEventListener('ans:mo-huong-dan', moLai);
    return () => window.removeEventListener('ans:mo-huong-dan', moLai);
  }, []);

  /* Chuyển trang khi bước yêu cầu, rồi đo vị trí phần cần làm nổi bật. */
  useEffect(() => {
    if (!hien) return;
    const b = CAC_BUOC[buoc];
    if (b.duong && location.pathname !== b.duong) {
      navigate(b.duong);
      return;   // đợi trang mới vẽ xong, hiệu ứng này chạy lại
    }

    if (!b.chon) { setOSang(null); return; }

    /* Chờ trang vẽ xong mới đo. Đo sớm quá thì phần tử chưa có, ô sáng lệch chỗ. */
    const t = setTimeout(() => {
      const el = document.querySelector(b.chon!);
      if (!el) { setOSang(null); return; }
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      setTimeout(() => setOSang(el.getBoundingClientRect()), 350);
    }, 300);
    return () => clearTimeout(t);
  }, [hien, buoc, location.pathname, navigate]);

  /* ĐỌC TO NỘI DUNG MỖI BƯỚC.

     Vì sao tự đọc chứ không chờ bấm nút: đây là hướng dẫn cho người không quen
     đọc chữ — nếu bắt họ bấm nút loa trước thì đã mất một bước phải hiểu rồi.
     Vẫn có nút để dừng hoặc nghe lại.

     Dừng lần đọc cũ TRƯỚC khi đọc lần mới, nếu không hai giọng chồng lên nhau
     khi bà con bấm tiếp tục nhanh. */
  useEffect(() => {
    if (!hien) return;
    dungDoc();
    const b = CAC_BUOC[buoc];
    const loi = `${b.tieuDe}. ${b.noiDung}`;
    /* Chờ một nhịp cho thẻ hiện ra rồi mới đọc, tránh đọc khi màn hình còn
       đang chuyển — bà con nghe tiếng mà chưa thấy chữ thì bối rối. */
    const t = setTimeout(() => {
      setDangDoc(true);
      dieuKhienDoc.current = docTiengViet(loi, () => setDangDoc(false));
    }, 500);
    return () => { clearTimeout(t); dungDoc(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hien, buoc]);

  function dong() {
    /* Ghi MỐC THỜI GIAN đóng. Sau một giờ hướng dẫn sẽ hiện lại. */
    try { localStorage.setItem(KHOA, String(Date.now())); } catch { /* bỏ qua */ }
    dungDoc();
    setHien(false);
  }

  if (!hien) return null;

  const b = CAC_BUOC[buoc];
  const laCuoi = buoc === CAC_BUOC.length - 1;

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100]"
        /* Không cho bấm xuyên qua lớp phủ: bà con đang xem hướng dẫn mà lỡ bấm
           trúng nút bên dưới thì lạc mất mạch. */
        style={{ pointerEvents: 'auto' }}
      >
        {/* LỚP PHỦ LÀM MỜ. Có ô sáng thì khoét một lỗ đúng chỗ phần tử đang nói
            tới, bằng cách đổ bóng cực lớn ra ngoài khung — cách này nhẹ hơn vẽ
            bốn hình chữ nhật che quanh. */}
        {oSang ? (
          <div
            className="pointer-events-none absolute rounded-xl ring-4 ring-primary-400 transition-all duration-300"
            style={{
              top: oSang.top - 6,
              left: oSang.left - 6,
              width: oSang.width + 12,
              height: oSang.height + 12,
              boxShadow: '0 0 0 9999px rgba(15, 23, 42, 0.72)',
            }}
          />
        ) : (
          <div className="absolute inset-0 bg-slate-900/72" />
        )}

        {/* THẺ HƯỚNG DẪN — luôn ở đáy màn hình, chỗ ngón tay dễ với tới nhất. */}
        <motion.div
          key={buoc}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="absolute inset-x-3 bottom-4 mx-auto max-w-lg rounded-2xl bg-white p-5 shadow-2xl dark:bg-slate-900 sm:inset-x-6"
        >
          <div className="mb-2 flex items-center gap-2">
            <span className="rounded-lg bg-primary-600 px-2 py-0.5 text-xs font-extrabold text-white">
              {buoc + 1}/{CAC_BUOC.length}
            </span>
            <h3 className="text-base font-extrabold leading-snug text-slate-800 dark:text-slate-100">
              {laCuoi ? 'Hoàn tất hướng dẫn' : b.tieuDe}
            </h3>
          </div>

          {laCuoi && (
            <div className="mb-3 flex justify-center">
              <CheckCircle2 className="h-12 w-12 text-emerald-500" />
            </div>
          )}

          <p className="mb-4 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
            {laCuoi
              ? 'Bà con đã nắm được các bước cơ bản. Hãy bắt đầu gửi ý kiến ngay bây giờ!'
              : b.noiDung}
          </p>

          {/* Nút nghe lại hoặc dừng — cho người muốn nghe kỹ, và cho người
              không cần nghe được tắt tiếng. */}
          <button
            type="button"
            onClick={() => {
              if (dangDoc) { dungDoc(); return; }
              const b2 = CAC_BUOC[buoc];
              setDangDoc(true);
              dieuKhienDoc.current = docTiengViet(
                `${b2.tieuDe}. ${b2.noiDung}`, () => setDangDoc(false));
            }}
            className="mb-3 inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-primary-50 px-3 py-2 text-xs font-bold text-primary-700 transition hover:bg-primary-100 dark:bg-primary-900/25 dark:text-primary-300"
          >
            {dangDoc ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            {dangDoc ? 'Dừng đọc' : 'Nghe lại'}
          </button>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={dong}
              aria-label={laCuoi ? 'Đóng hướng dẫn' : 'Bỏ qua hướng dẫn'}
              data-huong-dan="bo-qua"
              className="min-h-[44px] flex-1 rounded-xl border-2 border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              {laCuoi ? 'Đóng' : 'Bỏ qua'}
            </button>
            <button
              type="button"
              onClick={() => {
                if (laCuoi) { dong(); navigate('/gui-y-kien'); }
                else setBuoc((i) => i + 1);
              }}
              aria-label={laCuoi ? 'Bắt đầu gửi ý kiến' : 'Bước tiếp theo của hướng dẫn'}
              data-huong-dan="tiep-tuc"
              className="flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-primary-700"
            >
              {laCuoi ? <><Rocket className="h-4 w-4" /> Bắt đầu</> : <>Tiếp tục <ArrowRight className="h-4 w-4" /></>}
            </button>
          </div>

          {/* Chấm chỉ vị trí — cho biết còn bao nhiêu bước nữa, đỡ sốt ruột. */}
          <div className="mt-3 flex justify-center gap-1">
            {CAC_BUOC.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all ${
                  i === buoc ? 'w-5 bg-primary-600' : 'w-1.5 bg-slate-300 dark:bg-slate-600'
                }`}
              />
            ))}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}
