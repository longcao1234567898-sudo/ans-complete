/**
 * HÀNG CHỜ GỬI NGẦM — mất mạng vẫn gửi được, có mạng thì tự gửi (P92, ADR-008)
 * ============================================================================
 *
 * Bà con bấm "Gửi" lúc mất mạng (hoặc mạng đứt giữa chừng, máy chủ không trả lời)
 * thì tin được cất ở đây và tự gửi khi có mạng: khi trang đang mở (sự kiện
 * "online", hẹn giờ), khi mở lại trang, và trên Android/Chrome cả khi đã đóng trang
 * (Background Sync — public/sw.js đọc cùng kho này, theo cùng luật).
 *
 * BẢO VỆ TIN TRÊN MÁY:
 *   · Mã hoá AES-GCM 256, khoá sinh trong trình duyệt, không xuất được bằng JavaScript.
 *     Chỉ chặn đọc lướt: trình duyệt vẫn ghi vật liệu khoá xuống đĩa, người có hồ sơ
 *     trình duyệt / mở công cụ lập trình đọc được. Lớp bảo vệ chính là tin nằm trên
 *     máy NGẮN nhất có thể và giao diện không bao giờ hiện lại nội dung.
 *   · Gửi được là XOÁ NGAY. Mã tra cứu + PIN của tin đã gửi ngầm cũng mã hoá.
 *
 * GỬI LẠI KHÔNG TRÙNG (P91, ND-076): mỗi tin giữ NGUYÊN thân yêu cầu đã chuẩn bị
 * (kể cả ảnh đã tải lên) cùng `maLanGui`. Máy chủ nhận ra lần gửi lại và trả lại
 * đúng mã tra cứu + PIN. Chỉ thay vé "không phải người máy" (không nằm trong dấu vân).
 *
 * MÁY DÙNG CHUNG (trọng tài P92, bản 3): tin gắn với ĐÚNG TRANG đã soạn (mã ngẫu nhiên
 * trong bộ nhớ, mất khi tải lại / đóng tab — sessionStorage thì trình duyệt khôi phục
 * lại được khi mở lại tab đã đóng). Tin / kết quả của trang khác KHÔNG hiện gì cả —
 * không thanh báo, không hộp — để người dùng sau không biết máy này vừa có người báo
 * công an. Vẫn tự gửi ngầm. Người soạn muốn xem lại thì nhập MÃ NHẬN KẾT QUẢ ở ô cố
 * định trên trang Tra cứu (nhanLaiBangMa): ô luôn hiện nên không lộ có tin hay không;
 * nhập sai nhiều lần thì KHOÁ TẠM, giãn dần — không xoá gì (không để người khác phá).
 *
 * HẠN SỐNG: máy chủ chỉ nhận ra lần gửi lại trong SONG_GIO giờ (P91). Tin CÓ THỂ đã
 * tới máy chủ (đã từng đi mà không có trả lời chắc chắn) quá HAN_GUI_LAI_GIO thì dừng
 * gửi — gửi là thành đơn thứ hai. Tin chắc chưa tới gửi tới HAN_TIN_GIO. Quá hạn giữ
 * thì tin / kết quả được thay bằng một DẤU (không nội dung, chỉ mã nhận kết quả + loại)
 * để người soạn nhập mã còn biết chuyện gì đã xảy ra.
 *
 * Trạng thái một tin: cho (đợi mạng) · can_xac_minh (máy chủ đòi vé — cần bà con tích
 * ô ở trang) · can_xac_minh_them (mạng đông, cần mã Turnstile tươi) · loi (máy chủ
 * từ chối hẳn — báo lý do, bà con xoá) · qua_han (quá hạn gửi).
 */
import { diaChiApi } from './api';
import { layVe } from '../utils/veVaoCua';
import { saveTrackingCode } from '../hooks/useTrackingHistory';

