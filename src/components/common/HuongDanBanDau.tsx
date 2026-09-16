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
  /** Bước của biểu mẫu gửi ý kiến cần CHUYỂN THẬT tới (1 tới 5).
      Có giá trị thì biểu mẫu nhảy sang màn hình đó để bà con thấy tận mắt,
      thay vì đứng ở bước 1 rồi chỉ vào con số trên thanh tiến trình. */
  buocForm?: number;
}

const BUOC_MAY_TINH: Buoc[] = [
  {
    tieuDe: 'Chào mừng đến với Điểm Chạm An Ninh',
    noiDung: 'Đây là nơi bà con gửi ý kiến, phản ánh hoặc tố giác tội phạm tới công an. '
           + 'Bấm vào mục Gửi ý kiến trên thanh menu để bắt đầu.',
    duong: '/',
    chon: 'a[href="/gui-y-kien"]',
  },
  {
    tieuDe: 'Ô kể sự việc',
    noiDung: 'Bà con gõ vào ô này, kể ngắn gọn chuyện muốn báo. Không cần đúng chính tả '
           + 'hay dấu câu, cứ kể như nói chuyện bình thường.',
    duong: '/gui-y-kien',
    buocForm: 1,
    chon: '[data-hd="o-noi-dung"]',
  },
  {
    tieuDe: 'Nút micro — nói thay vì gõ',
    noiDung: 'Bà con ngại gõ phím thì bấm nút này rồi nói. Máy tự chuyển lời nói thành '
           + 'chữ. Nói xong bấm lại nút để dừng.',
    duong: '/gui-y-kien',
    buocForm: 1,
    chon: '[data-hd="nut-micro"]',
  },
  {
    tieuDe: 'Nút chụp ảnh',
    noiDung: 'Có hình ảnh làm bằng chứng thì bấm nút này, máy mở thẳng camera. '
           + 'Ảnh được tự động xoá vị trí GPS trước khi gửi.',
    duong: '/gui-y-kien',
    buocForm: 1,
    chon: '[data-hd="nut-chup-anh"]',
  },
  {
    tieuDe: 'Nút gửi vị trí vụ việc',
    noiDung: 'Bà con đang đứng tại nơi xảy ra sự việc thì bấm nút này, cán bộ sẽ biết '
           + 'chính xác chỗ nào, khỏi phải dò hỏi. Không bắt buộc.',
    duong: '/gui-y-kien',
    buocForm: 1,
    chon: '[data-hd="nut-vi-tri"]',
  },
  {
    tieuDe: 'Bước 2 — Máy đọc lại cho bà con nghe',
    noiDung: 'Hệ thống sắp xếp lại lời bà con vừa kể cho rõ ràng. Bà con xem có đúng ý '
           + 'không, bấm nút Nghe để nghe đọc to.',
    duong: '/gui-y-kien',
    buocForm: 2,
  },
  {
    tieuDe: 'Bước 3 — Chọn loại việc',
    noiDung: 'Bấm vào một trong bốn thẻ này. Máy đã gợi ý sẵn thẻ phù hợp, đúng rồi thì '
           + 'bà con chỉ việc bấm đi tiếp.',
    duong: '/gui-y-kien',
    buocForm: 3,
    chon: '[data-hd="the-nhom"]',
  },
  {
    tieuDe: 'Bước 4 — Cho công an cách liên hệ',
    noiDung: 'Bà con điền họ tên và số điện thoại để cán bộ gọi lại báo kết quả. '
           + 'Email không bắt buộc.',
    duong: '/gui-y-kien',
    buocForm: 4,
  },
  {
    tieuDe: 'Ô gửi ẩn danh',
    noiDung: 'Bà con lo bị trả thù thì bấm vào ô này. Không cần cho tên, không cần số '
           + 'điện thoại. Vẫn có mã tra cứu để xem kết quả. Chỉ có ở nhóm tố giác tội phạm.',
    duong: '/gui-y-kien',
    buocForm: 4,
    chon: '[data-hd="o-an-danh"]',
  },
  {
    tieuDe: 'Bước 5 — Nút gửi',
    noiDung: 'Bà con đọc lại lần cuối rồi bấm nút này để gửi. Xong sẽ có mã tra cứu, '
           + 'nhớ lưu lại để xem tiến độ xử lý.',
    duong: '/gui-y-kien',
    buocForm: 5,
    chon: '[data-hd="nut-gui"]',
  },
  {
    tieuDe: 'Mục Tra cứu và Tin tức',
    noiDung: 'Mục Tra cứu để xem ý kiến đã gửi xử lý tới đâu. Mục Tin tức có tin cảnh '
           + 'giác lừa đảo. Bà con đã nắm được cách dùng rồi!',
    duong: '/',
    chon: 'a[href="/tra-cuu"]',
  },
];

