/**
 * DỰ BÁO MƯA — tự cảnh báo nguy cơ ngập theo lượng mưa (P51)
 * ============================================================================
 *
 * Nguồn: Open-Meteo Forecast API, lượng mưa từng giờ (miễn phí, không cần khoá).
 *
 * VÌ SAO LẤY LƯỢNG MƯA, KHÔNG LẤY "FLOOD API" CỦA OPEN-METEO: Flood API trả lưu
 * lượng SÔNG (mô hình GloFAS, ô lưới chừng 5 km) — hợp với lũ sông lớn, không
 * nói gì về nước ngập trên mặt đường. Ngập đường đô thị đến từ mưa dồn quá sức
 * cống, nên đo bằng lượng mưa.
 *
 * VÌ SAO MÁY CHỦ GỌI, KHÔNG ĐỂ TRÌNH DUYỆT GỌI: (1) IP người dân không sang bên
 * thứ ba; (2) không phải nới CSP; (3) bản miễn phí giới hạn dưới 10.000 lượt/ngày
 * — để mỗi người xem tự gọi thì một ngày mưa to là hết lượt. Máy chủ lấy một lần,
 * dùng chung 30 phút: cả web chỉ tốn vài chục lượt/ngày.
 *
 * ĐIỀU KHOẢN OPEN-METEO: bản miễn phí chỉ cho dùng PHI THƯƠNG MẠI và phải ghi
 * nguồn (CC BY 4.0) — giao diện ghi "Dữ liệu thời tiết: Open-Meteo.com". Muốn
 * thôi dùng: DU_BAO_MUA_TOA_DO=tat.
 *
 * ⚠️ FAIL-SAFE: KHÔNG CÓ DỮ LIỆU ≠ TRỜI YÊN. Lấy lỗi, dữ liệu sai dạng, thiếu giờ,
 *    quá cũ -> "khong_co_du_lieu", không bao giờ quy về mức Bình thường. Báo
 *    "Bình thường" lúc đang mưa to vì mạng chập chờn là để người dân yên tâm
 *    lao vào đường ngập.
 *
 * ⚠️ DỰ BÁO KHÔNG ĐÁNH DẤU "ĐANG NGẬP". Mô hình thời tiết ô lưới vài km, sai số
 *    lớn với mưa dông nhiệt đới. Nó chỉ nói "có nguy cơ"; "đang ngập" vẫn do cán
 *    bộ tận mắt xác nhận (duong-ngap.js).
 */
import { pool } from '../db.js';
import { thieuCotNgap } from './duong-ngap.js';

/** Địa chỉ DUY NHẤT được gọi — cố định, không ghép từ dữ liệu người dùng */
export const NGUON_URL = 'https://api.open-meteo.com/v1/forecast';

/**
 * NGUỒN DỰ PHÒNG — MET Norway (viện khí tượng Na Uy, Locationforecast 2.0, P64).
 * Open-Meteo giới hạn lượt gọi theo IP; Render gói miễn phí dùng chung IP với rất
 * nhiều web nên hay bị 429 dù mình chỉ gọi 30 phút một lần. Open-Meteo lỗi thì lấy từ
 * đây: miễn phí, không cần khoá, phủ toàn cầu, nhưng BẮT BUỘC User-Agent có cách liên
 * hệ (thiếu là bị chặn 403). Dữ liệu CC BY 4.0 — giao diện ghi công "MET Norway".
 * Không có số mưa đã qua: dùng nguồn này thì mức chỉ tính theo 24 giờ tới.
 * Tắt: DU_BAO_MUA_DU_PHONG=tat.
 */
export const NGUON_DU_PHONG_URL = 'https://api.met.no/weatherapi/locationforecast/2.0/compact';
const UA_DU_PHONG = 'HopThuAnNinhSo/1.0 github.com/longcao1234567898-sudo/ans-complete';