const TEN_KHO = 'htans-hang-cho';
const KHO_KHOA = 'khoa';
const KHO_TIN = 'tin';
const KHO_KET_QUA = 'ket_qua';
export const SU_KIEN_HANG_CHO = 'htans-hang-cho';
export const THE_DONG_BO = 'gui-tin-cho';
const TOI_DA_TIN = 3;
const KHOA_KHOA = 'chinh';
/** Bản ghi phụ trong KHO_KHOA: địa chỉ nhận ý kiến của bản đang chạy (service worker đọc) */
const KHOA_DICH = 'dich';
/** Bản ghi phụ trong KHO_KHOA: đếm lần nhập sai mã nhận kết quả (chung cả máy) */
const KHOA_NHAN_LAI = 'nhan_lai';
const GIO = 3_600_000;
/** Dưới SONG_GIO (24) của server/src/lib/lan-gui.js, chừa biên đồng hồ máy lệch */
const HAN_GUI_LAI_GIO = 20;
const HAN_TIN_GIO = 72;
const HAN_KET_QUA_GIO = 72;
/** Dấu tin / kết quả quá hạn — giữ để người soạn nhập mã còn biết, rồi xoá hẳn */
const HAN_DAU_GIO = 30 * 24;
/* Nhập sai mã nhận kết quả: SAI_MOI_DOT lần thì khoá KHOA_DAU_MS, mỗi đợt sau gấp đôi */
const SAI_MOI_DOT = 5;
const KHOA_DAU_MS = 30 * 60_000;
const KHOA_TOI_DA_MS = 24 * GIO;
/* Máy chủ lỗi / giới hạn kéo dài thì không gửi lại mãi (ngốn 4G người dân, nhất là
   tin kèm tệp lớn): giãn dần, quá THU_TOI_DA lần máy chủ bảo "thử lại" thì báo lỗi.
   Lỗi MẠNG cũng giãn (trọng tài P92 vòng 2) nhưng không có trần — vùng sóng yếu */
const THU_TOI_DA = 12;
const GIAN_DAU_MS = 20_000;
const GIAN_TOI_DA_MS = 15 * 60_000;
/** Dưới giới hạn thân yêu cầu của máy chủ (express.json 32mb) — lớn hơn thì gửi lại vô ích */
const TRAN_THAN = 30 * 1024 * 1024;
/* Hạn chờ một lần gửi theo cỡ thân (mạng 4G yếu tải lên chậm): tối thiểu / tốc độ giả định / tối đa */
const HAN_GUI_TOI_THIEU_MS = 60_000;
const BYTE_MOI_GIAY = 32 * 1024;
const HAN_GUI_TOI_DA_MS = 15 * 60_000;
/** Dạng mã tra cứu (server/src/lib/helpers.js generateTrackingCode) */
const DANG_MA_TRA_CUU = /^[A-Z0-9]{4,20}$/;

export type TrangThaiTin = 'cho' | 'can_xac_minh' | 'can_xac_minh_them' | 'loi' | 'qua_han';

interface BanGhiTin {
  id: string;
  taoLuc: number;
  trangThai: TrangThaiTin;
  loi?: string;
  /** Có thể máy chủ đã lưu (đã từng đi mà không có trả lời chắc chắn) — gửi lại chỉ trong HAN_GUI_LAI_GIO */
  coTheDaToi?: boolean;
  /** Số lần máy chủ trả lời "thử lại sau" (5xx, 429, đang gửi) và lúc được thử tiếp */
  soLanThu?: number;
  soLanMang?: number;
  henLuc?: number;
  /** henLuc do lỗi MẠNG (không phải máy chủ bảo đợi) — có mạng trở lại thì thử ngay */
  henMang?: boolean;
  iv: Uint8Array;
  duLieu: ArrayBuffer;
}

/** Phần mã hoá của một tin chờ */
interface NoiDungTin { url?: string; than: Record<string, unknown>; phien?: string; maMo?: string }

export interface TinChoTomTat { id: string; taoLuc: number; trangThai: TrangThaiTin; loi?: string; maMo?: string }

interface KetQuaDayDu {
  trackingCode: string;
  chatPin?: string;
  pendingReview?: boolean;
  category?: string;
  tepKhongNhan?: { ten: string; lyDo: string }[];
  phien?: string;
  maMo?: string;
}

export type KetQuaGuiNgam = Omit<KetQuaDayDu, 'phien' | 'maMo'> & { id: string };

/** Loại dấu thay cho tin / kết quả quá hạn (không còn nội dung) */
type LoaiDau = 'tin_chua_toi' | 'tin_co_the_toi' | 'tin_bi_tu_choi' | 'ket_qua';
interface NoiDungDau { maMo?: string; phien?: string; loai: LoaiDau; loi?: string }
interface BanGhiKetQua { id: string; taoLuc?: number; dau?: boolean; iv: Uint8Array; duLieu: ArrayBuffer }

/** Không cất được vào hàng chờ (đầy, quá lớn): báo nguyên lời này cho bà con */
export class KhongCatDuoc extends Error {}

/** Lỗi đặc biệt: tin đã được cất vào hàng chờ (không phải gửi hỏng) */
export class DaXepHang extends Error {
  code = 'DA_XEP_HANG';
  constructor(public maMo: string) { super('Tin đã được lưu trên máy và sẽ tự gửi khi có mạng.'); }
}