/* ============================================================================
   BỘ BƯỚC RIÊNG CHO ĐIỆN THOẠI
   ============================================================================

   Vì sao phải tách: trên điện thoại các nút nằm CHỖ KHÁC HẲN máy tính. Menu
   chính không hiện ngang trên đầu mà nằm trong nút ba gạch; thay vào đó có
   thanh chức năng dưới chân màn hình. Dùng chung bộ bước thì hướng dẫn chỉ vào
   thanh menu ngang — thứ không tồn tại trên điện thoại — nên khoanh vào chỗ
   trống, bà con nhìn không ra.

   Phần giữa (các bước trong biểu mẫu) giống nhau vì biểu mẫu cùng bố cục. */
const BUOC_DIEN_THOAI: Buoc[] = [
  {
    tieuDe: 'Chào mừng đến với Điểm Chạm An Ninh',
    noiDung: 'Đây là nơi bà con gửi ý kiến, phản ánh hoặc tố giác tội phạm tới công an. '
           + 'Thanh chức năng nằm ở dưới chân màn hình.',
    duong: '/',
    chon: '[data-tab-bar]',
  },
  {
    tieuDe: 'Nút Gửi ý kiến ở thanh dưới',
    noiDung: 'Bà con bấm vào nút này ở thanh dưới chân màn hình để bắt đầu gửi.',
    duong: '/',
    chon: '[data-tab="/gui-y-kien"]',
  },
  {
    tieuDe: 'Ô kể sự việc',
    noiDung: 'Bà con gõ vào ô này, kể ngắn gọn chuyện muốn báo. Không cần đúng chính tả '
           + 'hay dấu câu, cứ kể như nói chuyện bình thường.',
    duong: '/gui-y-kien',
    buocForm: 1,
    chon: '[data-hd="o-noi-dung"]',
  },
  {
    tieuDe: 'Nút micro — nói thay vì gõ',
    noiDung: 'Bà con ngại gõ phím thì bấm nút này rồi nói. Máy tự chuyển lời nói thành '
           + 'chữ. Nói xong bấm lại nút để dừng.',
    duong: '/gui-y-kien',
    buocForm: 1,
    chon: '[data-hd="nut-micro"]',
  },
  {
    tieuDe: 'Nút chụp ảnh',
    noiDung: 'Có hình ảnh làm bằng chứng thì bấm nút này, máy mở thẳng camera của điện '
           + 'thoại. Ảnh được tự động xoá vị trí GPS trước khi gửi.',
    duong: '/gui-y-kien',
    buocForm: 1,
    chon: '[data-hd="nut-chup-anh"]',
  },
  {
    tieuDe: 'Nút gửi vị trí vụ việc',
    noiDung: 'Bà con đang đứng tại nơi xảy ra sự việc thì bấm nút này, cán bộ sẽ biết '
           + 'chính xác chỗ nào, khỏi phải dò hỏi. Không bắt buộc.',
    duong: '/gui-y-kien',
    buocForm: 1,
    chon: '[data-hd="nut-vi-tri"]',
  },
  {
    tieuDe: 'Bước 2 — Máy đọc lại cho bà con nghe',
    noiDung: 'Hệ thống sắp xếp lại lời bà con vừa kể cho rõ ràng. Bà con xem có đúng ý '
           + 'không, bấm nút Nghe để nghe đọc to.',
    duong: '/gui-y-kien',
    buocForm: 2,
  },
  {
    tieuDe: 'Bước 3 — Chọn loại việc',
    noiDung: 'Bấm vào một trong bốn thẻ này. Máy đã gợi ý sẵn thẻ phù hợp, đúng rồi thì '
           + 'bà con chỉ việc bấm đi tiếp.',
    duong: '/gui-y-kien',
    buocForm: 3,
    chon: '[data-hd="the-nhom"]',
  },
  {
    tieuDe: 'Bước 4 — Cho công an cách liên hệ',
    noiDung: 'Bà con điền họ tên và số điện thoại để cán bộ gọi lại báo kết quả. '
           + 'Email không bắt buộc.',
    duong: '/gui-y-kien',
    buocForm: 4,
  },
  {
    tieuDe: 'Ô gửi ẩn danh',
    noiDung: 'Bà con lo bị trả thù thì bấm vào ô này. Không cần cho tên, không cần số '
           + 'điện thoại. Vẫn có mã tra cứu để xem kết quả.',
    duong: '/gui-y-kien',
    buocForm: 4,
    chon: '[data-hd="o-an-danh"]',
  },
  {
    tieuDe: 'Bước 5 — Nút gửi',
    noiDung: 'Bà con đọc lại lần cuối rồi bấm nút này để gửi. Xong sẽ có mã tra cứu, '
           + 'nhớ lưu lại để xem tiến độ xử lý.',
    duong: '/gui-y-kien',
    buocForm: 5,
    chon: '[data-hd="nut-gui"]',
  },
  {
    tieuDe: 'Nút Tra cứu ở thanh dưới',
    noiDung: 'Bấm nút này ở thanh dưới để xem ý kiến đã gửi xử lý tới đâu. Các mục khác '
           + 'nằm trong nút ba gạch ở góc trên. Bà con đã nắm được cách dùng rồi!',
    duong: '/',
    chon: '[data-tab="/tra-cuu"]',
  },
];