export const LAM_MOI_SAU_MS = 30 * 60_000;
/** Bản cũ dùng tạm khi không làm mới được. Quá 3 giờ thì thà không báo còn hơn báo cũ. */
export const DUNG_BAN_CU_TOI_DA_MS = 3 * 3_600_000;
/** Vừa lỗi thì nghỉ chừng này mới thử lại: Open-Meteo sập không bị mỗi lượt xem dội thêm. */
export const NGHI_SAU_LOI_MS = 5 * 60_000;
const HET_GIO_MS = 8000;
/** 4 ngày × 24 giờ chỉ vài KB; lớn hơn thế này là trả nhầm thứ khác */
const TOI_DA_KY_TU = 200_000;
/** mm trong MỘT giờ. Kỷ lục thế giới chừng 305 mm/giờ — quá số này là dữ liệu hỏng. */
const MUA_GIO_TOI_DA = 500;

/**
 * Ngưỡng — theo cách phân loại mưa của ngành khí tượng thuỷ văn Việt Nam:
 *   24 giờ: mưa vừa 16–50 mm · mưa to 51–100 mm · mưa rất to trên 100 mm
 *   12 giờ: mưa vừa 8–25 mm  · mưa to 26–50 mm  · mưa rất to trên 50 mm
 * `vua` so sánh ">=", `to` và `ratTo` so sánh ">" (mưa to là TRÊN 50 mm/24 giờ).
 *
 * Không thêm ngưỡng 3 giờ theo sức cống: cống nội đô TP.HCM thiết kế cho chừng
 * 76–96 mm/3 giờ, cống cũ dưới 40 mm — đều trên 25 mm, nên mưa đủ làm tràn cống
 * thì ngưỡng 12 giờ ở trên đã báo rồi.
 *
 * Muốn chỉnh cho sát địa bàn: đối chiếu vài trận mưa thật với các lần cán bộ bấm
 * "Đang ngập", rồi sửa ở đây (kèm sửa test du-bao-mua.test.js).
 */
export const NGUONG = {
  mua24: { vua: 16, to: 50, ratTo: 100 },
  mua12: { vua: 8, to: 25, ratTo: 50 },
};

export const MUC_DO = [
  { muc: 0, ma: 'binh_thuong', ten: 'Bình thường' },
  { muc: 1, ma: 'theo_doi', ten: 'Theo dõi' },
  { muc: 2, ma: 'canh_bao', ten: 'Cảnh báo' },
  { muc: 3, ma: 'nguy_hiem', ten: 'Nguy hiểm' },
];

/** Khung tính: 3 giờ vừa qua (nước chưa kịp rút) + 24 giờ tới */
const GIO_DA_QUA = 3;
const GIO_TOI = 24;
const DO_DAI_KHUNG = GIO_DA_QUA + GIO_TOI;

const lam1 = (x) => Math.round(x * 10) / 10;
const lam2 = (x) => Math.round(x * 100) / 100;

/**
 * Kiểm phản hồi Open-Meteo (timeformat=unixtime). Sai bất kỳ điểm nào -> ném lỗi.
 * Trả { gio: giây UTC tròn giờ, liền nhau; mua: mm của giờ KẾT THÚC tại mốc đó, hoặc null }.
 */
export function kiemPhanHoi(d) {
  const h = d?.hourly;
  if (!h || !Array.isArray(h.time) || !Array.isArray(h.precipitation)) {
    throw new Error('thiếu hourly.time / hourly.precipitation');
  }
  const n = h.time.length;
  if (n === 0 || n > 24 * 16 || h.precipitation.length !== n) throw new Error('độ dài chuỗi giờ không hợp lệ');
  const donVi = d.hourly_units?.precipitation;
  if (donVi !== undefined && donVi !== 'mm') throw new Error(`đơn vị lượng mưa lạ: ${String(donVi).slice(0, 20)}`);
  for (let i = 0; i < n; i += 1) {
    const t = h.time[i];
    if (!Number.isInteger(t) || t % 3600 !== 0) throw new Error('mốc giờ không tròn giờ');
    if (i > 0 && t !== h.time[i - 1] + 3600) throw new Error('mốc giờ không liền nhau');
    const v = h.precipitation[i];
    if (v === null) continue;
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > MUA_GIO_TOI_DA) {
      throw new Error('lượng mưa không hợp lệ');
    }
  }
  return { gio: [...h.time], mua: [...h.precipitation] };
}