/** Mã của TRANG đang chạy — chỉ trong bộ nhớ, tải lại là trang khác */
const PHIEN_TRANG = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
  ? crypto.randomUUID() : String(Math.random()).slice(2);

function taoMaMo(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
  return String(n).padStart(6, '0');
}

export const coHangCho = typeof indexedDB !== 'undefined' && typeof crypto !== 'undefined' && Boolean(crypto.subtle);

function moKho(): Promise<IDBDatabase> {
  return new Promise((ok, loi) => {
    const rq = indexedDB.open(TEN_KHO, 1);
    rq.onupgradeneeded = () => {
      const db = rq.result;
      if (!db.objectStoreNames.contains(KHO_KHOA)) db.createObjectStore(KHO_KHOA);
      if (!db.objectStoreNames.contains(KHO_TIN)) db.createObjectStore(KHO_TIN, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(KHO_KET_QUA)) db.createObjectStore(KHO_KET_QUA, { keyPath: 'id' });
    };
    rq.onsuccess = () => ok(rq.result);
    rq.onerror = () => loi(rq.error);
  });
}

function lam<T>(ten: string, cheDo: IDBTransactionMode, viec: (k: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return moKho().then((db) => new Promise<T>((ok, loi) => {
    const tx = db.transaction(ten, cheDo);
    const rq = viec(tx.objectStore(ten));
    tx.oncomplete = () => { db.close(); ok(rq.result); };
    tx.onerror = () => { db.close(); loi(tx.error); };
  }));
}

/** Đọc rồi ghi MỘT bản ghi trong cùng một giao dịch (không đua giữa các tab) */
function docGhi<T>(ten: string, khoa: string, doi: (cu: T | undefined) => T | undefined): Promise<{ cu?: T; moi?: T }> {
  return moKho().then((db) => new Promise((ok, sai) => {
    const tx = db.transaction(ten, 'readwrite');
    const kho = tx.objectStore(ten);
    const kq: { cu?: T; moi?: T } = {};
    const rq = kho.get(khoa);
    rq.onsuccess = () => {
      kq.cu = rq.result as T | undefined;
      kq.moi = doi(kq.cu);
      if (kq.moi !== undefined) {
        if (kho.keyPath) kho.put(kq.moi);
        else kho.put(kq.moi, khoa);
      }
    };
    tx.oncomplete = () => { db.close(); ok(kq); };
    tx.onerror = () => { db.close(); sai(tx.error); };
  }));
}

const docKhoa = () => lam<CryptoKey | undefined>(KHO_KHOA, 'readonly', (k) => k.get(KHOA_KHOA) as IDBRequest<CryptoKey | undefined>);

/* Hai tab cùng tạo khoá lần đầu thì put() của tab sau ĐÈ khoá tab trước -> tin tab
   trước không giải mã được nữa. add() chỉ ghi khi chưa có; thua thì đọc lại khoá đã thắng */
async function layKhoa(): Promise<CryptoKey> {
  const cu = await docKhoa();
  if (cu) return cu;
  const moi = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  try {
    await lam(KHO_KHOA, 'readwrite', (k) => k.add(moi, KHOA_KHOA));
    return moi;
  } catch {
    const thang = await docKhoa();
    if (thang) return thang;
    throw new Error('Không tạo được khoá mã hoá trên máy.');
  }
}

async function maHoa(obj: unknown): Promise<{ iv: Uint8Array; duLieu: ArrayBuffer }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const duLieu = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await layKhoa(), new TextEncoder().encode(JSON.stringify(obj)));
  return { iv, duLieu };
}

/** Lỗi do CHÍNH dữ liệu hỏng (không giải mã / không đọc được), khác lỗi kho thoáng qua */
class DuLieuHong extends Error {}

async function giaiMa<T>(b: { iv: Uint8Array; duLieu: ArrayBuffer }): Promise<T> {
  const khoa = await layKhoa();   // lỗi kho (Safari "Connection to IndexedDB lost") ném nguyên
  try {
    const tho = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b.iv as BufferSource }, khoa, b.duLieu);
    return JSON.parse(new TextDecoder().decode(tho)) as T;
  } catch {
    throw new DuLieuHong('dữ liệu hỏng');
  }
}

const baoDoi = () => { try { window.dispatchEvent(new Event(SU_KIEN_HANG_CHO)); } catch { /* ngoài trang */ } };

/** Ghi địa chỉ nhận ý kiến của bản đang chạy — service worker gửi tới đúng địa chỉ này */
async function ghiDich() {
  try { await lam(KHO_KHOA, 'readwrite', (k) => k.put({ api: diaChiApi('/api/submissions') }, KHOA_DICH)); } catch { /* bỏ qua */ }
}