export default function HuongDanBanDau() {
  const [hien, setHien] = useState(false);
  const [buoc, setBuoc] = useState(0);
  /* CHỌN BỘ BƯỚC THEO KÍCH THƯỚC MÀN HÌNH.

     Đo MỘT LẦN lúc mở hướng dẫn rồi giữ nguyên suốt vòng. Không đo lại giữa
     chừng: xoay ngang điện thoại mà đổi bộ bước thì số bước đổi, bà con đang ở
     bước 5 trên 12 bỗng nhảy sang bước 5 trên 11 của bộ khác — lạc hẳn. */
  const [boBuoc, setBoBuoc] = useState<Buoc[]>(BUOC_MAY_TINH);
  const [oSang, setOSang] = useState<DOMRect | null>(null);
  /* Giữ chính phần tử đang khoanh, không chỉ giữ toạ độ.

     Toạ độ đo một lần rồi thôi sẽ lệch ngay khi trang cuộn tiếp hoặc đổi kích
     thước — đúng lỗi bà con gặp ở bước 2: màn hình tụt xuống mà ô sáng vẫn
     đứng chỗ cũ. Giữ phần tử thì đo lại bất cứ lúc nào cũng đúng. */
  const phanTuDangKhoanh = useRef<Element | null>(null);
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
    const t = setTimeout(() => {
      if (daHuy) return;
      setBoBuoc(window.innerWidth < 768 ? BUOC_DIEN_THOAI : BUOC_MAY_TINH);
      setHien(true);
    }, 1200);
    return () => { daHuy = true; clearTimeout(t); };
  }, []);

  /* Cho phép mở lại từ nơi khác (trang Giới thiệu) bằng một sự kiện chung. */
  useEffect(() => {
    const moLai = () => {
      setBoBuoc(window.innerWidth < 768 ? BUOC_DIEN_THOAI : BUOC_MAY_TINH);
      setBuoc(0);
      setHien(true);
    };
    window.addEventListener('ans:mo-huong-dan', moLai);
    return () => window.removeEventListener('ans:mo-huong-dan', moLai);
  }, []);

  /* Chuyển trang khi bước yêu cầu, rồi đo vị trí phần cần làm nổi bật. */
  useEffect(() => {
    if (!hien) return;
    const b = boBuoc[buoc];
    if (b.duong && location.pathname !== b.duong) {
      navigate(b.duong);
      return;   // đợi trang mới vẽ xong, hiệu ứng này chạy lại
    }

    /* CHUYỂN THẬT màn hình biểu mẫu sang bước đang hướng dẫn.

       Không làm việc này thì hướng dẫn nói "Bước 3 — Chọn loại việc" trong khi
       màn hình vẫn đứng ở bước 1, bà con chẳng hình dung được bước đó trông ra
       sao. Biểu mẫu nhận lệnh này sẽ khoá nút gửi và hiện dải báo "đang xem
       hướng dẫn, chưa gửi gì cả". */
    if (b.buocForm) {
      window.dispatchEvent(new CustomEvent('ans:huong-dan-buoc', { detail: b.buocForm }));
    }

    if (!b.chon) { phanTuDangKhoanh.current = null; setOSang(null); return; }

    /* CHỜ RỒI THỬ LẠI NHIỀU LẦN, không đo một lần rồi thôi.

       Bước nào đổi màn hình biểu mẫu thì phần tử cần khoanh chỉ xuất hiện SAU
       khi màn hình đó vẽ xong. Đo một lần ở mốc cố định thì khi máy chậm hoặc
       màn hình nặng, phần tử chưa kịp có — ô sáng không hiện, hướng dẫn nói về
       một nút mà không chỉ được vào đâu.

       Thử lại mỗi 200ms, tối đa 10 lần (2 giây). Tìm thấy là dừng ngay. */
    let lan = 0;
    let dungLai: ReturnType<typeof setTimeout> | null = null;

    const doThu = () => {
      const el = document.querySelector(b.chon!);
      if (!el) {
        if (++lan < 10) { dungLai = setTimeout(doThu, 200); }
        else { phanTuDangKhoanh.current = null; setOSang(null); }
        return;
      }
      /* Đưa phần tử vào GIỮA màn hình. Không cuộn thì phần tử có thể nằm ngoài
         tầm nhìn, ô sáng khoanh vào chỗ trống. */
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      /* Chờ cuộn xong hẳn rồi mới đo. Đo giữa lúc đang cuộn thì toạ độ sai. */
      phanTuDangKhoanh.current = el;
      dungLai = setTimeout(() => setOSang(el.getBoundingClientRect()), 550);
    };

    const t = setTimeout(doThu, 250);
    return () => { clearTimeout(t); if (dungLai) clearTimeout(dungLai); };
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
    const b = boBuoc[buoc];
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

  /* ĐO LẠI LIÊN TỤC CHO Ô SÁNG BÁM CHẮC NÚT.

     Dùng ResizeObserver theo dõi phần tử, cộng lắng nghe cuộn và đổi kích
     thước cửa sổ. Bất cứ khi nào bố cục đổi là đo lại ngay, nên ô sáng luôn
     ôm đúng nút dù trang có nhúc nhích thế nào.

     Không có phần này thì đo một lần rồi giữ nguyên: bước nào có nội dung tải
     chậm hoặc ảnh vừa hiện ra đẩy bố cục xuống là ô sáng lệch khỏi nút. */
  useEffect(() => {
    if (!hien) return;

    const doLai = () => {
      const el = phanTuDangKhoanh.current;
      if (el && document.body.contains(el)) setOSang(el.getBoundingClientRect());
    };

    window.addEventListener('scroll', doLai, { passive: true });
    window.addEventListener('resize', doLai);

    /* Theo dõi cả thay đổi kích thước của chính phần tử — ví dụ nút đổi chữ
       từ "Nghe lại" sang "Dừng đọc" thì nó rộng ra. */
    const theoDoi = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(doLai) : null;
    if (theoDoi && phanTuDangKhoanh.current) theoDoi.observe(phanTuDangKhoanh.current);

    return () => {
      window.removeEventListener('scroll', doLai);
      window.removeEventListener('resize', doLai);
      theoDoi?.disconnect();
    };
  }, [hien, buoc, oSang === null]);

  /* KHOÁ CUỘN TAY TRONG LÚC HƯỚNG DẪN.

     Vì sao cần: hướng dẫn tự cuộn tới đúng nút rồi khoanh sáng. Nếu bà con lỡ
     vuốt màn hình thì nút trôi đi mất, ô sáng phải chạy theo, mà lời đọc đang
     nói về nút đó — rối hẳn.

     ⚠️ CHẶN ĐÚNG THAO TÁC CỦA TAY, KHÔNG dùng overflow hidden trên thẻ body.

     Đặt overflow hidden thì chặn luôn cả phần cuộn bằng mã, nên hướng dẫn
     không tự đưa được nút vào tầm nhìn — hỏng đúng thứ đang cần.

     Cách này chỉ chặn lăn chuột và vuốt tay; lệnh cuộn do mã gọi vẫn chạy
     bình thường. Vẫn cho bấm phím Escape để thoát, và cho cuộn BÊN TRONG thẻ
     hướng dẫn phòng khi lời giải thích dài hơn màn hình. */
  useEffect(() => {
    if (!hien) return;

    const trongThe = (e: Event) => {
      const t = e.target as Element | null;
      return Boolean(t?.closest?.('[data-huong-dan-the]'));
    };
    const chan = (e: Event) => { if (!trongThe(e)) e.preventDefault(); };
    const chanPhim = (e: KeyboardEvent) => {
      const phimCuon = ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '];
      if (phimCuon.includes(e.key) && !trongThe(e)) e.preventDefault();
    };

    window.addEventListener('wheel', chan, { passive: false });
    window.addEventListener('touchmove', chan, { passive: false });
    window.addEventListener('keydown', chanPhim);
    return () => {
      window.removeEventListener('wheel', chan);
      window.removeEventListener('touchmove', chan);
      window.removeEventListener('keydown', chanPhim);
    };
  }, [hien]);

  function dong() {
    /* Ghi MỐC THỜI GIAN đóng. Sau một giờ hướng dẫn sẽ hiện lại. */
    try { localStorage.setItem(KHOA, String(Date.now())); } catch { /* bỏ qua */ }
    dungDoc();
    /* Trả biểu mẫu về bước 1 và mở khoá nút gửi. Không báo kết thúc thì biểu
       mẫu kẹt ở màn hình xác nhận với nút gửi bị khoá — bà con không gửi được
       mà cũng không hiểu vì sao. */
    window.dispatchEvent(new Event('ans:huong-dan-ket-thuc'));
    setHien(false);
  }

  if (!hien) return null;

  const b = boBuoc[buoc];
  const laCuoi = buoc === boBuoc.length - 1;

  /* Phần tử đang khoanh nằm nửa DƯỚI màn hình -> đưa thẻ lên TRÊN, và ngược
     lại. Không có ô sáng thì để thẻ ở đáy như cũ, chỗ ngón tay dễ với nhất. */
  const theONua: 'tren' | 'duoi' = oSang && oSang.top > window.innerHeight * 0.45
    ? 'tren' : 'duoi';

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
          data-huong-dan-the
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          /* THẺ TỰ TRÁNH CHỖ ĐANG KHOANH.

             Thẻ luôn ở đáy thì khi khoanh vào nút nằm dưới màn hình (nút gửi,
             ô ẩn danh), thẻ che mất đúng thứ đang chỉ — bà con đọc chữ mà
             không nhìn thấy nút. Nay phần tử nằm nửa dưới thì thẻ nhảy lên
             trên, và ngược lại. */
          className={`absolute inset-x-3 mx-auto max-w-lg rounded-2xl bg-white p-5 shadow-2xl transition-all duration-300 dark:bg-slate-900 sm:inset-x-6 ${
            theONua === 'tren' ? 'top-4' : 'bottom-4'
          }`}
        >
          <div className="mb-2 flex items-center gap-2">
            <span className="rounded-lg bg-primary-600 px-2 py-0.5 text-xs font-extrabold text-white">
              {buoc + 1}/{boBuoc.length}
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
              const b2 = boBuoc[buoc];
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
            {boBuoc.map((_, i) => (
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
