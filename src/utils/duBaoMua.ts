/**
 * DỰ BÁO MƯA — kiểu dữ liệu, cách hiện từng mức, định dạng giờ (P51).
 *
 * Mức do MÁY CHỦ tính (server/src/lib/du-bao-mua.js). Ở đây chỉ kiểm dạng và
 * chọn lời hiện: không tự tính lại mức, không bao giờ suy ra "đang ngập".
 */

export type TrangThaiDuBao = 'co_du_lieu' | 'khong_co_du_lieu' | 'chua_cau_hinh' | 'tat' | 'cau_hinh_sai';
export type MucMua = 0 | 1 | 2 | 3;

/**
 * Lý do lần gần nhất máy chủ không lấy được dự báo (P61) — CHỈ có ở API cán bộ.
 * Máy chủ chỉ gửi mã cố định, không gửi câu lỗi gốc.
 */
export interface LoiDuBao {
  ma: 'http' | 'het_gio' | 'ket_noi' | 'du_lieu_sai' | 'khac';
  /** Mã HTTP Open-Meteo trả, chỉ khi ma = 'http' */
  maHttp?: number;
  luc: string;
}

export interface DuBaoMua {
  trangThai: TrangThaiDuBao;
  muc?: MucMua;
  ma?: string;
  ten?: string;
  lyDo?: string[];
  mua24h?: number;
  mua12hLonNhat?: number;
  mua3hLonNhat?: number;
  /** null khi nguồn không có số mưa đã qua (nguồn dự phòng MET Norway) */
  mua3hVuaQua?: number | null;
  dinhMua?: { tu: string; den: string } | null;
  capNhatLuc?: string;
  /** true = máy chủ chưa làm mới được, đang dùng bản lấy lúc capNhatLuc */
  cu?: boolean;
  nguon?: { ten: string; giayPhep: string; url: string };
  /**
   * Tuyến hay ngập có nguy cơ theo dự báo — máy chủ tính theo NGƯỠNG RIÊNG của từng
   * tuyến nếu lãnh đạo đã đặt (P53), không thì theo mức chung. nguong null = mức chung.
   * Vắng (máy chủ cũ) -> giao diện tự theo mức chung.
   */
  duongNguyCo?: { id: number; ten: string; nguong: number | null }[];
  /** Chỉ có ở API cán bộ */
  toaDo?: { lat: number; lng: number };
  nguonToaDo?: 'bien_moi_truong' | 'duong_hay_ngap' | 'diem_den';
  /** Chỉ có ở API cán bộ: vì sao đang không có dự báo, hoặc vì sao bản đang hiện đã cũ */
  loiGanNhat?: LoiDuBao;
  /** Nguồn của số liệu đang hiện — để ghi công đúng nguồn (P64) */
  nguonDuLieu?: 'open-meteo' | 'met-no';
  /** Chỉ có ở API cán bộ: vì sao đang dùng nguồn dự phòng (lỗi của Open-Meteo) */
  duPhong?: LoiDuBao;
}

const TRANG_THAI: TrangThaiDuBao[] = ['co_du_lieu', 'khong_co_du_lieu', 'chua_cau_hinh', 'tat', 'cau_hinh_sai'];
const laSo = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x) && x >= 0;
const KHONG_CO: DuBaoMua = { trangThai: 'khong_co_du_lieu' };
const MA_LOI: LoiDuBao['ma'][] = ['http', 'het_gio', 'ket_noi', 'du_lieu_sai', 'khac'];

/** Kiểm lý do lỗi; lạ chỗ nào thì bỏ hẳn (không làm hỏng phần dự báo đi kèm) */
function chuanLoi(x: unknown): LoiDuBao | undefined {
  if (!x || typeof x !== 'object') return undefined;
  const l = x as Record<string, unknown>;
  if (!MA_LOI.includes(l.ma as LoiDuBao['ma'])) return undefined;
  if (typeof l.luc !== 'string' || Number.isNaN(Date.parse(l.luc))) return undefined;
  const ma = l.ma as LoiDuBao['ma'];
  if (ma !== 'http') return { ma, luc: l.luc };
  const maHttp = l.maHttp;
  if (typeof maHttp !== 'number' || !Number.isInteger(maHttp) || maHttp < 100 || maHttp > 599) return undefined;
  return { ma, maHttp, luc: l.luc };
}