/** Nhờ service worker gửi cả khi đã đóng trang (chỉ trình duyệt có Background Sync) */
async function henDongBo() {
  try {
    const reg = await navigator.serviceWorker?.ready;
    await (reg as ServiceWorkerRegistration & { sync?: { register(t: string): Promise<void> } })?.sync?.register(THE_DONG_BO);
  } catch { /* không có Background Sync: trang tự gửi khi mở lại */ }
}

/**
 * Cất một tin (thân yêu cầu ĐÃ chuẩn bị, có maLanGui). Đủ TOI_DA_TIN thì từ chối.
 * `coTheDaToi`: lần gửi vừa rồi có thể đã tới máy chủ. Trả mã nhận kết quả.
 */
export async function themTinCho(than: Record<string, unknown>, coTheDaToi: boolean): Promise<string> {
  const ds = await lam<BanGhiTin[]>(KHO_TIN, 'readonly', (k) => k.getAll() as IDBRequest<BanGhiTin[]>);
  if (ds.length >= TOI_DA_TIN) {
    throw new KhongCatDuoc(`Máy này đang giữ ${ds.length} tin chờ gửi. Bà con chờ có mạng để các tin đó gửi đi, `
      + 'hoặc xoá bớt tin chờ. Việc khẩn cấp xin gọi ngay 113.');
  }
  /* Mã Turnstile chỉ dùng được một lần, vài phút là hết hạn: không cất — lúc gửi
     lại máy chủ cần thì xin mã mới (can_xac_minh_them) */
  const { xacMinhThem: _boQua, ...gon } = than;
  if (JSON.stringify(gon).length > TRAN_THAN) {
    throw new KhongCatDuoc('Tệp đính kèm quá lớn nên không lưu chờ gửi được. Bà con bớt tệp hoặc chọn tệp nhỏ hơn '
      + 'rồi gửi lại. Việc khẩn cấp xin gọi ngay 113.');
  }
  const maMo = taoMaMo();
  const noiDung: NoiDungTin = { than: gon, phien: PHIEN_TRANG, maMo };
  const ban: BanGhiTin = {
    id: String(than.maLanGui),
    taoLuc: Date.now(),
    trangThai: 'cho',
    coTheDaToi,
    ...(await maHoa(noiDung)),
  };
  await lam(KHO_TIN, 'readwrite', (k) => k.put(ban));
  await ghiDich();
  baoDoi();
  void henDongBo();
  return maMo;
}

const LOI_QUA_HAN_CO_THE_TOI = 'Tin chờ đã quá lâu chưa có trả lời chắc chắn nên máy dừng gửi (tin CÓ THỂ đã tới '
  + 'công an — gửi lại sẽ thành tin trùng). Bà con gọi trực ban để hỏi, rồi xoá tin chờ. Việc khẩn cấp xin gọi ngay 113.';
const LOI_QUA_HAN_CHUA_TOI = 'Tin chờ đã quá lâu chưa gửi được nên máy dừng gửi — tin CHƯA tới công an. Bà con soạn '
  + 'lại khi có mạng hoặc gọi trực ban. Việc khẩn cấp xin gọi ngay 113.';

/** Giờ tuổi của tin; đồng hồ máy bị chỉnh lùi (tin "ở tương lai") thì coi như vừa tạo */
const tuoiGio = (taoLuc: number) => Math.max(0, Date.now() - taoLuc) / GIO;

/** Thay tin / kết quả quá hạn bằng DẤU không nội dung (người soạn nhập mã còn biết) */
async function thanhDau(kho: string, id: string, nd: NoiDungDau) {
  const mh = await maHoa(nd);
  await lam(kho, 'readwrite', (k) => k.delete(id));
  await lam(KHO_KET_QUA, 'readwrite', (k) => k.put({ id: `dau:${id}`, taoLuc: Date.now(), dau: true, ...mh }));
}