/**
 * Kiểm phản hồi MET Norway (compact). Sai bất kỳ điểm nào -> ném lỗi.
 * MET ghi mưa của giờ (t, t+1h] ở mốc t (next_1_hours); đổi về quy ước của Open-Meteo
 * (mốc = giờ KẾT THÚC). Chỉ lấy đoạn theo giờ liền nhau ở đầu; tới mốc không có
 * next_1_hours (chuyển sang bước 6 giờ) thì dừng. coGioQua: false = không có giờ đã qua.
 */
export function kiemPhanHoiMetNo(d) {
  const ts = d?.properties?.timeseries;
  if (!Array.isArray(ts) || ts.length === 0 || ts.length > 24 * 16) throw new Error('thiếu properties.timeseries');
  const donVi = d.properties.meta?.units?.precipitation_amount;
  if (donVi !== undefined && donVi !== 'mm') throw new Error(`đơn vị lượng mưa lạ: ${String(donVi).slice(0, 20)}`);
  const gio = [];
  const mua = [];
  for (const muc of ts) {
    const ms = Date.parse(muc?.time);
    if (!Number.isFinite(ms) || ms % 3_600_000 !== 0) throw new Error('mốc giờ không hợp lệ');
    const chiTiet = muc?.data?.next_1_hours?.details;
    if (!chiTiet) break;
    const v = chiTiet.precipitation_amount;
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > MUA_GIO_TOI_DA) throw new Error('lượng mưa không hợp lệ');
    const ket = ms / 1000 + 3600;
    if (gio.length && ket !== gio[gio.length - 1] + 3600) break;
    gio.push(ket);
    mua.push(v);
  }
  if (!gio.length) throw new Error('không có dữ liệu theo giờ');
  return { gio, mua, coGioQua: false };
}

function xetNguong(giaTri, ng, nhan) {
  if (giaTri > ng.ratTo) return [3, `${nhan} khoảng ${giaTri} mm — mưa rất to (trên ${ng.ratTo} mm)`];
  if (giaTri > ng.to) return [2, `${nhan} khoảng ${giaTri} mm — mưa to (trên ${ng.to} mm)`];
  if (giaTri >= ng.vua) return [1, `${nhan} khoảng ${giaTri} mm — mưa vừa (từ ${ng.vua} mm)`];
  return [0, null];
}

/**
 * Tính mức tại thời điểm `bayGioMs`. Thiếu bất kỳ giờ nào trong khung -> null
 * (KHÔNG coi giờ thiếu là 0 mm).
 */
