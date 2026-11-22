/**
 * HuongDanBanDau — vòng hướng dẫn từng bước cho người vào trang lần đầu.
 *
 * VÌ SAO CẦN: bà con lớn tuổi và người ít dùng máy vào trang thường không biết
 * bắt đầu từ đâu. Một vòng hướng dẫn ngắn chỉ đúng nút cần bấm giải quyết được
 * rào cản đó, mà không phải ai cũng cần — nên có nút bỏ qua ngay từ bước đầu.
 *
 * CÁCH HOẠT ĐỘNG:
 *   - Hiện tự động lần đầu vào trang chủ, sau đó nhớ là đã xem
 *   - Mỗi bước làm NỔI BẬT đúng phần giao diện đang nói tới bằng lớp mặt nạ
 *     SVG khoét lỗ + viền sáng chạy trên GPU (translate3d), KHÔNG dùng
 *     box-shadow 9999px hay animate top/left/width/height nên luôn mượt 60fps
 *     trên cả máy tính lẫn điện thoại yếu
 *   - Thẻ hướng dẫn giữ nguyên khung (không huỷ/tạo lại khi đổi bước), tự lướt
 *     tới vị trí thoáng nhất cạnh ô sáng (máy tính có mũi tên chỉ hướng; điện
 *     thoại trượt êm giữa đỉnh/đáy màn hình và hỗ trợ vuốt ngang đổi bước)
 *   - Tự chuyển sang trang và bước biểu mẫu tương ứng khi bước cần
 *
 * ⚠️ BỎ QUA LÀ BỎ HẲN. Bấm "Bỏ qua" thì không hiện lại nữa, kể cả lần sau vào
 *    trang. Hỏi đi hỏi lại một người đã từ chối là phiền, và với người lớn tuổi
 *    thì mỗi lần hiện lại là một lần họ tưởng mình bấm sai gì đó.
 *
 * ⚠️ VẪN MỞ LẠI ĐƯỢC. Có mục "Xem lại hướng dẫn" ở trang Giới thiệu cho người
 *    lỡ bỏ qua rồi muốn xem — bỏ hẳn mà không có đường quay lại là cụt.
 */
import { useCallback, useEffect, useId, useRef, useState, type TouchEvent } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, ArrowRight, Rocket, CheckCircle2, Volume2, VolumeX, X } from 'lucide-react';
import { STORAGE_KEYS } from '../../utils/constants';
import { docTiengViet, type DieuKhienDoc } from '../../utils/tiengNoi';
import type { KhoaChu } from '../../i18n/chu';
import { useNgonNgu } from '../../i18n/useNgonNgu';
import { duocTuHienHuongDan } from '../../utils/huongDan';

/** Khoá nhớ đã xem hướng dẫn. */
const KHOA = STORAGE_KEYS.daXemHuongDan ?? 'ans_da_xem_huong_dan';

/** Đường cong chuyển động êm kiểu ứng dụng gốc (nhanh đầu, đáp êm không nảy). */
const DUONG_CONG_EM = [0.22, 1, 0.36, 1] as const;

interface Buoc {
  /** Khoá tra bản dịch cho tiêu đề. Trước đây viết thẳng chữ tiếng Việt vào
      đây nên người nước ngoài đổi sang tiếng Anh vẫn nghe và đọc tiếng Việt. */
  khoaTieuDe: KhoaChu;
  /** Khoá tra bản dịch cho lời giải thích */
  khoaNoiDung: KhoaChu;
  /** Đường dẫn cần mở để thấy phần đang nói tới. Bỏ trống = giữ nguyên trang. */
  duong?: string;
  /** Bộ chọn phần tử cần làm nổi bật. Không tìm thấy thì chỉ hiện thẻ, không sao. */
  chon?: string;
  /** Bước của biểu mẫu gửi ý kiến cần CHUYỂN THẬT tới (1 tới 5).
      Có giá trị thì biểu mẫu nhảy sang màn hình đó để bà con thấy tận mắt,
      thay vì đứng ở bước 1 rồi chỉ vào con số trên thanh tiến trình. */
  buocForm?: number;
}

interface KhungSang {
  x: number;
  y: number;
  w: number;
  h: number;
  rx: number;
}

type HuongMuiTen = 'tren' | 'duoi' | 'trai' | 'phai' | null;

interface ViTriThe {
  x: number;
  y: number;
  w: number;
  muiTen: HuongMuiTen;
  muiTenLech: number;
  laDienThoai: boolean;
}

const BUOC_MAY_TINH: Buoc[] = [
  {
    khoaTieuDe: 'hd.b1t',
    khoaNoiDung: 'hd.b1n',
    duong: '/',
    chon: 'a[href="/gui-y-kien"]',
  },
  {
    khoaTieuDe: 'hd.b2t',
    khoaNoiDung: 'hd.b2n',
    duong: '/gui-y-kien',
    buocForm: 1,
    chon: '[data-hd="o-noi-dung"]',
  },
  {
    khoaTieuDe: 'hd.b3t',
    khoaNoiDung: 'hd.b3n',
    duong: '/gui-y-kien',
    buocForm: 1,
    chon: '[data-hd="nut-micro"]',
  },
  {
    khoaTieuDe: 'hd.b4t',
    khoaNoiDung: 'hd.b4n',
    duong: '/gui-y-kien',
    buocForm: 1,
    chon: '[data-hd="nut-chup-anh"]',
  },
  {
    khoaTieuDe: 'hd.b5t',
    khoaNoiDung: 'hd.b5n',
    duong: '/gui-y-kien',
    buocForm: 1,
    chon: '[data-hd="nut-vi-tri"]',
  },
  {
    khoaTieuDe: 'hd.b6t',
    khoaNoiDung: 'hd.b6n',
    duong: '/gui-y-kien',
    buocForm: 2,
  },
  {
    khoaTieuDe: 'hd.b7t',
    khoaNoiDung: 'hd.b7n',
    duong: '/gui-y-kien',
    buocForm: 3,
    chon: '[data-hd="the-nhom"]',
  },
  {
    khoaTieuDe: 'hd.b8t',
    khoaNoiDung: 'hd.b8n',
    duong: '/gui-y-kien',
    buocForm: 4,
  },
  {
    khoaTieuDe: 'hd.b9t',
    khoaNoiDung: 'hd.b9n',
    duong: '/gui-y-kien',
    buocForm: 4,
    chon: '[data-hd="o-an-danh"]',
  },
  {
    khoaTieuDe: 'hd.b10t',
    khoaNoiDung: 'hd.b10n',
    duong: '/gui-y-kien',
    buocForm: 5,
    chon: '[data-hd="nut-gui"]',
  },
  {
    khoaTieuDe: 'hd.b11t',
    khoaNoiDung: 'hd.b11n',
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
    khoaTieuDe: 'hd.b12t',
    khoaNoiDung: 'hd.b12n',
    duong: '/',
    chon: '[data-tab-bar]',
  },
  {
    khoaTieuDe: 'hd.b13t',
    khoaNoiDung: 'hd.b13n',
    duong: '/',
    chon: '[data-tab="/gui-y-kien"]',
  },
  {
    khoaTieuDe: 'hd.b2t',
    khoaNoiDung: 'hd.b2n',
    duong: '/gui-y-kien',
    buocForm: 1,
    chon: '[data-hd="o-noi-dung"]',
  },
  {
    khoaTieuDe: 'hd.b3t',
    khoaNoiDung: 'hd.b3n',
    duong: '/gui-y-kien',
    buocForm: 1,
    chon: '[data-hd="nut-micro"]',
  },
  {
    khoaTieuDe: 'hd.b14t',
    khoaNoiDung: 'hd.b14n',
    duong: '/gui-y-kien',
    buocForm: 1,
    chon: '[data-hd="nut-chup-anh"]',
  },
  {
    khoaTieuDe: 'hd.b5t',
    khoaNoiDung: 'hd.b5n',
    duong: '/gui-y-kien',
    buocForm: 1,
    chon: '[data-hd="nut-vi-tri"]',
  },
  {
    khoaTieuDe: 'hd.b6t',
    khoaNoiDung: 'hd.b6n',
    duong: '/gui-y-kien',
    buocForm: 2,
  },
  {
    khoaTieuDe: 'hd.b7t',
    khoaNoiDung: 'hd.b7n',
    duong: '/gui-y-kien',
    buocForm: 3,
    chon: '[data-hd="the-nhom"]',
  },
  {
    khoaTieuDe: 'hd.b8t',
    khoaNoiDung: 'hd.b8n',
    duong: '/gui-y-kien',
    buocForm: 4,
  },
  {
    khoaTieuDe: 'hd.b15t',
    khoaNoiDung: 'hd.b15n',
    duong: '/gui-y-kien',
    buocForm: 4,
    chon: '[data-hd="o-an-danh"]',
  },
  {
    khoaTieuDe: 'hd.b10t',
    khoaNoiDung: 'hd.b10n',
    duong: '/gui-y-kien',
    buocForm: 5,
    chon: '[data-hd="nut-gui"]',
  },
  {
    khoaTieuDe: 'hd.b16t',
    khoaNoiDung: 'hd.b16n',
    duong: '/',
    chon: '[data-tab="/tra-cuu"]',
  },
];