/** Dừng tin quá hạn gửi; tin / kết quả quá hạn giữ thì thành dấu; dấu quá hạn thì xoá */
async function donQuaHan() {
  const ds = await lam<BanGhiTin[]>(KHO_TIN, 'readonly', (k) => k.getAll() as IDBRequest<BanGhiTin[]>);
  for (const b of ds) {
    if (b.taoLuc > Date.now()) { await capNhatTin(b.id, { taoLuc: Date.now() }); continue; }
    const tuoi = tuoiGio(b.taoLuc);
    if (tuoi > HAN_TIN_GIO + 24) {
      const nd = await giaiMa<NoiDungTin>(b).catch(() => null);
      const loai: LoaiDau = b.trangThai === 'loi' ? 'tin_bi_tu_choi' : b.coTheDaToi ? 'tin_co_the_toi' : 'tin_chua_toi';
      await thanhDau(KHO_TIN, b.id, { maMo: nd?.maMo, phien: nd?.phien, loai, loi: b.trangThai === 'loi' ? b.loi : undefined });
    } else if (b.trangThai !== 'qua_han' && b.trangThai !== 'loi'
      && ((b.coTheDaToi && tuoi > HAN_GUI_LAI_GIO) || tuoi > HAN_TIN_GIO)) {
      await doiTrangThai(b.id, 'qua_han', b.coTheDaToi ? LOI_QUA_HAN_CO_THE_TOI : LOI_QUA_HAN_CHUA_TOI);
    }
  }
  const kq = await lam<BanGhiKetQua[]>(KHO_KET_QUA, 'readonly', (k) => k.getAll() as IDBRequest<BanGhiKetQua[]>);
  for (const b of kq) {
    const tuoi = tuoiGio(b.taoLuc || 0);
    if (b.dau && tuoi > HAN_DAU_GIO) await lam(KHO_KET_QUA, 'readwrite', (k) => k.delete(b.id));
    else if (!b.dau && tuoi > HAN_KET_QUA_GIO) {
      const nd = await giaiMa<KetQuaDayDu>(b).catch(() => null);
      await thanhDau(KHO_KET_QUA, b.id, { maMo: nd?.maMo, phien: nd?.phien, loai: 'ket_qua' });
    }
  }
}

/** Tin chờ của CHÍNH trang này (tin trang khác không hiện — vẫn tự gửi ngầm) */
export async function dsTinCho(): Promise<TinChoTomTat[]> {
  if (!coHangCho) return [];
  try {
    await donQuaHan();
    const ds = await lam<BanGhiTin[]>(KHO_TIN, 'readonly', (k) => k.getAll() as IDBRequest<BanGhiTin[]>);
    const cua = await Promise.all(ds.map(async ({ id, taoLuc, trangThai, loi, iv, duLieu }) => {
      const nd = await giaiMa<NoiDungTin>({ iv, duLieu }).catch(() => null);
      return nd?.phien === PHIEN_TRANG ? { id, taoLuc, trangThai, loi, maMo: nd.maMo } : null;
    }));
    return cua.filter((x): x is NonNullable<typeof x> => x !== null).sort((a, b) => a.taoLuc - b.taoLuc);
  } catch {
    return [];
  }
}

export async function xoaTinCho(id: string) {
  await lam(KHO_TIN, 'readwrite', (k) => k.delete(id));
  baoDoi();
}

const congKhai = ({ phien: _p, maMo: _m, ...con }: KetQuaDayDu) => con;

/** Kết quả đã gửi của CHÍNH trang này */
export async function dsKetQua(): Promise<KetQuaGuiNgam[]> {
  if (!coHangCho) return [];
  try {
    const ds = await lam<BanGhiKetQua[]>(KHO_KET_QUA, 'readonly', (k) => k.getAll() as IDBRequest<BanGhiKetQua[]>);
    const kq = await Promise.all(ds.filter((b) => !b.dau).map(async (b): Promise<KetQuaGuiNgam | null> => {
      const nd = await giaiMa<KetQuaDayDu>(b).catch(() => null);
      return nd?.phien === PHIEN_TRANG ? { ...congKhai(nd), id: b.id } : null;
    }));
    return kq.filter((x): x is KetQuaGuiNgam => x !== null);
  } catch {
    return [];
  }
}

export type KetQuaNhanLai =
  | { loai: 'tin' | 'ket_qua' }
  | { loai: 'dau'; dau: LoaiDau; loi?: string }
  | { loai: 'sai'; conLai: number }
  | { loai: 'khoa'; den: number };

interface DemSai { sai: number; dot: number; khoaDen: number }

/**
 * Người soạn nhập mã nhận kết quả (ô cố định ở trang Tra cứu): gắn tin / kết quả đó
 * vào trang này để hiện lại. Không nói có tin hay không khi sai (ô luôn hiện, người
 * khác thử cũng không biết máy này có tin). Đếm sai TRƯỚC khi so, trong một giao
 * dịch — nhiều tab cùng dò vẫn chung một bộ đếm.
 */