export function tinhMuc(chuoi, bayGioMs) {
  const gioHienTai = Math.floor(bayGioMs / 3_600_000) * 3600;
  /* Nguồn không có giờ đã qua (MET Norway): ba ô "vừa qua" đặt 0 CHỈ để giữ nguyên chỉ
     số trong khung; mọi phép quét bắt đầu từ ô đầu của 24 giờ tới (batDau) nên số 0 đó
     không vào tổng nào, và các số "vừa qua" trả null — không phải 0. */
  const coGioQua = chuoi.coGioQua !== false;
  let s;
  if (coGioQua) {
    const dau = chuoi.gio.indexOf(gioHienTai - (GIO_DA_QUA - 1) * 3600);
    if (dau < 0 || dau + DO_DAI_KHUNG > chuoi.gio.length) return null;
    s = chuoi.mua.slice(dau, dau + DO_DAI_KHUNG);
  } else {
    const dau = chuoi.gio.indexOf(gioHienTai + 3600);
    if (dau < 0 || dau + GIO_TOI > chuoi.gio.length) return null;
    s = [...new Array(GIO_DA_QUA).fill(0), ...chuoi.mua.slice(dau, dau + GIO_TOI)];
  }
  if (s.some((v) => v === null)) return null;
  const batDau = coGioQua ? 0 : GIO_DA_QUA;

  const tong = (a, b) => lam1(s.slice(a, b).reduce((x, y) => x + y, 0));
  const mua24h = tong(GIO_DA_QUA, DO_DAI_KHUNG);
  const mua3hVuaQua = coGioQua ? tong(0, GIO_DA_QUA) : null;
  let mua12hLonNhat = 0;
  for (let i = batDau; i + 12 <= DO_DAI_KHUNG; i += 1) mua12hLonNhat = Math.max(mua12hLonNhat, tong(i, i + 12));
  let mua3hLonNhat = 0;
  let dinh = -1;
  for (let i = batDau; i + 3 <= DO_DAI_KHUNG; i += 1) {
    const t = tong(i, i + 3);
    if (t > mua3hLonNhat) { mua3hLonNhat = t; dinh = i; }
  }

  const xet = [
    xetNguong(mua24h, NGUONG.mua24, 'Tổng mưa 24 giờ tới'),
    xetNguong(mua12hLonNhat, NGUONG.mua12, 'Mưa dồn trong 12 giờ'),
  ];
  const muc = Math.max(...xet.map((x) => x[0]));
  const { ma, ten } = MUC_DO[muc];
  /* Mưa 12 giờ VỪA QUA (P53): để ghi kèm mỗi lần cán bộ báo ngập — trận mưa gây
     ngập thường đã qua lúc cán bộ ra tới nơi, nên lấy mưa dồn 3 giờ lớn nhất trong
     12 giờ trước, không chỉ 3 giờ cuối. Thiếu số thì để null, không làm hỏng mức. */
  const dauQua = chuoi.gio.indexOf(gioHienTai - 11 * 3600);
  let mua12hVuaQua = null;
  let mua3hLonNhat12hQua = null;
  if (dauQua >= 0) {
    const qua = chuoi.mua.slice(dauQua, dauQua + 12);
    if (qua.length === 12 && qua.every((v) => v !== null)) {
      mua12hVuaQua = lam1(qua.reduce((x, y) => x + y, 0));
      mua3hLonNhat12hQua = 0;
      for (let i = 0; i + 3 <= 12; i += 1) mua3hLonNhat12hQua = Math.max(mua3hLonNhat12hQua, lam1(qua[i] + qua[i + 1] + qua[i + 2]));
    }
  }

  /* Mốc giờ t mang lượng mưa của giờ (t − 1h, t] -> khung 3 mốc bắt đầu từ mốc đầu − 1h */
  const mocDau = gioHienTai + (dinh - (GIO_DA_QUA - 1)) * 3600;
  return {
    muc,
    ma,
    ten,
    lyDo: muc === 0 ? [] : xet.filter((x) => x[0] === muc).map((x) => x[1]),
    mua24h,
    mua12hLonNhat,
    mua3hLonNhat,
    mua3hVuaQua,
    mua12hVuaQua,
    mua3hLonNhat12hQua,
    dinhMua: dinh < 0 ? null : {
      tu: new Date((mocDau - 3600) * 1000).toISOString(),
      den: new Date((mocDau + 2 * 3600) * 1000).toISOString(),
    },
    /* Mưa từng giờ trong phần được xét (ket = mốc KẾT THÚC của giờ) — để tính khung giờ
       nguy cơ riêng từng tuyến theo ngưỡng của tuyến đó (khungMuaDon). Chỉ dùng trong
       máy chủ: banCongKhai bỏ đi. */
    muaTheoGio: s.slice(batDau).map((mm, j) => ({ ket: gioHienTai + (batDau + j - (GIO_DA_QUA - 1)) * 3600, mm })),
  };
}

/**
 * Khung giờ mưa dồn đạt `nguong` (mm/3 giờ): từ giờ CÓ MƯA đầu tiên tới giờ có mưa
 * cuối cùng của các khung 3 giờ đạt ngưỡng. Cắt các giờ không mưa ở hai đầu khung —
 * khung 3 giờ chỉ có một giờ mưa thì báo đúng giờ đó, không báo rộng ra 3 giờ. Hai đợt
 * mưa đều đạt thì từ đợt đầu tới đợt cuối (người dân cần biết lúc nào thôi phải để ý).
 * Không khung nào đạt -> null: không bịa giờ.
 */
export function khungMuaDon(muaTheoGio, nguong) {
  if (!Array.isArray(muaTheoGio)) return null;
  let tu = null;
  let den = null;
  for (let i = 0; i + 3 <= muaTheoGio.length; i += 1) {
    const ba = muaTheoGio.slice(i, i + 3);
    const t = lam1(ba.reduce((x, y) => x + y.mm, 0));
    if (t <= 0 || t < nguong) continue;
    const coMua = ba.filter((x) => x.mm > 0);
    const dau = coMua[0].ket - 3600;
    const cuoi = coMua[coMua.length - 1].ket;
    if (tu === null || dau < tu) tu = dau;
    if (den === null || cuoi > den) den = cuoi;
  }
  return tu === null ? null : { tu: new Date(tu * 1000).toISOString(), den: new Date(den * 1000).toISOString() };
}