/**
 * Kiểm dạng trả về từ máy chủ. Lạ bất kỳ chỗ nào -> "khong_co_du_lieu":
 * thà không hiện mức còn hơn hiện một mức đọc sai.
 */
export function chuanDuBao(x: unknown): DuBaoMua {
  if (!x || typeof x !== 'object') return KHONG_CO;
  const d = x as Record<string, unknown>;
  if (!TRANG_THAI.includes(d.trangThai as TrangThaiDuBao)) return KHONG_CO;
  const loiGanNhat = chuanLoi(d.loiGanNhat);
  if (d.trangThai !== 'co_du_lieu') {
    return loiGanNhat ? { trangThai: d.trangThai as TrangThaiDuBao, loiGanNhat } : { trangThai: d.trangThai as TrangThaiDuBao };
  }
  const muc = d.muc;
  if (muc !== 0 && muc !== 1 && muc !== 2 && muc !== 3) return KHONG_CO;
  for (const k of ['mua24h', 'mua12hLonNhat', 'mua3hLonNhat']) if (!laSo(d[k])) return KHONG_CO;
  /* Nguồn dự phòng không có số mưa đã qua: null là hợp lệ (không phải 0), lạ khác thì bỏ */
  if (d.mua3hVuaQua !== null && d.mua3hVuaQua !== undefined && !laSo(d.mua3hVuaQua)) return KHONG_CO;
  if (typeof d.capNhatLuc !== 'string' || Number.isNaN(Date.parse(d.capNhatLuc))) return KHONG_CO;
  const dinh = d.dinhMua as { tu?: unknown; den?: unknown } | null | undefined;
  const dinhMua = dinh && typeof dinh.tu === 'string' && typeof dinh.den === 'string'
    && !Number.isNaN(Date.parse(dinh.tu)) && !Number.isNaN(Date.parse(dinh.den))
    ? { tu: dinh.tu, den: dinh.den }
    : null;
  const duongNguyCo = Array.isArray(d.duongNguyCo)
    ? d.duongNguyCo.filter((x): x is { id: number; ten: string; nguong: number | null } => Boolean(x)
      && typeof x === 'object' && Number.isInteger((x as { id: unknown }).id) && typeof (x as { ten: unknown }).ten === 'string'
      && ((x as { nguong: unknown }).nguong === null || laSo((x as { nguong: unknown }).nguong)))
    : undefined;
  return {
    ...(d as unknown as DuBaoMua),
    muc,
    duongNguyCo,
    lyDo: Array.isArray(d.lyDo) ? d.lyDo.filter((l): l is string => typeof l === 'string') : [],
    dinhMua,
    cu: d.cu === true,
    loiGanNhat,
    nguonDuLieu: d.nguonDuLieu === 'met-no' ? 'met-no' : 'open-meteo',
    duPhong: chuanLoi(d.duPhong),
  };
}

/**
 * Lời giải thích cho cán bộ (P61). Viết để người không chuyên biết nên làm gì tiếp,
 * không chỉ chép mã lỗi.
 */
export function moTaLoiDuBao(loi: LoiDuBao, bayGio: Date = new Date()): string {
  const luc = gioCapNhat(loi.luc, bayGio);
  return `Lần gần nhất máy chủ không lấy được dự báo (${luc}): ${lyDoLoi(loi)}. Máy chủ thử lại khi có người mở trang, cách lần hỏng ít nhất 5 phút.`;
}

/** Đang dùng nguồn dự phòng (P64): nói vì sao, và khác biệt cán bộ cần biết. */
export function moTaDuPhong(loi: LoiDuBao): string {
  return `Đang dùng nguồn dự phòng MET Norway vì ${lyDoLoi(loi)}. `
    + 'Nguồn này không có lượng mưa mấy giờ vừa qua, nên mức chỉ tính theo 24 giờ tới.';
}