export async function nhanLaiBangMa(ma: string): Promise<KetQuaNhanLai> {
  const bay = Date.now();
  const { cu, moi } = await docGhi<DemSai>(KHO_KHOA, KHOA_NHAN_LAI, (d) => {
    const dem = d || { sai: 0, dot: 0, khoaDen: 0 };
    if (dem.khoaDen > bay) return undefined;   // đang khoá: không ghi
    return { ...dem, sai: dem.sai + 1 };
  });
  if (!moi) return { loai: 'khoa', den: cu?.khoaDen || bay };
  const maSach = ma.trim();
  const timThay = /^\d{6}$/.test(maSach) ? await doiPhienTheoMa(maSach) : null;
  if (timThay) {
    await lam(KHO_KHOA, 'readwrite', (k) => k.put({ sai: 0, dot: 0, khoaDen: 0 }, KHOA_NHAN_LAI));
    baoDoi();
    return timThay;
  }
  if (moi.sai >= SAI_MOI_DOT) {
    const den = bay + Math.min(KHOA_DAU_MS * 2 ** moi.dot, KHOA_TOI_DA_MS);
    await lam(KHO_KHOA, 'readwrite', (k) => k.put({ sai: 0, dot: moi.dot + 1, khoaDen: den }, KHOA_NHAN_LAI));
    return { loai: 'khoa', den };
  }
  return { loai: 'sai', conLai: SAI_MOI_DOT - moi.sai };
}

/** Tìm tin / kết quả / dấu mang mã này; tìm thấy thì gắn vào trang này */
async function doiPhienTheoMa(ma: string): Promise<KetQuaNhanLai | null> {
  const tin = await lam<BanGhiTin[]>(KHO_TIN, 'readonly', (k) => k.getAll() as IDBRequest<BanGhiTin[]>);
  for (const b of tin) {
    const nd = await giaiMa<NoiDungTin>(b).catch(() => null);
    if (nd?.maMo !== ma) continue;
    const mh = await maHoa({ ...nd, phien: PHIEN_TRANG });
    await capNhatTin(b.id, mh);
    return { loai: 'tin' };
  }
  const kq = await lam<BanGhiKetQua[]>(KHO_KET_QUA, 'readonly', (k) => k.getAll() as IDBRequest<BanGhiKetQua[]>);
  for (const b of kq) {
    if (b.dau) {
      const nd = await giaiMa<NoiDungDau>(b).catch(() => null);
      if (nd?.maMo === ma) return { loai: 'dau', dau: nd.loai, loi: nd.loi };
      continue;
    }
    const nd = await giaiMa<KetQuaDayDu>(b).catch(() => null);
    if (nd?.maMo !== ma) continue;
    const mh = await maHoa({ ...nd, phien: PHIEN_TRANG });
    await lam(KHO_KET_QUA, 'readwrite', (k) => k.put({ ...b, ...mh }));
    saveTrackingCode(nd.trackingCode, nd.category);
    return { loai: 'ket_qua' };
  }
  return null;
}

/** Bà con đã lưu mã tra cứu + PIN -> xoá kết quả khỏi máy */
export async function xoaKetQua(id: string) {
  await lam(KHO_KET_QUA, 'readwrite', (k) => k.delete(id));
  baoDoi();
}

async function capNhatTin(id: string, doi: Partial<BanGhiTin>) {
  await docGhi<BanGhiTin>(KHO_TIN, id, (cu) => (cu ? { ...cu, ...doi } : undefined));
}

const doiTrangThai = (id: string, trangThai: TrangThaiTin, loi?: string) => capNhatTin(id, { trangThai, loi });

const gian = (n: number) => Date.now() + Math.min(GIAN_DAU_MS * 2 ** (n - 1), GIAN_TOI_DA_MS);

/** Máy chủ bảo thử lại sau: giữ LỜI máy chủ để hiện, giãn lần thử, quá trần thì báo lỗi */
async function henThuLai(ban: BanGhiTin, loi: string, coTheDaToi: boolean) {
  const n = (ban.soLanThu || 0) + 1;
  const toi = coTheDaToi ? { coTheDaToi: true } : {};
  if (n >= THU_TOI_DA) {
    return capNhatTin(ban.id, { ...toi, trangThai: 'loi', loi: `${loi} (đã thử ${n} lần, máy dừng tự gửi — bà con gọi trực ban hoặc xoá tin chờ rồi gửi lại sau)` });
  }
  return capNhatTin(ban.id, { ...toi, soLanThu: n, henLuc: gian(n), henMang: false, loi });
}