/* ------------------------------ Chọn điểm dự báo ------------------------------ */

/** Khung Việt Nam (gồm cả quần đảo). Toạ độ ngoài khung gần như chắc là nhập ngược lat/lng. */
const trongVietNam = (lat, lng) => lat >= 8 && lat <= 24 && lng >= 102 && lng <= 118;
const SO = /^\s*(\d{1,2}(?:\.\d+)?)\s*,\s*(\d{2,3}(?:\.\d+)?)\s*$/;

function trungVi(ds) {
  const s = [...ds].sort((a, b) => a - b);
  const g = s.length >> 1;
  return s.length % 2 ? s[g] : (s[g - 1] + s[g]) / 2;
}

/**
 * Chọn toạ độ lấy dự báo:
 *   1. DU_BAO_MUA_TOA_DO="lat,lng" — người vận hành khai rõ. "tat" = tắt hẳn.
 *      Khai sai -> "cau_hinh_sai": báo rõ, KHÔNG lặng lẽ đoán điểm khác.
 *   2. Không khai -> trung vị các ĐƯỜNG HAY NGẬP đang công khai (dự báo đúng chỗ
 *      cần dự báo; trung vị để một điểm nhập sai toạ độ không kéo lệch cả đơn vị).
 *   3. Chưa có đường hay ngập -> trung vị các điểm đen tai nạn đang công khai.
 *   4. Không có gì -> "chua_cau_hinh", không gọi Open-Meteo.
 * Làm tròn 2 chữ số (~1 km): ô lưới mô hình thời tiết còn thô hơn thế.
 */
async function chonToaDo(env, docDiem) {
  const khai = (env.DU_BAO_MUA_TOA_DO ?? '').trim();
  if (khai.toLowerCase() === 'tat') return { loi: 'tat' };
  if (khai) {
    const m = khai.match(SO);
    const lat = m ? Number(m[1]) : NaN;
    const lng = m ? Number(m[2]) : NaN;
    if (!m || !trongVietNam(lat, lng)) return { loi: 'cau_hinh_sai' };
    return { lat: lam2(lat), lng: lam2(lng), nguon: 'bien_moi_truong' };
  }
  const diem = (await docDiem())
    .map((d) => ({ lat: Number(d.lat), lng: Number(d.lng), loai: d.loai }))
    .filter((d) => Number.isFinite(d.lat) && Number.isFinite(d.lng) && trongVietNam(d.lat, d.lng));
  const ngap = diem.filter((d) => d.loai === 'ngap');
  const chon = ngap.length ? ngap : diem;
  if (!chon.length) return { loi: 'chua_cau_hinh' };
  return {
    lat: lam2(trungVi(chon.map((d) => d.lat))),
    lng: lam2(trungVi(chon.map((d) => d.lng))),
    nguon: ngap.length ? 'duong_hay_ngap' : 'diem_den',
  };
}

const SQL_DIEM = `SELECT lat, lng, loai FROM traffic_hotspots
 WHERE is_published = 1 AND lat IS NOT NULL AND lng IS NOT NULL`;
/* CSDL chưa chạy nang_cap_v31.sql: chưa có cột loai -> coi mọi điểm là điểm đen */
const SQL_DIEM_CU = `SELECT lat, lng FROM traffic_hotspots
 WHERE is_published = 1 AND lat IS NOT NULL AND lng IS NOT NULL`;