function lyDoLoi(loi: LoiDuBao): string {
  let lyDo: string;
  switch (loi.ma) {
    case 'http':
      if (loi.maHttp === 429) {
        lyDo = 'Open-Meteo từ chối (mã 429 — vượt hạn mức lượt gọi theo địa chỉ IP). Hay gặp khi máy chủ chạy trên '
          + 'dịch vụ dùng chung IP với nhiều web khác (vd. Render bản miễn phí); máy chủ có IP riêng sẽ hết';
      } else if ((loi.maHttp ?? 0) >= 500) {
        lyDo = `Open-Meteo đang lỗi phía họ (mã ${loi.maHttp}); thường tự hết sau ít phút`;
      } else {
        lyDo = `Open-Meteo trả mã ${loi.maHttp}`;
      }
      break;
    case 'het_gio':
      lyDo = 'Open-Meteo không trả lời trong 8 giây (mạng chậm hoặc họ đang quá tải)';
      break;
    case 'ket_noi':
      lyDo = 'Máy chủ không kết nối được tới Open-Meteo — kiểm tra mạng, tường lửa (cho phép ra ngoài) của máy chủ';
      break;
    case 'du_lieu_sai':
      lyDo = 'Open-Meteo trả dữ liệu không đúng dạng — đã bỏ qua để không hiện sai mức';
      break;
    default:
      lyDo = 'Lỗi chưa phân loại — xem log máy chủ, dòng "Dự báo mưa"';
  }
  return lyDo;
}

/**
 * Có tuyến nào nguy cơ ngập: mức chung Cảnh báo trở lên, HOẶC có tuyến đạt ngưỡng
 * riêng của nó (P53 — tuyến trũng có thể ngập cả khi mức chung mới là Theo dõi).
 */
export const coNguyCoNgap = (d: DuBaoMua | undefined | null): boolean =>
  d?.trangThai === 'co_du_lieu' && ((d.muc ?? 0) >= 2 || (d.duongNguyCo?.length ?? 0) > 0);

/** Tuyến `id` có nguy cơ không — theo kết luận của máy chủ; máy chủ cũ thì theo mức chung */
export function duongCoNguyCo(d: DuBaoMua | undefined | null, id: number): boolean {
  if (d?.trangThai !== 'co_du_lieu') return false;
  if (d.duongNguyCo) return d.duongNguyCo.some((x) => x.id === id);
  return (d.muc ?? 0) >= 2;
}

export const HIEN_MUC: Record<MucMua, { ten: string; loiKhuyen: string; khung: string; nhan: string; chu: string }> = {
  0: {
    ten: 'Bình thường',
    loiKhuyen: 'Không có mưa đáng kể trong 24 giờ tới.',
    khung: 'border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-900/15',
    nhan: 'bg-emerald-600',
    chu: 'text-emerald-800 dark:text-emerald-200',
  },
  1: {
    ten: 'Theo dõi',
    loiKhuyen: 'Có thể mưa vừa. Chỗ trũng có thể đọng nước khi mưa — đi chậm, quan sát mặt đường.',
    khung: 'border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/15',
    nhan: 'bg-amber-500',
    chu: 'text-amber-900 dark:text-amber-200',
  },
  2: {
    ten: 'Cảnh báo',
    loiKhuyen: 'Dự báo mưa to — các tuyến đường hay ngập có thể bị ngập. Hạn chế đi qua lúc mưa và ngay sau mưa.',
    khung: 'border-orange-400 bg-orange-50 dark:border-orange-700 dark:bg-orange-900/20',
    nhan: 'bg-orange-600',
    chu: 'text-orange-900 dark:text-orange-200',
  },
  3: {
    ten: 'Nguy hiểm',
    loiKhuyen: 'Dự báo mưa rất to — nguy cơ ngập sâu, diện rộng. Hạn chế ra đường khi mưa; không đi qua chỗ nước sâu '
      + 'hoặc chảy xiết; tránh xa dây điện, cột điện, trạm biến áp khi đường ngập.',
    khung: 'border-rose-500 bg-rose-50 dark:border-rose-700 dark:bg-rose-900/20',
    nhan: 'bg-rose-600',
    chu: 'text-rose-900 dark:text-rose-200',
  },
};