async function guiMot(ban: BanGhiTin, xacMinhThem?: string): Promise<void> {
  let nd: NoiDungTin;
  try {
    nd = await giaiMa<NoiDungTin>(ban);
  } catch (e) {
    if (!(e instanceof DuLieuHong)) return;   // kho trục trặc thoáng qua: để lượt sau
    /* Một tin hỏng không được chặn cả hàng chờ */
    return doiTrangThai(ban.id, 'loi', 'Không đọc được tin chờ này trên máy (dữ liệu trình duyệt có thể đã bị xoá một phần). '
      + 'Bà con xoá tin chờ rồi soạn lại. Việc khẩn cấp xin gọi ngay 113.');
  }
  const { than, phien, maMo } = nd;
  /* Luôn gửi tới máy chủ của BẢN NÀY, không tin địa chỉ cất trong bản ghi */
  const url = diaChiApi('/api/submissions');
  /* Vé "không phải người máy" mới nhất của trang (vé lúc cất có thể đã hết hạn) — vé
     không nằm trong dấu vân của lần gửi nên đổi được */
  const ve = layVe();
  const body = JSON.stringify({ ...than, ...(ve ? { veVaoCua: ve } : {}), ...(xacMinhThem ? { xacMinhThem } : {}) });
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: AbortSignal.timeout(Math.min(Math.max(HAN_GUI_TOI_THIEU_MS, (body.length / BYTE_MOI_GIAY) * 1000), HAN_GUI_TOI_DA_MS)),
    });
  } catch {
    /* Yêu cầu đã đi mà đứt / hết giờ: máy chủ CÓ THỂ đã lưu. Giãn lần thử (không trần) */
    const n = (ban.soLanMang || 0) + 1;
    return capNhatTin(ban.id, { coTheDaToi: true, soLanMang: n, henLuc: gian(n), henMang: true, loi: 'Mạng chập chờn, chưa gửi xong.' });
  }
  const j = await res.json().catch(() => ({} as Record<string, unknown>));
  const code = typeof j?.code === 'string' ? j.code : '';
  const loiMayChu = typeof j?.error === 'string' ? j.error : '';
  const daNhan = res.status === 200 || res.status === 201;
  /* 200 mà không có mã tra cứu đúng dạng (cổng mạng, máy chủ trả lạ): KHÔNG coi là đã
     nhận — xoá tin là mất tin */
  if (daNhan && !DANG_MA_TRA_CUU.test(String(j?.trackingCode ?? ''))) {
    return henThuLai(ban, 'Máy chủ trả lời không đúng dạng.', true);
  }
  if (daNhan) {
    const kq: KetQuaDayDu = {
      trackingCode: String(j.trackingCode),
      chatPin: j.chatPin ? String(j.chatPin) : undefined,
      pendingReview: j.pendingReview === true,
      category: typeof than.category === 'string' ? than.category : undefined,
      tepKhongNhan: Array.isArray(j.tepKhongNhan) ? j.tepKhongNhan : [],
      phien,
      maMo,
    };
    /* Cất kết quả TRƯỚC, xoá tin SAU: đứt giữa chừng thì lần sau gửi lại cùng mã —
       máy chủ trả lại đúng mã tra cứu, không mất */
    const mh = await maHoa(kq);
    await lam(KHO_KET_QUA, 'readwrite', (k) => k.put({ id: ban.id, taoLuc: Date.now(), ...mh }));
    /* Lịch sử tra cứu của máy chỉ ghi cho đúng trang đã soạn (máy dùng chung) */
    if (phien === PHIEN_TRANG) saveTrackingCode(kq.trackingCode, kq.category);
    await xoaTinCho(ban.id);
    return;
  }
  if (res.status === 403 && code === 'CAN_XAC_MINH') return doiTrangThai(ban.id, 'can_xac_minh');
  if (res.status === 429 && code === 'CAN_XAC_MINH_THEM') return doiTrangThai(ban.id, 'can_xac_minh_them');
  /* Thử lại sau: đang gửi (lần khác cùng mã — máy chủ đã có bản ghi), giới hạn tạm
     thời, máy chủ lỗi (có thể đã lưu) */
  if ((res.status === 409 && code === 'DANG_GUI') || res.status === 429 || res.status >= 500) {
    return henThuLai(ban, loiMayChu || `Máy chủ chưa nhận được (mã ${res.status}).`, res.status !== 429);
  }
  /* Còn lại là từ chối hẳn (400, 409 LAN_GUI_KHAC...): báo lý do, không gửi nữa */
  return doiTrangThai(ban.id, 'loi', loiMayChu || `Máy chủ từ chối (mã ${res.status}).`);
}