/** Phần tử (hoặc khung chứa nó) có đứng yên khi cuộn trang không. */
function namTrongKhungCoDinh(el: Element): boolean {
  for (let e: Element | null = el; e && e !== document.body; e = e.parentElement) {
    const p = window.getComputedStyle(e).position;
    if (p === 'fixed' || p === 'sticky') return true;
  }
  return false;
}

/** Người dùng có bật chế độ giảm chuyển động trong hệ điều hành không. */
function giamChuyenDong(): boolean {
  return typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Kích thước khung nhìn thực tế (tính cả thanh địa chỉ co giãn trên điện thoại). */
function layKichThuocKhungNhin(): { vw: number; vh: number } {
  const vv = window.visualViewport;
  return {
    vw: Math.round(vv?.width ?? window.innerWidth),
    vh: Math.round(vv?.height ?? window.innerHeight),
  };
}

/** Tìm phần tử đang thật sự hiển thị (tránh chọn nhầm phần tử bị ẩn theo kích thước màn hình). */
function timPhanTuHien(chon: string): Element | null {
  const { vh } = layKichThuocKhungNhin();
  const ds = document.querySelectorAll(chon);
  for (let i = 0; i < ds.length; i += 1) {
    const el = ds[i];
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    /* Nếu là phần tử cố định (như thanh chức năng đáy điện thoại) đang trượt từ
       ngoài mép màn hình vào, đợi thêm vài khung hình cho nó ló lên rồi hãy đo. */
    if (namTrongKhungCoDinh(el) && (r.top >= vh - 6 || r.bottom <= 6)) continue;
    return el;
  }
  return null;
}

/** Đo khung sáng ôm gọn phần tử, tự khớp độ bo góc và không tràn khỏi mép màn hình. */
function doKhungSang(el: Element, vw: number, vh: number, dichY = 0): KhungSang | null {
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return null;
  const pad = vw < 768 ? 5 : 7;
  const x = kep(r.left - pad, 4, vw - 12);
  const y = kep(r.top - dichY - pad, 4, vh - 12);
  const phai = kep(r.right + pad, x + 8, vw - 4);
  const day = kep(r.bottom - dichY + pad, y + 8, vh - 4);
  const w = Math.max(8, phai - x);
  const h = Math.max(8, day - y);
  const boGoc = parseFloat(window.getComputedStyle(el).borderTopLeftRadius || '12');
  const rx = Math.max(10, Math.min(24, (Number.isFinite(boGoc) ? boGoc : 12) + 4));
  return { x, y, w, h, rx };
}

function kep(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function noiSuy(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function easeOutQuart(t: number): number {
  return 1 - Math.pow(1 - t, 4);
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * TÍNH VỊ TRÍ TỐI ƯU CHO THẺ HƯỚNG DẪN — tách rõ trải nghiệm máy tính và điện thoại.
 *
 * - Điện thoại (< 768px): dạng thẻ nổi rộng gần trọn màn hình, so trực tiếp
 *   khoangTren và khoangDuoi quanh ô sáng để đậu gọn ở phía thoáng hơn — không
 *   bao giờ đè lên nút đang chỉ (giữ vững kết quả đo P76 trên máy 360×640).
 * - Máy tính (>= 768px): dạng thẻ nổi bám ngay cạnh ô sáng (ưu tiên dưới / trên
 *   rồi mới sang phải / trái) kèm mũi tên chỉ thẳng tâm ô sáng để mắt không phải
 *   liếc xa từ đầu trang xuống tận chân trang.
 */
function tinhViTriThe(
  khung: KhungSang | null,
  vw: number,
  vh: number,
  caoThe: number,
): ViTriThe {
  const laDienThoai = vw < 768;

  if (laDienThoai) {
    const leNgang = 12;
    const w = Math.min(vw - leNgang * 2, 460);
    const x = Math.round((vw - w) / 2);
    const khoangTren = khung ? khung.y : 0;
    const khoangDuoi = khung ? vh - (khung.y + khung.h) : 0;
    const theOTren = Boolean(khung && khoangTren > khoangDuoi);
    const leDoc = 14;
    const y = theOTren
      ? leDoc
      : Math.max(leDoc, Math.round(vh - caoThe - leDoc));
    return { x, y, w, muiTen: null, muiTenLech: 0, laDienThoai: true };
  }

  /* Máy tính: thẻ gọn 428px, bám sát ô sáng ở phía rộng rãi nhất. */
  const le = 16;
  const khe = 16;
  const w = Math.min(428, vw - le * 2);

  if (!khung) {
    return {
      x: Math.round((vw - w) / 2),
      y: Math.max(le, Math.round(vh - caoThe - 28)),
      w,
      muiTen: null,
      muiTenLech: 0,
      laDienThoai: false,
    };
  }

  const khoangTren = khung.y - le;
  const khoangDuoi = vh - (khung.y + khung.h) - le;
  const khoangPhai = vw - (khung.x + khung.w) - le;
  const khoangTrai = khung.x - le;
  const tamX = khung.x + khung.w / 2;
  const tamY = khung.y + khung.h / 2;

  /* Ưu tiên đặt DƯỚI hoặc TRÊN (tự nhiên theo chiều đọc từ trên xuống),
     căn tâm ngang theo ô sáng và giữ mũi tên trỏ đúng tâm ô. */
  if (khoangDuoi >= caoThe + khe && (khoangDuoi >= khoangTren || khung.y < vh * 0.45)) {
    const x = Math.round(kep(tamX - w / 2, le, vw - w - le));
    const y = Math.round(khung.y + khung.h + khe);
    return {
      x, y, w,
      muiTen: 'tren',
      muiTenLech: Math.round(kep(tamX - x, 28, w - 28)),
      laDienThoai: false,
    };
  }

  if (khoangTren >= caoThe + khe) {
    const x = Math.round(kep(tamX - w / 2, le, vw - w - le));
    const y = Math.round(khung.y - khe - caoThe);
    return {
      x, y, w,
      muiTen: 'duoi',
      muiTenLech: Math.round(kep(tamX - x, 28, w - 28)),
      laDienThoai: false,
    };
  }

  /* Nếu phần tử rất cao (như cả khối chọn 4 nhóm), thử đậu sang bên PHẢI hoặc TRÁI. */
  if (khoangPhai >= w + khe) {
    const x = Math.round(khung.x + khung.w + khe);
    const y = Math.round(kep(tamY - caoThe / 2, le, vh - caoThe - le));
    return {
      x, y, w,
      muiTen: 'trai',
      muiTenLech: Math.round(kep(tamY - y, 28, caoThe - 28)),
      laDienThoai: false,
    };
  }

  if (khoangTrai >= w + khe) {
    const x = Math.round(khung.x - khe - w);
    const y = Math.round(kep(tamY - caoThe / 2, le, vh - caoThe - le));
    return {
      x, y, w,
      muiTen: 'phai',
      muiTenLech: Math.round(kep(tamY - y, 28, caoThe - 28)),
      laDienThoai: false,
    };
  }

  /* Dự phòng khi ô sáng gần kín màn hình: đặt ở phía còn nhiều chỗ hơn. */
  const y = khoangTren > khoangDuoi
    ? le
    : Math.max(le, Math.round(vh - caoThe - le));
  return {
    x: Math.round((vw - w) / 2),
    y, w,
    muiTen: null,
    muiTenLech: 0,
    laDienThoai: false,
  };
}

export default function HuongDanBanDau() {
  /* Đặt tên là dich chứ không phải t: trong tệp này t đã dùng cho bộ hẹn giờ. */
  const { t: dich, ngonNgu } = useNgonNgu();
  const maskId = `hd-mask-${useId().replace(/:/g, '')}`;

  const [hien, setHien] = useState(false);
  const [buoc, setBuoc] = useState(0);
  const [huong, setHuong] = useState<1 | -1>(1);

  /* CHỌN BỘ BƯỚC THEO KÍCH THƯỚC MÀN HÌNH.

     Đo MỘT LẦN lúc mở hướng dẫn rồi giữ nguyên suốt vòng. Không đo lại giữa
     chừng: xoay ngang điện thoại mà đổi bộ bước thì số bước đổi, bà con đang ở
     bước 5 trên 12 bỗng nhảy sang bước 5 trên 11 của bộ khác — lạc hẳn. */
  const [boBuoc, setBoBuoc] = useState<Buoc[]>(BUOC_MAY_TINH);
  const [dangDoc, setDangDoc] = useState(false);

  /* Toạ độ thẻ hướng dẫn — cập nhật mượt bằng GPU translate3d thay vì bật tắt
     class top-4 / bottom-4 (CSS không nội suy được giữa top và bottom nên bản
     cũ bị nhảy giật tức thì mỗi khi đổi nửa màn hình). */
  const [viTriThe, setViTriThe] = useState<ViTriThe | null>(null);
  const daCoViTriRef = useRef(false);

  /* Phần tử DOM cho mặt nạ SVG + vòng sáng GPU + thẻ hướng dẫn.
     Cập nhật thẳng qua ref trong requestAnimationFrame -> 0 lần render React
     thừa trên mỗi khung hình khi cuộn hay lướt giữa hai nút. */
  const oKhoetRef = useRef<SVGRectElement | null>(null);
  const vongSangRef = useRef<HTMLDivElement | null>(null);
  const theRef = useRef<HTMLDivElement | null>(null);
  const caoTheRef = useRef<number>(245);

  /* Giữ chính phần tử đang khoanh để đo lại mỗi khi trang đổi bố cục. */
  const phanTuDangKhoanh = useRef<Element | null>(null);
  /* Theo dõi kích thước chính phần tử đang khoanh (gắn động mỗi khi tìm thấy). */
  const theoDoiPhanTuRef = useRef<ResizeObserver | null>(null);
  /* Khung đích dự kiến (đã tính sẵn sau cuộn) dùng khi thẻ đổi chiều cao. */
  const khungDichRef = useRef<KhungSang | null>(null);

  /* Trạng thái động cơ rAF duy nhất điều phối đồng bộ cả cuộn trang + lướt ô sáng. */
  const dongCoRef = useRef({
    cur: null as KhungSang | null,
    op: 0,
    from: null as KhungSang | null,
    fromOp: 0,
    glideStart: 0,
    glideDur: 0,
    dangLuot: false,
    scrollStartY: 0,
    scrollTargetY: 0,
    scrollStart: 0,
    scrollDur: 0,
    dangCuon: false,
    settleUntil: 0,
    rafId: null as number | null,
  });

  /* Giữ bộ điều khiển của lần đọc đang chạy để dừng được khi chuyển bước. */
  const dieuKhienDoc = useRef<DieuKhienDoc | null>(null);
  /* Ghi điểm chạm cho cử chỉ vuốt ngang chuyển bước trên điện thoại. */
  const chamRef = useRef<{ x: number; y: number } | null>(null);

  const navigate = useNavigate();
  const location = useLocation();

  const dungDoc = useCallback(() => {
    dieuKhienDoc.current?.dung();
    dieuKhienDoc.current = null;
    setDangDoc(false);
  }, []);

  /** Ghi thẳng khung sáng vào SVG mask + vòng sáng GPU (0 React re-render). */
  const veKhungSang = useCallback((k: KhungSang | null, op: number) => {
    const oKhoet = oKhoetRef.current;
    const vong = vongSangRef.current;
    const mo = kep(op, 0, 1);

    if (!k || mo <= 0.005) {
      if (oKhoet) {
        oKhoet.setAttribute('fill-opacity', '0');
        oKhoet.setAttribute('width', '0');
        oKhoet.setAttribute('height', '0');
      }
      if (vong) {
        vong.style.opacity = '0';
      }
      return;
    }

    if (oKhoet) {
      oKhoet.setAttribute('x', k.x.toFixed(2));
      oKhoet.setAttribute('y', k.y.toFixed(2));
      oKhoet.setAttribute('width', k.w.toFixed(2));
      oKhoet.setAttribute('height', k.h.toFixed(2));
      oKhoet.setAttribute('rx', k.rx.toFixed(2));
      oKhoet.setAttribute('ry', k.rx.toFixed(2));
      oKhoet.setAttribute('fill-opacity', mo.toFixed(3));
    }

    if (vong) {
      vong.style.transform = `translate3d(${k.x.toFixed(2)}px, ${k.y.toFixed(2)}px, 0)`;
      vong.style.width = `${k.w.toFixed(2)}px`;
      vong.style.height = `${k.h.toFixed(2)}px`;
      vong.style.borderRadius = `${k.rx.toFixed(2)}px`;
      vong.style.opacity = mo.toFixed(3);
    }
  }, []);

  /** Cập nhật vị trí thẻ hướng dẫn dựa trên khung sáng hiện tại/dự kiến. */
  const capNhatViTriThe = useCallback((khung: KhungSang | null) => {
    khungDichRef.current = khung;
    const { vw, vh } = layKichThuocKhungNhin();
    const cao = theRef.current?.offsetHeight || caoTheRef.current;
    caoTheRef.current = cao;
    const moi = tinhViTriThe(khung, vw, vh, cao);
    setViTriThe((cu) => {
      if (
        cu &&
        Math.abs(cu.x - moi.x) < 1 &&
        Math.abs(cu.y - moi.y) < 1 &&
        Math.abs(cu.w - moi.w) < 1 &&
        cu.muiTen === moi.muiTen &&
        Math.abs(cu.muiTenLech - moi.muiTenLech) < 1 &&
        cu.laDienThoai === moi.laDienThoai
      ) {
        return cu;
      }
      return moi;
    });
  }, []);

  /** Vòng lặp rAF duy nhất: đồng bộ cuộn êm + lướt ô sáng + bám sát phần tử đang chuyển động. */
  const kichHoatDongCo = useCallback(() => {
    const dc = dongCoRef.current;
    if (dc.rafId !== null) return;

    const buocFrame = (now: number) => {
      dc.rafId = null;

      /* 1. Nhịp cuộn trang êm tự quản lý (behavior: 'instant' mỗi khung hình
            để không bị xung đột với html { scroll-behavior: smooth }). */
      if (dc.dangCuon) {
        const u = dc.scrollDur <= 0 ? 1 : kep((now - dc.scrollStart) / dc.scrollDur, 0, 1);
        const yMoi = noiSuy(dc.scrollStartY, dc.scrollTargetY, easeInOutCubic(u));
        window.scrollTo({ top: yMoi, behavior: 'instant' as ScrollBehavior });
        if (u >= 1) dc.dangCuon = false;
      }

      /* 2. Đo trực tiếp phần tử đang khoanh ngay trong cùng khung hình vừa cuộn
            -> ô sáng dính chặt phần tử, không bao giờ bị trễ hay giật bóng. */
      const { vw, vh } = layKichThuocKhungNhin();
      const el = phanTuDangKhoanh.current;
      const mucTieu = el && document.body.contains(el) ? doKhungSang(el, vw, vh) : null;
      const opDich = mucTieu ? 1 : 0;

      if (dc.dangLuot) {
        const u = dc.glideDur <= 0 ? 1 : kep((now - dc.glideStart) / dc.glideDur, 0, 1);
        const e = easeOutQuart(u);

        if (mucTieu && dc.from) {
          dc.cur = {
            x: noiSuy(dc.from.x, mucTieu.x, e),
            y: noiSuy(dc.from.y, mucTieu.y, e),
            w: noiSuy(dc.from.w, mucTieu.w, e),
            h: noiSuy(dc.from.h, mucTieu.h, e),
            rx: noiSuy(dc.from.rx, mucTieu.rx, e),
          };
          dc.op = noiSuy(dc.fromOp, opDich, Math.min(1, e * 1.35));
        } else if (!mucTieu && dc.from) {
          /* Tan mờ gọn vào nền tối khi bước hiện tại không có ô sáng cụ thể. */
          dc.cur = dc.from;
          dc.op = noiSuy(dc.fromOp, 0, e);
        } else {
          dc.cur = mucTieu;
          dc.op = opDich;
        }

        if (u >= 1) {
          dc.dangLuot = false;
          dc.cur = mucTieu;
          dc.op = opDich;
        }
      } else {
        dc.cur = mucTieu;
        dc.op = opDich;
      }

      veKhungSang(dc.cur, dc.op);

      /* Tiếp tục chạy cho tới khi cuộn xong, lướt xong và hết cửa sổ ổn định bố cục;
         sau đó tự dừng hoàn toàn -> 0% CPU khi đứng yên. */
      const conCanChay = dc.dangCuon || dc.dangLuot || now < dc.settleUntil;
      if (conCanChay) {
        dc.rafId = requestAnimationFrame(buocFrame);
      } else if (mucTieu) {
        /* Khi mọi hiệu ứng trượt của trang đã yên hẳn, chốt lại vị trí thẻ một nhịp
           cho thật chuẩn với toạ độ cuối cùng. */
        capNhatViTriThe(mucTieu);
      }
    };

    dc.rafId = requestAnimationFrame(buocFrame);
  }, [capNhatViTriThe, veKhungSang]);

  /** Khởi động một nhịp cuộn êm có thể huỷ ngang ngay khi người dùng bấm bước khác. */
  const batDauCuonEm = useCallback((dichY: number) => {
    const dc = dongCoRef.current;
    const maxY = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    const yChuan = kep(dichY, 0, maxY);
    const khoangCach = Math.abs(yChuan - window.scrollY);
    if (khoangCach < 8) {
      dc.dangCuon = false;
      return window.scrollY;
    }
    if (giamChuyenDong()) {
      window.scrollTo({ top: yChuan, behavior: 'instant' as ScrollBehavior });
      dc.dangCuon = false;
      return yChuan;
    }
    dc.scrollStartY = window.scrollY;
    dc.scrollTargetY = yChuan;
    dc.scrollStart = performance.now();
    /* Tốc độ cuộn tự thích ứng theo quãng đường (240ms - 380ms): ngắn thì nhanh gọn, dài thì êm. */
    dc.scrollDur = kep(Math.round(210 + khoangCach * 0.24), 240, 380);
    dc.dangCuon = true;
    kichHoatDongCo();
    return yChuan;
  }, [kichHoatDongCo]);

  /** Bắt đầu lướt ô sáng từ vị trí đang hiển thị sang phần tử mới (hoặc mờ dần nếu không có). */
  const batDauLuotKhung = useCallback((el: Element | null, dichYDuKien = 0) => {
    const dc = dongCoRef.current;
    const now = performance.now();
    const { vw, vh } = layKichThuocKhungNhin();
    const khongDong = giamChuyenDong();

    phanTuDangKhoanh.current = el;
    theoDoiPhanTuRef.current?.disconnect();
    if (el && theoDoiPhanTuRef.current) {
      theoDoiPhanTuRef.current.observe(el);
    }

    if (!el) {
      if (dc.cur && dc.op > 0.02 && !khongDong) {
        dc.from = { ...dc.cur };
        dc.fromOp = dc.op;
        dc.glideStart = now;
        dc.glideDur = 220;
        dc.dangLuot = true;
      } else {
        dc.cur = null;
        dc.op = 0;
        dc.dangLuot = false;
        veKhungSang(null, 0);
      }
      dc.settleUntil = now + 260;
      capNhatViTriThe(null);
      kichHoatDongCo();
      return;
    }

    const mucTieuHienTai = doKhungSang(el, vw, vh);
    const mucTieuSauCuon = doKhungSang(el, vw, vh, dichYDuKien);
    if (!mucTieuHienTai) {
      capNhatViTriThe(null);
      return;
    }

    if (khongDong) {
      dc.cur = mucTieuHienTai;
      dc.op = 1;
      dc.dangLuot = false;
      dc.settleUntil = now + 120;
      veKhungSang(mucTieuHienTai, 1);
      capNhatViTriThe(mucTieuSauCuon ?? mucTieuHienTai);
      kichHoatDongCo();
      return;
    }

    /* Lần đầu xuất hiện (hoặc đi từ bước không có ô sáng): mở rộng nhẹ ngay quanh
       mục tiêu thay vì bay vút từ góc (0, 0) trên trái màn hình. */
    if (!dc.cur || dc.op < 0.08) {
      const thuNho = 10;
      dc.from = {
        x: mucTieuHienTai.x + thuNho,
        y: mucTieuHienTai.y + thuNho,
        w: Math.max(8, mucTieuHienTai.w - thuNho * 2),
        h: Math.max(8, mucTieuHienTai.h - thuNho * 2),
        rx: mucTieuHienTai.rx,
      };
      dc.fromOp = 0;
      dc.glideDur = 300;
    } else {
      /* Đang có ô sáng -> lướt nối tiếp mượt ngay từ toạ độ khung hình hiện tại,
         kể cả khi người dùng bấm Tiếp tục / Quay lại liên tục giữa chừng. */
      dc.from = { ...dc.cur };
      dc.fromOp = dc.op;
      dc.glideDur = 340;
    }

    dc.glideStart = now;
    dc.dangLuot = true;
    /* Giữ đồng bộ liên tục thêm 520ms để bám sát hiệu ứng trượt vào của biểu mẫu
       hoặc thanh chức năng dưới chân điện thoại. */
    dc.settleUntil = now + 520;
    capNhatViTriThe(mucTieuSauCuon ?? mucTieuHienTai);
    kichHoatDongCo();
  }, [capNhatViTriThe, kichHoatDongCo, veKhungSang]);

  const doiBuoc = useCallback((buocMoi: number) => {
    setBuoc((cu) => {
      const chuan = kep(buocMoi, 0, boBuoc.length - 1);
      if (chuan !== cu) setHuong(chuan > cu ? 1 : -1);
      return chuan;
    });
  }, [boBuoc.length]);

  const buocTiep = useCallback((buocLech: 1 | -1) => {
    setBuoc((cu) => {
      const chuan = kep(cu + buocLech, 0, boBuoc.length - 1);
      if (chuan !== cu) setHuong(buocLech);
      return chuan;
    });
  }, [boBuoc.length]);

  /* Hiện lần đầu. Chờ một nhịp cho trang vẽ xong, nếu không thẻ hướng dẫn nhảy
     ra khi trang còn trống, bà con chưa kịp nhìn thấy gì đã bị che. */
  useEffect(() => {
    let daHuy = false;
    try {
      /* CHỈ TỰ HIỆN Ở LẦN ĐẦU VÀO WEB (ADR-003 việc 27). Trước đây hiện lại mỗi
         giờ; người vận hành chọn một lần duy nhất — ai cần xem lại thì bấm
         "Xem hướng dẫn" ở chân trang hoặc trang Giới thiệu.
         Nhớ trên trình duyệt: đổi máy hoặc xoá dữ liệu trình duyệt thì hiện lại. */
      if (localStorage.getItem(KHOA)) return;
    } catch {
      return;   // trình duyệt chặn lưu trữ -> không hiện, tránh hiện lại mỗi lần
    }
    /* ⚠️ CHỈ TỰ HIỆN Ở TRANG CHỦ (ND-050, utils/huongDan.ts).

       Ba lỗi thật dẫn tới luật này: hướng dẫn cắt ngang bà con đang viết ở trang
       gửi ý kiến (chèn dữ liệu mẫu, khoá nút gửi); phủ lên khu cán bộ ở máy mới
       (bấm Thêm, Thôi không ăn) rồi kéo cán bộ về trang chủ; kéo người mở liên
       kết báo ngập /diem-den về trang chủ đúng lúc mưa lớn. Chặn từng trang thì
       sót trang sau — nên chỉ cho trang chủ.

       Hiệu ứng chạy lại khi đổi trang: người vào từ liên kết sâu rồi bấm về
       trang chủ vẫn được hướng dẫn. */
    if (hien || !duocTuHienHuongDan(location.pathname)) return;
    const t = setTimeout(() => {
      if (daHuy) return;
      /* ⚠️ KIỂM ĐƯỜNG DẪN ĐÚNG LÚC ĐỊNH HIỆN, không phải lúc trang mới mở.

         Kiểm lúc mở thì sai: bà con mở trang chủ rồi bấm sang gửi ý kiến trong
         vòng một giây, hẹn giờ đã đặt xong nên hướng dẫn vẫn nhảy ra giữa lúc
         họ bắt đầu viết. */
      if (!duocTuHienHuongDan(window.location.pathname)) return;
      setBoBuoc(window.innerWidth < 768 ? BUOC_DIEN_THOAI : BUOC_MAY_TINH);
      setHuong(1);
      setBuoc(0);
      setHien(true);
    }, 1200);
    return () => { daHuy = true; clearTimeout(t); };
  }, [location.pathname, hien]);

  /* Cho phép mở lại từ nơi khác (trang Giới thiệu) bằng một sự kiện chung. */
  useEffect(() => {
    const moLai = () => {
      setBoBuoc(window.innerWidth < 768 ? BUOC_DIEN_THOAI : BUOC_MAY_TINH);
      setHuong(1);
      setBuoc(0);
      setHien(true);
    };
    window.addEventListener('ans:mo-huong-dan', moLai);
    return () => window.removeEventListener('ans:mo-huong-dan', moLai);
  }, []);

  /* Dọn sạch động cơ khi đóng hướng dẫn để lần mở lại sau bắt đầu sạch sẽ. */
  useEffect(() => {
    if (hien) return;
    const dc = dongCoRef.current;
    if (dc.rafId !== null) {
      cancelAnimationFrame(dc.rafId);
      dc.rafId = null;
    }
    dc.cur = null;
    dc.op = 0;
    dc.from = null;
    dc.dangLuot = false;
    dc.dangCuon = false;
    phanTuDangKhoanh.current = null;
    khungDichRef.current = null;
    daCoViTriRef.current = false;
    setViTriThe(null);
  }, [hien]);

  /* Đánh dấu thẻ đã có toạ độ sau khung đầu để các bước sau trượt mượt bằng translate3d. */
  useEffect(() => {
    if (hien && viTriThe && !daCoViTriRef.current) {
      const id = requestAnimationFrame(() => {
        daCoViTriRef.current = true;
      });
      return () => cancelAnimationFrame(id);
    }
  }, [hien, viTriThe]);

  /* Chuyển trang, đổi bước biểu mẫu, cuộn êm và lướt ô sáng tới phần tử đích. */
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

    if (!b.chon) {
      batDauLuotKhung(null);
      /* KHÔNG có nút cụ thể để khoanh, nhưng vẫn đưa màn hình về đầu biểu mẫu
         để không rơi xuống chân trang khi màn hình mới ngắn hơn bước trước. */
      if (b.buocForm) {
        const hen = setTimeout(() => {
          const khu = document.querySelector('[data-khu-bieu-mau]');
          if (khu) {
            const le = window.innerWidth < 768 ? 72 : 88;
            batDauCuonEm(window.scrollY + khu.getBoundingClientRect().top - le);
          } else {
            batDauCuonEm(0);
          }
        }, 120);
        return () => clearTimeout(hen);
      }
      return;
    }

    /* TÌM PHẦN TỬ NHANH THEO KHUNG HÌNH (rAF), KHÔNG CHỜ CỨNG 250ms + 550ms.

       Bước nào đổi màn hình biểu mẫu thì phần tử chỉ xuất hiện sau khi bước cũ
       rời đi (~180ms). Dò mỗi khung hình (tối đa 2.2 giây) giúp bắt trúng ngay
       lúc phần tử vừa xuất hiện, đồng thời cuộn êm và lướt ô sáng cùng một nhịp. */
    let daHuy = false;
    let rafTim: number | null = null;
    const mocBatDau = performance.now();

    const doThu = () => {
      if (daHuy) return;
      const el = timPhanTuHien(b.chon!);
      if (!el) {
        if (performance.now() - mocBatDau < 2200) {
          rafTim = requestAnimationFrame(doThu);
        } else {
          batDauLuotKhung(null);
        }
        return;
      }

      const { vw, vh } = layKichThuocKhungNhin();
      const laDienThoai = vw < 768;
      const r = el.getBoundingClientRect();
      let dichYDuKien = 0;

      /* Đưa phần tử lên GẦN ĐỈNH màn hình, nhường nửa dưới cho thẻ hướng dẫn.
         Trước đây cuộn ra GIỮA: trên điện thoại nhỏ (360×640) hai bên đều thiếu
         chỗ nên thẻ che mất phần tử đang chỉ (P76). Nếu phần tử đã nằm gọn trong
         vùng nhìn an toàn thì KHÔNG cuộn thừa — giữ khung hình yên tĩnh, mượt mà. */
      if (!namTrongKhungCoDinh(el)) {
        const le = Math.round(Math.min(laDienThoai ? 80 : 104, vh * 0.12));
        const caoThe = theRef.current?.offsetHeight || caoTheRef.current;
        const daGonTrongVung = laDienThoai
          ? (r.top >= 64 && r.bottom <= vh - caoThe - 28) ||
            (r.top >= caoThe + 28 && r.bottom <= vh - 18)
          : r.top >= 76 && r.bottom <= vh - 48 && Math.abs(r.top - le) < 130;

        if (!daGonTrongVung) {
          const yCu = window.scrollY;
          const yDich = batDauCuonEm(yCu + r.top - le);
          dichYDuKien = yDich - yCu;
        } else {
          dongCoRef.current.dangCuon = false;
        }
      } else {
        dongCoRef.current.dangCuon = false;
      }

      batDauLuotKhung(el, dichYDuKien);
    };

    /* Chờ đúng 1 khung hình để biểu mẫu kịp nhận sự kiện đổi bước nếu có. */
    rafTim = requestAnimationFrame(doThu);
    return () => {
      daHuy = true;
      if (rafTim !== null) cancelAnimationFrame(rafTim);
    };
  }, [hien, buoc, boBuoc, location.pathname, navigate, batDauCuonEm, batDauLuotKhung]);

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
    const loi = `${dich(b.khoaTieuDe)}. ${dich(b.khoaNoiDung)}`;
    /* Chờ một nhịp ngắn cho chữ bước mới lướt xong rồi mới đọc. */
    const t = setTimeout(() => {
      setDangDoc(true);
      dieuKhienDoc.current = docTiengViet(loi, () => setDangDoc(false), ngonNgu);
    }, 420);
    return () => { clearTimeout(t); dungDoc(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hien, buoc]);

  /* BÁM SÁT PHẦN TỬ VÀ KÍCH THƯỚC THẺ KHI CUỘN HOẶC ĐỔI CỠ CỬA SỔ.

     Cập nhật qua đúng một rAF nên 0ms trễ, không bị bóng mờ hay tụt phía sau
     như kiểu transition-all duration-300 trước đây. */
  useEffect(() => {
    if (!hien) return;

    const dongBoNgay = () => {
      const dc = dongCoRef.current;
      const { vw, vh } = layKichThuocKhungNhin();
      const el = phanTuDangKhoanh.current;
      if (!dc.dangLuot && !dc.dangCuon) {
        const k = el && document.body.contains(el) ? doKhungSang(el, vw, vh) : null;
        dc.cur = k;
        dc.op = k ? 1 : 0;
        veKhungSang(k, dc.op);
        capNhatViTriThe(k);
      } else {
        kichHoatDongCo();
      }
    };

    let rafSync: number | null = null;
    const lenLichDongBo = () => {
      if (rafSync !== null) return;
      rafSync = requestAnimationFrame(() => {
        rafSync = null;
        dongBoNgay();
      });
    };

    window.addEventListener('scroll', lenLichDongBo, { passive: true });
    window.addEventListener('resize', lenLichDongBo);
    window.visualViewport?.addEventListener('resize', lenLichDongBo);

    const theoDoiThe = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => {
          if (theRef.current) {
            caoTheRef.current = theRef.current.offsetHeight;
            /* Cập nhật ngay vị trí thẻ khi chiều cao nội dung đổi (kể cả khi ô sáng
               đang lướt) để thẻ ôm sát mép mượt mà, không bị giật trễ nhịp sau. */
            capNhatViTriThe(khungDichRef.current);
          }
        })
      : null;

    const theoDoiPhanTu = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(lenLichDongBo)
      : null;
    theoDoiPhanTuRef.current = theoDoiPhanTu;

    if (theoDoiThe && theRef.current) theoDoiThe.observe(theRef.current);
    if (theoDoiPhanTu && phanTuDangKhoanh.current) {
      theoDoiPhanTu.observe(phanTuDangKhoanh.current);
    }

    return () => {
      if (rafSync !== null) cancelAnimationFrame(rafSync);
      window.removeEventListener('scroll', lenLichDongBo);
      window.removeEventListener('resize', lenLichDongBo);
      window.visualViewport?.removeEventListener('resize', lenLichDongBo);
      theoDoiThe?.disconnect();
      theoDoiPhanTu?.disconnect();
      theoDoiPhanTuRef.current = null;
    };
  }, [hien, capNhatViTriThe, kichHoatDongCo, veKhungSang]);

  /* KHOÁ CUỘN TAY TRONG LÚC HƯỚNG DẪN.

     Vì sao cần: hướng dẫn tự cuộn tới đúng nút rồi khoanh sáng. Nếu bà con lỡ
     vuốt màn hình thì nút trôi đi mất, ô sáng phải chạy theo, mà lời đọc đang
     nói về nút đó — rối hẳn.

     ⚠️ CHẶN ĐÚNG THAO TÁC CỦA TAY, KHÔNG dùng overflow hidden trên thẻ body.
     Đặt overflow hidden thì chặn luôn cả phần cuộn bằng mã. Cách này chỉ chặn
     lăn chuột và vuốt tay bên ngoài thẻ; vẫn cho cuộn và vuốt BÊN TRONG thẻ
     hướng dẫn. */
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
      /* Mũi tên trái/phải để lùi/tới. Bước cuối thì → đứng yên, không tự đóng:
         đóng là ghi "đã xem", phải do bà con bấm nút. Cố ý KHÔNG gán Esc cho
         Bỏ qua — lỡ tay một phím là mất hẳn hướng dẫn. */
      if (e.key === 'ArrowRight') buocTiep(1);
      if (e.key === 'ArrowLeft') buocTiep(-1);
    };

    window.addEventListener('wheel', chan, { passive: false });
    window.addEventListener('touchmove', chan, { passive: false });
    window.addEventListener('keydown', chanPhim);
    return () => {
      window.removeEventListener('wheel', chan);
      window.removeEventListener('touchmove', chan);
      window.removeEventListener('keydown', chanPhim);
    };
  }, [hien, buocTiep]);

  function dong() {
    /* Ghi đã xem (lưu mốc thời gian đóng): từ nay không tự hiện nữa */
    try { localStorage.setItem(KHOA, String(Date.now())); } catch { /* bỏ qua */ }
    dungDoc();
    /* Trả biểu mẫu về bước 1 và mở khoá nút gửi. Không báo kết thúc thì biểu
       mẫu kẹt ở màn hình xác nhận với nút gửi bị khoá — bà con không gửi được
       mà cũng không hiểu vì sao. */
    window.dispatchEvent(new Event('ans:huong-dan-ket-thuc'));
    setHien(false);
  }

  const b = boBuoc[buoc] ?? boBuoc[0];
  const laCuoi = buoc === boBuoc.length - 1;
  const tienDo = (buoc + 1) / boBuoc.length;
  const khongChuyenDong = giamChuyenDong();

  function docLai() {
    if (dangDoc) { dungDoc(); return; }
    setDangDoc(true);
    dieuKhienDoc.current = docTiengViet(
      `${dich(b.khoaTieuDe)}. ${dich(b.khoaNoiDung)}`, () => setDangDoc(false), ngonNgu);
  }

  /* Cử chỉ vuốt ngang trên thẻ (điện thoại): vuốt trái -> Tiếp tục, vuốt phải -> Quay lại.
     Chỉ nhận khi cử chỉ ngang rõ rệt để không vướng lúc cuộn dọc ở chế độ chữ lớn. */
  function khiBatDauCham(e: TouchEvent<HTMLDivElement>) {
    if (e.touches.length !== 1) return;
    chamRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }

  function khiKetThucCham(e: TouchEvent<HTMLDivElement>) {
    if (!chamRef.current || e.changedTouches.length !== 1) return;
    const dx = e.changedTouches[0].clientX - chamRef.current.x;
    const dy = e.changedTouches[0].clientY - chamRef.current.y;
    chamRef.current = null;
    if (Math.abs(dx) > 56 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (dx < 0 && !laCuoi) doiBuoc(buoc + 1);
      else if (dx > 0 && buoc > 0) doiBuoc(buoc - 1);
    }
  }

  /* Toạ độ hiển thị cho thẻ ngay từ khung đầu (không bao giờ nhảy từ 0,0). */
  const viTriHien = viTriThe ?? (typeof window !== 'undefined'
    ? tinhViTriThe(null, window.innerWidth, window.innerHeight, caoTheRef.current)
    : { x: 12, y: 12, w: 360, muiTen: null, muiTenLech: 0, laDienThoai: true });

  return createPortal(
    <AnimatePresence>
      {hien && (
        <motion.div
          key="hd-lop-phu"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: khongChuyenDong ? 0.01 : 0.24, ease: DUONG_CONG_EM }}
          className="fixed inset-0 z-[100]"
          /* Không cho bấm xuyên qua lớp phủ: bà con đang xem hướng dẫn mà lỡ bấm
             trúng nút bên dưới thì lạc mất mạch. */
          style={{ pointerEvents: 'auto' }}
        >
          {/* LỚP PHỦ MẶT NẠ SVG — khoét lỗ mượt trên GPU, thay hẳn box-shadow 9999px
              gây giật nặng mỗi khung hình trên điện thoại. */}
          <svg
            className="pointer-events-none fixed inset-0 h-full w-full"
            aria-hidden="true"
          >
            <defs>
              <mask id={maskId}>
                <rect x="0" y="0" width="100%" height="100%" fill="white" />
                <rect
                  ref={oKhoetRef}
                  x={0}
                  y={0}
                  width={0}
                  height={0}
                  rx={14}
                  ry={14}
                  fill="black"
                  fillOpacity={0}
                />
              </mask>
            </defs>
            <rect
              x="0"
              y="0"
              width="100%"
              height="100%"
              fill="rgba(15, 23, 42, 0.70)"
              mask={`url(#${maskId})`}
            />
          </svg>

          {/* VIỀN SÁNG GPU BAO QUANH Ô ĐANG CHỈ + vầng sáng thở êm dịu.
              Di chuyển hoàn toàn bằng translate3d trong rAF -> 0ms trễ khi cuộn. */}
          <div
            ref={vongSangRef}
            aria-hidden="true"
            className="pointer-events-none fixed left-0 top-0"
            style={{
              opacity: 0,
              willChange: 'transform, width, height, opacity',
              contain: 'layout style',
              boxShadow:
                '0 0 0 2.5px rgba(52, 211, 153, 0.95), 0 0 24px 2px rgba(16, 185, 129, 0.35), inset 0 0 0 1px rgba(255, 255, 255, 0.5)',
            }}
          >
            <div
              className="hd-vong-tho pointer-events-none absolute -inset-[5px] rounded-[inherit] border-2 border-primary-300/80"
            />
          </div>

          {/* THẺ HƯỚNG DẪN CỐ ĐỊNH KHUNG — không huỷ/tạo lại mỗi bước.
              Chỉ lướt mượt tới vị trí mới qua GPU transform (x, y) và trượt nhẹ
              phần tiêu đề/nội dung bên trong. */}
          <motion.div
            ref={theRef}
            data-huong-dan-the
            role="dialog"
            aria-modal="true"
            aria-labelledby="hd-tieu-de"
            aria-describedby="hd-noi-dung"
            onTouchStart={khiBatDauCham}
            onTouchEnd={khiKetThucCham}
            initial={
              khongChuyenDong
                ? { opacity: 1, x: viTriHien.x, y: viTriHien.y, scale: 1 }
                : { opacity: 0, x: viTriHien.x, y: viTriHien.y + 14, scale: 0.96 }
            }
            animate={{
              opacity: 1,
              x: viTriHien.x,
              y: viTriHien.y,
              scale: 1,
            }}
            exit={
              khongChuyenDong
                ? { opacity: 0 }
                : { opacity: 0, y: viTriHien.y + 10, scale: 0.97 }
            }
            transition={
              khongChuyenDong
                ? { duration: 0.01 }
                : {
                    x: { duration: daCoViTriRef.current ? 0.36 : 0, ease: DUONG_CONG_EM },
                    y: { duration: daCoViTriRef.current ? 0.36 : 0.28, ease: DUONG_CONG_EM },
                    opacity: { duration: 0.22, ease: 'easeOut' },
                    scale: { duration: 0.26, ease: DUONG_CONG_EM },
                  }
            }
            style={{
              width: viTriHien.w,
              maxHeight: 'calc(100dvh - 28px)',
              willChange: 'transform, opacity',
              boxShadow:
                '0 22px 50px -14px rgba(15, 23, 42, 0.38), 0 4px 16px -4px rgba(15, 23, 42, 0.14)',
            }}
            className="fixed left-0 top-0 flex flex-col rounded-2xl border border-slate-200/90 bg-white dark:border-slate-700/80 dark:bg-slate-900"
          >
            {/* MŨI TÊN CHỈ HƯỚNG (chỉ hiện trên máy tính khi thẻ đậu cạnh ô sáng). */}
            {!viTriHien.laDienThoai && viTriHien.muiTen && (
              <span
                aria-hidden="true"
                className={`pointer-events-none absolute h-3.5 w-3.5 rotate-45 bg-white transition-[left,top] duration-300 ease-out dark:bg-slate-900 ${
                  viTriHien.muiTen === 'tren'
                    ? '-top-[7px] border-l border-t border-slate-200/90 dark:border-slate-700/80'
                    : viTriHien.muiTen === 'duoi'
                      ? '-bottom-[7px] border-b border-r border-slate-200/90 dark:border-slate-700/80'
                      : viTriHien.muiTen === 'trai'
                        ? '-left-[7px] border-b border-l border-slate-200/90 dark:border-slate-700/80'
                        : '-right-[7px] border-r border-t border-slate-200/90 dark:border-slate-700/80'
                }`}
                style={
                  viTriHien.muiTen === 'tren' || viTriHien.muiTen === 'duoi'
                    ? { left: viTriHien.muiTenLech - 7 }
                    : { top: viTriHien.muiTenLech - 7 }
                }
              />
            )}

            {/* THANH TIẾN ĐỘ MỎNG MƯỢT Ở MÉP TRÊN THẺ (scaleX trên GPU). */}
            <div className="h-1 w-full overflow-hidden rounded-t-2xl bg-slate-100 dark:bg-slate-800">
              <motion.div
                className="h-full w-full origin-left bg-gradient-to-r from-primary-600 via-primary-500 to-emerald-400"
                initial={false}
                animate={{ scaleX: tienDo }}
                transition={{ duration: khongChuyenDong ? 0.01 : 0.34, ease: DUONG_CONG_EM }}
              />
            </div>

            {/* Thân thẻ — cho cuộn dọc bên trong phòng khi bật chữ lớn 125%. */}
            <div className="overflow-y-auto px-5 pb-4 pt-4">
              {/* Hàng đầu: số bước, nút nghe đọc to (kèm sóng âm êm) và gợi ý phím trên máy tính. */}
              <div className="mb-2.5 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center rounded-lg bg-primary-600 px-2.5 py-1 text-xs font-extrabold tabular-nums text-white shadow-sm">
                    {buoc + 1}/{boBuoc.length}
                  </span>
                  <button
                    type="button"
                    onClick={docLai}
                    className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition-[transform,background-color,color] duration-150 active:scale-[0.97] ${
                      dangDoc
                        ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200/80 dark:bg-emerald-900/35 dark:text-emerald-200'
                        : 'bg-primary-50 text-primary-700 hover:bg-primary-100 dark:bg-primary-900/25 dark:text-primary-300 dark:hover:bg-primary-900/40'
                    }`}
                  >
                    {dangDoc ? (
                      <>
                        <span className="inline-flex h-3.5 items-end gap-[2px]" aria-hidden="true">
                          <span className="hd-song-am h-full w-[2.5px] rounded-full bg-current" style={{ animationDelay: '0ms' }} />
                          <span className="hd-song-am h-full w-[2.5px] rounded-full bg-current" style={{ animationDelay: '150ms' }} />
                          <span className="hd-song-am h-full w-[2.5px] rounded-full bg-current" style={{ animationDelay: '300ms' }} />
                        </span>
                        <VolumeX className="h-4 w-4" />
                      </>
                    ) : (
                      <Volume2 className="h-4 w-4" />
                    )}
                    {dangDoc ? dich('hd.stopRead') : dich('hd.listenAgain')}
                  </button>
                </div>

                {/* Gợi ý phím tắt kín đáo trên máy tính */}
                <span
                  aria-hidden="true"
                  className="hidden select-none items-center gap-1 text-[11px] font-medium text-slate-400 dark:text-slate-500 sm:inline-flex"
                >
                  <kbd className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-sans text-[10px] font-semibold text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
                    ←
                  </kbd>
                  <kbd className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-sans text-[10px] font-semibold text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
                    →
                  </kbd>
                </span>
              </div>

              {/* NỘI DUNG BƯỚC — trượt ngang nhẹ theo chiều đi tới / quay lại,
                  không nhấp nháy vỏ thẻ hay làm nút nhảy dưới ngón tay. */}
              <div className="mb-4 overflow-hidden">
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={`${buoc}-${ngonNgu}`}
                    initial={khongChuyenDong ? { opacity: 1 } : { opacity: 0, x: huong * 16 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={khongChuyenDong ? { opacity: 0 } : { opacity: 0, x: huong * -16 }}
                    transition={{ duration: khongChuyenDong ? 0.01 : 0.2, ease: DUONG_CONG_EM }}
                  >
                    {/* BƯỚC CUỐI HIỆN ĐÚNG LỜI CỦA NÓ. Trước đây tiêu đề và lời bị thay bằng
                        "Hoàn tất hướng dẫn" trong khi máy vẫn đọc lời bước Tra cứu — tai
                        nghe một đằng, mắt đọc một nẻo. Lời bước cuối đã có câu chốt
                        "Bà con đã nắm được cách dùng rồi!", không cần thêm màn hình nữa. */}
                    <h3
                      id="hd-tieu-de"
                      className="mb-1.5 flex items-center gap-2 text-base font-extrabold leading-snug text-slate-800 dark:text-slate-100"
                    >
                      {laCuoi && <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" />}
                      {dich(b.khoaTieuDe)}
                    </h3>
                    <p
                      id="hd-noi-dung"
                      className="text-sm leading-relaxed text-slate-600 dark:text-slate-300"
                    >
                      {dich(b.khoaNoiDung)}
                    </p>
                  </motion.div>
                </AnimatePresence>
              </div>

              {/* HÀNG NÚT: Bỏ qua — Quay lại — Tiếp tục, theo yêu cầu người vận hành
                  để cả ba nút nằm một chỗ, bà con khỏi tìm.

                  Bỏ qua là BỎ HẲN (không hiện lại) nên để viền mảnh, chữ nhạt, đứng
                  ngoài cùng bên trái — xa nút Tiếp tục nhất, khó bấm nhầm nhất.

                  Màn hình nhỏ (360px) không đủ chỗ cho ba nút có biểu tượng: chữ bị
                  gãy làm hai dòng ("Bỏ / qua"). Ẩn biểu tượng của hai nút bên trái,
                  giữ chữ trên một dòng — chữ quan trọng hơn hình. */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={dong}
                  aria-label={laCuoi ? dich('common.close') : dich('common.skip')}
                  data-huong-dan="bo-qua"
                  className="flex min-h-[48px] shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-xl px-2.5 py-2.5 text-sm font-bold text-slate-500 transition-[transform,background-color,color] duration-150 hover:bg-slate-100 hover:text-slate-700 active:scale-[0.97] dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                >
                  <X className="hidden h-4 w-4 sm:block" />
                  {laCuoi ? dich('common.close') : dich('common.skip')}
                </button>
                {/* QUAY LẠI: lỡ bấm Tiếp tục khi chưa nghe hết thì xem lại được,
                    không phải đi lại từ đầu. Bước có đổi trang, đổi màn hình biểu
                    mẫu thì hiệu ứng ở trên tự đưa về đúng chỗ như khi đi tới. */}
                {buoc > 0 && (
                  <button
                    type="button"
                    onClick={() => doiBuoc(buoc - 1)}
                    data-huong-dan="quay-lai"
                    className="flex min-h-[48px] shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border-2 border-slate-200 px-3 py-2.5 text-sm font-bold text-slate-600 transition-[transform,background-color,border-color] duration-150 hover:border-slate-300 hover:bg-slate-50 active:scale-[0.97] dark:border-slate-700 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:bg-slate-800"
                  >
                    <ArrowLeft className="hidden h-4 w-4 sm:block" /> {dich('common.back')}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    if (laCuoi) { dong(); navigate('/gui-y-kien'); }
                    else doiBuoc(buoc + 1);
                  }}
                  aria-label={laCuoi ? dich('hd.start') : dich('common.next')}
                  data-huong-dan="tiep-tuc"
                  className="group flex min-h-[48px] flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl bg-primary-600 px-3.5 py-2.5 text-sm font-bold text-white shadow-md shadow-primary-600/20 transition-[transform,background-color,box-shadow] duration-150 hover:bg-primary-700 hover:shadow-lg hover:shadow-primary-600/25 active:scale-[0.98]"
                >
                  {laCuoi ? (
                    <>
                      <Rocket className="h-4 w-4 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                      {dich('hd.start')}
                    </>
                  ) : (
                    <>
                      {dich('common.next')}
                      <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                    </>
                  )}
                </button>
              </div>

              {/* Chấm chỉ vị trí — bấm được để chuyển thẳng tới bước cần xem lại,
                  hiển thị cả chặng đã đi qua để bà con thấy rõ tiến độ. */}
              <div className="mt-3 flex items-center justify-center gap-1.5" role="tablist">
                {boBuoc.map((muc, i) => {
                  const dangChon = i === buoc;
                  const daQua = i < buoc;
                  return (
                    <button
                      key={i}
                      type="button"
                      role="tab"
                      aria-selected={dangChon}
                      aria-label={`${i + 1}/${boBuoc.length}: ${dich(muc.khoaTieuDe)}`}
                      onClick={() => doiBuoc(i)}
                      className="flex h-4 items-center justify-center px-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 rounded-full"
                    >
                      <span
                        className={`block h-1.5 rounded-full transition-[width,background-color] duration-300 ease-out ${
                          dangChon
                            ? 'w-6 bg-primary-600 dark:bg-primary-400'
                            : daQua
                              ? 'w-2 bg-primary-300 hover:bg-primary-400 dark:bg-primary-700'
                              : 'w-1.5 bg-slate-300 hover:bg-slate-400 dark:bg-slate-600'
                        }`}
                      />
                    </button>
                  );
                })}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