/**
 * Ngưỡng để GIẢI THÍCH cho người đọc — bản sao của NGUONG ở máy chủ
 * (server/src/lib/du-bao-mua.js); test du-bao-mua.test.js bắt hai bên lệch nhau.
 * Mức vẫn do máy chủ tính, không dùng số này để tính lại.
 */
export const NGUONG_HIEN = {
  mua24: { vua: 16, to: 50, ratTo: 100 },
  mua12: { vua: 8, to: 25, ratTo: 50 },
} as const;

const N = NGUONG_HIEN;
export const MO_TA_MUC: Record<MucMua, string> = {
  0: `Dưới ${N.mua24.vua} mm trong 24 giờ và dưới ${N.mua12.vua} mm trong 12 giờ`,
  1: `Mưa vừa: từ ${N.mua24.vua} mm trong 24 giờ, hoặc từ ${N.mua12.vua} mm dồn trong 12 giờ`,
  2: `Mưa to: trên ${N.mua24.to} mm trong 24 giờ, hoặc trên ${N.mua12.to} mm dồn trong 12 giờ`,
  3: `Mưa rất to: trên ${N.mua24.ratTo} mm trong 24 giờ, hoặc trên ${N.mua12.ratTo} mm dồn trong 12 giờ`,
};

/* ------------------------------ Giờ Việt Nam ------------------------------ */

const VUNG = 'Asia/Ho_Chi_Minh';
const dinhDang = new Intl.DateTimeFormat('en-GB', {
  timeZone: VUNG, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

function phan(d: Date) {
  const p = Object.fromEntries(dinhDang.formatToParts(d).map((x) => [x.type, x.value]));
  return { ngay: `${p.year}-${p.month}-${p.day}`, dm: `${p.day}/${p.month}`, gio: `${p.hour}:${p.minute}` };
}

/** Số ngày lịch (giờ VN) từ `goc` tới `d`: 0 hôm nay, 1 ngày mai, -1 hôm qua */
function cachNgay(d: Date, goc: Date): number {
  const a = Date.parse(`${phan(d).ngay}T00:00:00Z`);
  const b = Date.parse(`${phan(goc).ngay}T00:00:00Z`);
  return Math.round((a - b) / 86_400_000);
}

function tenNgay(d: Date, bayGio: Date): string {
  const c = cachNgay(d, bayGio);
  if (c === 0) return 'hôm nay';
  if (c === 1) return 'ngày mai';
  if (c === -1) return 'hôm qua';
  return `ngày ${phan(d).dm}`;
}

/** "14:00–17:00 hôm nay", "22:00 hôm nay – 01:00 ngày mai" (giờ Việt Nam) */
export function khoangGio(tuIso: string, denIso: string, bayGio: Date = new Date()): string {
  const tu = new Date(tuIso);
  const den = new Date(denIso);
  const nTu = tenNgay(tu, bayGio);
  const nDen = tenNgay(den, bayGio);
  return nTu === nDen
    ? `${phan(tu).gio}–${phan(den).gio} ${nTu}`
    : `${phan(tu).gio} ${nTu} – ${phan(den).gio} ${nDen}`;
}

/** "10:20 hôm nay" — giờ máy chủ lấy dự báo */
export function gioCapNhat(iso: string, bayGio: Date = new Date()): string {
  const d = new Date(iso);
  return `${phan(d).gio} ${tenNgay(d, bayGio)}`;
}

/** Số mm làm tròn, dấu phẩy thập phân kiểu Việt: 7,5 */
export const soMm = (x: number | null | undefined): string =>
  (Math.round((x ?? 0) * 10) / 10).toLocaleString('vi-VN', { maximumFractionDigits: 1 });