let dangChay = false;
/** Có lượt gửi đang chạy trong trang này không (thanh báo khoá nút xoá theo cờ này) */
export const dangGuiHangCho = () => dangChay;
/* Lượt bị gọi lúc đang chạy: chạy thêm một lượt sau (bà con vừa xác minh mà lượt cũ
   đang chạy thì thao tác không bị bỏ rơi) */
let chayLai: { xacMinhThem?: string; nguoiBam: boolean; coMangMoi: boolean } | null = null;
/**
 * Gửi các tin chờ (của mọi trang — tin trang khác gửi ngầm, không hiện). Một lượt một
 * lúc (giữa các tab và với service worker qua Web Locks nếu có). `xacMinhThem`: mã
 * Turnstile tươi cho MỘT tin đang cần xác minh thêm (mã chỉ dùng được một lần).
 * `nguoiBam`: do bà con vừa thao tác — tab khác / service worker đang giữ lượt thì
 * đợi rồi thử lại, không bỏ. `coMangMoi`: vừa có mạng trở lại — tin đang giãn vì lỗi
 * MẠNG thì thử ngay (giãn vì máy chủ bảo đợi thì vẫn đợi).
 */
export async function guiTinCho(xacMinhThem?: string, nguoiBam = false, coMangMoi = false): Promise<void> {
  if (!coHangCho) return;
  if (dangChay) {
    chayLai = {
      xacMinhThem: xacMinhThem ?? chayLai?.xacMinhThem,
      nguoiBam: nguoiBam || Boolean(chayLai?.nguoiBam),
      coMangMoi: coMangMoi || Boolean(chayLai?.coMangMoi),
    };
    return;
  }
  dangChay = true;
  baoDoi();
  let maThem = xacMinhThem;
  let biGiu = false;
  let conCho = false;
  const chay = async () => {
    let ds: BanGhiTin[] = [];
    try {
      await ghiDich();
      await donQuaHan();
      ds = await lam<BanGhiTin[]>(KHO_TIN, 'readonly', (k) => k.getAll() as IDBRequest<BanGhiTin[]>);
    } catch { return; }
    for (const { id } of ds.sort((a, b) => a.taoLuc - b.taoLuc)) {
      if (navigator.onLine === false) { conCho = true; break; }
      /* ĐỌC LẠI ngay trước khi gửi: bà con vừa bấm xoá thì không gửi (trọng tài P92 vòng 2) */
      const ban = await lam<BanGhiTin | undefined>(KHO_TIN, 'readonly', (k) => k.get(id) as IDBRequest<BanGhiTin | undefined>).catch(() => undefined);
      if (!ban || ban.trangThai === 'loi' || ban.trangThai === 'qua_han') continue;
      conCho = true;
      /* Máy chủ bảo đợi — chưa tới lượt (henLuc xa quá trần là đồng hồ máy bị chỉnh: bỏ qua hẹn) */
      const henCon = ban.henLuc && ban.henLuc > Date.now() && ban.henLuc < Date.now() + GIAN_TOI_DA_MS;
      if (henCon && !(coMangMoi && ban.henMang)) continue;
      if (ban.trangThai === 'can_xac_minh' && !layVe()) continue;
      if (ban.trangThai === 'can_xac_minh_them' && !maThem) continue;
      if (ban.trangThai !== 'cho') await doiTrangThai(ban.id, 'cho');
      const ma = ban.trangThai === 'can_xac_minh_them' ? maThem : undefined;
      if (ma) maThem = undefined;   // tin sau cần mã khác: thanh báo dựng ô mới
      await guiMot(ban, ma);
    }
  };
  try {
    const locks = (navigator as Navigator & { locks?: { request(n: string, o: object, f: (l: unknown) => Promise<void>): Promise<void> } }).locks;
    if (locks) await locks.request(THE_DONG_BO, { ifAvailable: true }, async (lock) => { if (lock) await chay(); else biGiu = true; });
    else await chay();
  } finally {
    dangChay = false;
    baoDoi();
    /* Còn tin chưa xong: nhờ service worker thử tiếp cả khi bà con đóng trang */
    if (conCho) void henDongBo();
    const tiep = chayLai;
    chayLai = null;
    if (tiep) void guiTinCho(tiep.xacMinhThem, tiep.nguoiBam, tiep.coMangMoi);
    else if (biGiu && nguoiBam) setTimeout(() => { void guiTinCho(xacMinhThem, true); }, 3000);
  }
}

/** Xoá sạch tin chờ + kết quả trên máy (máy dùng chung) */
export async function xoaHetHangCho() {
  await lam(KHO_TIN, 'readwrite', (k) => k.clear());
  await lam(KHO_KET_QUA, 'readwrite', (k) => k.clear());
  baoDoi();
}