async function docDiemCsdl() {
  try {
    return (await pool.query(SQL_DIEM))[0];
  } catch (err) {
    if (thieuCotNgap(err)) return (await pool.query(SQL_DIEM_CU))[0];
    if (/doesn't exist|no such table/i.test(String(err?.message))) return [];
    throw err;
  }
}

/* --------------------------------- Nguồn dự báo -------------------------------- */

/**
 * Lý do lỗi gần nhất cho TRANG CÁN BỘ (P61). Chỉ giữ MÃ CỐ ĐỊNH trong danh sách này
 * (+ mã HTTP), không giữ câu lỗi gốc: câu lỗi của mạng/thư viện có thể mang địa chỉ
 * nội bộ, cấu hình — đưa ra trình duyệt là lộ (bài học BUG-028). Câu gốc vẫn ở log.
 */
export const MA_LOI = ['http', 'het_gio', 'ket_noi', 'du_lieu_sai', 'khac'];

class LoiPhanLoai extends Error {
  constructor(ma, thongDiep, maHttp) {
    super(thongDiep);
    this.ma = ma;
    if (maHttp !== undefined) this.maHttp = maHttp;
  }
}

/** Lỗi khi GỌI mạng (chưa có phản hồi) hoặc khi đọc thân phản hồi */
function phanLoaiLoiMang(err) {
  if (err instanceof LoiPhanLoai) return err;
  const ten = err?.name;
  if (ten === 'TimeoutError' || ten === 'AbortError') return new LoiPhanLoai('het_gio', err?.message);
  /* fetch của Node báo mọi lỗi DNS/TCP/TLS là TypeError "fetch failed" */
  if (err instanceof TypeError) return new LoiPhanLoai('ket_noi', err?.message);
  return new LoiPhanLoai('khac', err?.message);
}

/**
 * Tạo một nguồn dự báo có bộ nhớ đệm. Mọi thứ bên ngoài (mạng, đồng hồ, CSDL,
 * biến môi trường) truyền vào để kiểm thử được; mã chạy thật dùng `duBaoMua`.
 */
/**
 * URL gọi Open-Meteo: host và đường dẫn cố định (NGUON_URL), toạ độ là SỐ đã kiểm
 * và làm tròn — không phần nào lấy từ yêu cầu của người dùng (bài canh A10).
 */
export function taoUrlDuBao(toaDo) {
  const url = new URL(NGUON_URL);
  url.search = new URLSearchParams({
    latitude: Number(toaDo.lat).toFixed(2),
    longitude: Number(toaDo.lng).toFixed(2),
    hourly: 'precipitation',
    past_days: '1',
    /* 3 ngày: bản đệm cũ tới 3 giờ vẫn phủ đủ 24 giờ tới */
    forecast_days: '3',
    timeformat: 'unixtime',
    timezone: 'GMT',
  }).toString();
  return url.toString();
}

/** URL gọi MET Norway: host, đường dẫn cố định; chỉ có toạ độ là số đã kiểm, làm tròn. */
export function taoUrlDuPhong(toaDo) {
  const url = new URL(NGUON_DU_PHONG_URL);
  url.search = new URLSearchParams({ lat: Number(toaDo.lat).toFixed(2), lon: Number(toaDo.lng).toFixed(2) }).toString();
  return url.toString();
}

/** Bản chạy thật bật nguồn dự phòng trừ khi khai DU_BAO_MUA_DU_PHONG=tat. */
export const batDuPhong = (env) => String(env.DU_BAO_MUA_DU_PHONG ?? '').trim().toLowerCase() !== 'tat';

/** `duPhong`: Open-Meteo lỗi thì thử MET Norway. Mặc định tắt (kiểm thử gọi đúng số lượt). */
export function taoNguonDuBao({
  fetchFn = globalThis.fetch.bind(globalThis), bayGio = Date.now, docDiem = docDiemCsdl, env = process.env, ghiLog = console.warn,
  duPhong = false,
} = {}) {
  let goiMang = fetchFn;
  let boNho = null;        // { chuoi, layLuc, toaDo }
  let trangThaiCauHinh = null;
  let loiLuc = -Infinity;
  let dangLay = null;
  let loiGanNhat = null;   // { ma, maHttp?, luc } — chỉ cho trang cán bộ

  const tuyChonGoi = (headers = {}) => ({
    headers: { Accept: 'application/json', ...headers },
    redirect: 'error',
    signal: AbortSignal.timeout(HET_GIO_MS),
  });
  /**
   * Gọi một nguồn, đọc và kiểm; mọi lỗi đều ra LoiPhanLoai (mã cố định, không chép câu lỗi
   * ra ngoài). `goi` là hàm gọi mạng của TỪNG nguồn: mỗi nguồn gọi mạng ở một chỗ riêng với
   * hàm dựng URL cố định — để bài kiểm SSRF (ra-soat-owasp.test.js, A10) đọc được địa chỉ là hằng.
   */
  async function goiNguon(goi, tenNguon, kiem) {
    let r;
    let chu;
    try {
      r = await goi();
      if (!r.ok) {
        const maHttp = Number.isInteger(r.status) && r.status >= 100 && r.status <= 599 ? r.status : undefined;
        throw new LoiPhanLoai(maHttp ? 'http' : 'khac', `${tenNguon} trả mã ${r.status}`, maHttp);
      }
      /* Báo trước kích thước quá lớn thì bỏ, khỏi đọc vào bộ nhớ (vẫn kiểm lại sau khi đọc) */
      if (Number(r.headers?.get?.('content-length')) > TOI_DA_KY_TU) throw new LoiPhanLoai('du_lieu_sai', 'phản hồi quá lớn');
      chu = await r.text();
    } catch (err) {
      throw phanLoaiLoiMang(err);
    }
    if (chu.length > TOI_DA_KY_TU) throw new LoiPhanLoai('du_lieu_sai', 'phản hồi quá lớn');
    try {
      return kiem(JSON.parse(chu));
    } catch (err) {
      throw new LoiPhanLoai('du_lieu_sai', err?.message);
    }
  }
  const goiOpenMeteo = (toaDo) => goiNguon(() => goiMang(taoUrlDuBao(toaDo), tuyChonGoi()), 'Open-Meteo', kiemPhanHoi);
  const goiMetNo = (toaDo) => goiNguon(() => goiMang(taoUrlDuPhong(toaDo), tuyChonGoi({ 'User-Agent': UA_DU_PHONG })), 'MET Norway', kiemPhanHoiMetNo);
  const thanhLoi = (err, luc) => {
    /* Lỗi ngoài lúc gọi nguồn (vd. đọc CSDL chọn toạ độ) không có `ma` -> 'khac' */
    const ma = MA_LOI.includes(err?.ma) ? err.ma : 'khac';
    return { ma, ...(ma === 'http' ? { maHttp: err.maHttp } : {}), luc: new Date(luc).toISOString() };
  };

  async function lamMoi() {
    try {
      const toaDo = await chonToaDo(env, docDiem);
      if (toaDo.loi) {
        trangThaiCauHinh = toaDo.loi;
        boNho = null;
        /* Hỏi lại cấu hình (vd. cán bộ vừa thêm đường hay ngập) sau mỗi kỳ nghỉ */
        loiLuc = bayGio();
        if (toaDo.loi === 'cau_hinh_sai') ghiLog('🔴 Dự báo mưa: DU_BAO_MUA_TOA_DO khai sai (cần "vĩ độ,kinh độ" trong Việt Nam, vd. 11.01,106.65, hoặc "tat") — đang KHÔNG hiện dự báo.');
        return;
      }
      trangThaiCauHinh = null;
      try {
        const chuoi = await goiOpenMeteo(toaDo);
        boNho = { chuoi, layLuc: bayGio(), toaDo, nguonDuLieu: 'open-meteo', duPhong: null };
      } catch (loiChinh) {
        if (!duPhong) throw loiChinh;
        ghiLog('Dự báo mưa: Open-Meteo lỗi —', loiChinh?.message, '— thử nguồn dự phòng MET Norway');
        try {
          const chuoi = await goiMetNo(toaDo);
          /* Giữ lý do phải dùng dự phòng để trang cán bộ biết (vd. 429 vì IP dùng chung) */
          boNho = { chuoi, layLuc: bayGio(), toaDo, nguonDuLieu: 'met-no', duPhong: thanhLoi(loiChinh, bayGio()) };
        } catch (loiPhu) {
          ghiLog('Dự báo mưa: nguồn dự phòng MET Norway cũng lỗi —', loiPhu?.message);
          throw loiChinh;   // cán bộ thấy lỗi của nguồn chính — nguyên nhân gốc
        }
      }
      loiGanNhat = null;
    } catch (err) {
      loiLuc = bayGio();
      loiGanNhat = thanhLoi(err, loiLuc);
      ghiLog('Dự báo mưa: chưa lấy được dự báo —', err?.message);
    }
  }

  async function lay() {
    const bd = bayGio();
    const canLamMoi = (!boNho || bd - boNho.layLuc >= LAM_MOI_SAU_MS) && bd - loiLuc >= NGHI_SAU_LOI_MS;
    if (canLamMoi) {
      /* Một lượt gọi cho mọi yêu cầu đến cùng lúc */
      dangLay ??= lamMoi().finally(() => { dangLay = null; });
      await dangLay;
    }
    if (trangThaiCauHinh) return { trangThai: trangThaiCauHinh };
    /* Bản sao: người gọi sửa kết quả cũng không đụng được trạng thái bên trong */
    const loi = loiGanNhat ? { loiGanNhat: { ...loiGanNhat } } : {};
    if (!boNho) return { trangThai: 'khong_co_du_lieu', ...loi };
    const tuoi = bayGio() - boNho.layLuc;
    if (tuoi > DUNG_BAN_CU_TOI_DA_MS) return { trangThai: 'khong_co_du_lieu', ...loi };
    const kq = tinhMuc(boNho.chuoi, bayGio());
    if (!kq) return { trangThai: 'khong_co_du_lieu', ...loi };
    return {
      trangThai: 'co_du_lieu',
      ...loi,
      nguonDuLieu: boNho.nguonDuLieu,
      ...(boNho.duPhong ? { duPhong: { ...boNho.duPhong } } : {}),
      ...kq,
      capNhatLuc: new Date(boNho.layLuc).toISOString(),
      cu: tuoi >= LAM_MOI_SAU_MS,
      toaDo: { lat: boNho.toaDo.lat, lng: boNho.toaDo.lng },
      nguonToaDo: boNho.toaDo.nguon,
    };
  }

  function datLai() {
    boNho = null;
    trangThaiCauHinh = null;
    loiLuc = -Infinity;
    dangLay = null;
    loiGanNhat = null;
  }

  /** Chỉ cho kiểm thử: thay mạng giả (null = trả lại mạng gốc) và xoá bộ nhớ đệm */
  function thayMang(fn) {
    goiMang = fn ?? fetchFn;
    datLai();
  }

  return { lay, datLai, thayMang };
}

/* Bản chạy thật — dùng chung cho route công khai và route cán bộ trong một tiến trình */
export const duBaoMua = taoNguonDuBao({ duPhong: batDuPhong(process.env) });

/** Chỉ cho kiểm thử route: thay mạng giả cho bản chạy thật (null = mạng thật). */
export const thayFetchChoThu = (fn) => duBaoMua.thayMang(fn);

/**
 * Phần trả cho NGƯỜI DÂN: bỏ toạ độ, nguồn toạ độ, lý do lỗi và lý do dùng dự phòng
 * (người dân không cần; các lý do đó nói cách máy chủ ra mạng — chỉ cán bộ xem).
 * Giữ nguonDuLieu và `nguon` để giao diện ghi công đúng nguồn đang dùng.
 */
export function banCongKhai(kq) {
  if (kq.trangThai !== 'co_du_lieu') return { trangThai: kq.trangThai };
  const { toaDo: _toaDo, nguonToaDo: _nguon, loiGanNhat: _loi, duPhong: _duPhong, muaTheoGio: _gio, ...con } = kq;
  return { ...con, nguon: nguonGhiCong(kq) };
}

/** Ghi công theo CC BY 4.0 — điều kiện dùng dữ liệu miễn phí của Open-Meteo */
export const NGUON_GHI_CONG = { ten: 'Open-Meteo.com', giayPhep: 'CC BY 4.0', url: 'https://open-meteo.com/' };
/** Ghi công MET Norway (CC BY 4.0) khi đang dùng nguồn dự phòng */
export const NGUON_GHI_CONG_DU_PHONG = { ten: 'MET Norway', giayPhep: 'CC BY 4.0', url: 'https://www.met.no/en' };
export const nguonGhiCong = (kq) => (kq?.nguonDuLieu === 'met-no' ? NGUON_GHI_CONG_DU_PHONG : NGUON_GHI_CONG);
