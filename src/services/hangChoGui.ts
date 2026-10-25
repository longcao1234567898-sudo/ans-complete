/**
 * HÀNG CHỜ GỬI NGẦM — mất mạng vẫn gửi được, có mạng thì tự gửi (P92)
 * ============================================================================
 *
 * Bà con bấm "Gửi" lúc mất mạng (hoặc mạng đứt giữa chừng, máy chủ không trả lời)
 * thì tin được cất ở đây và tự gửi khi có mạng: khi trang đang mở (sự kiện
 * "online", hẹn giờ), khi mở lại trang, và trên Android/Chrome cả khi đã đóng trang
 * (Background Sync — public/sw.js đọc cùng kho này).
 *
 * BẢO VỆ TIN TRÊN MÁY:
 *   · Mã hoá AES-GCM 256, khoá sinh trong trình duyệt và KHÔNG xuất ra được
 *     (extractable = false). Ai sao chép thư mục dữ liệu trình duyệt cũng chỉ thấy
 *     chuỗi mã hoá. (Không chống được người mở chính trình duyệt này — giao diện
 *     vì vậy không bao giờ HIỆN LẠI nội dung tin chờ, chỉ báo "có 1 tin chờ" + nút xoá.)
 *   · Gửi được là XOÁ NGAY. Mã tra cứu + PIN của tin đã gửi ngầm cũng mã hoá, chỉ
 *     giữ tới lúc bà con bấm "Đã lưu mã".
 *
 * GỬI LẠI KHÔNG TRÙNG (P91, ND-076): mỗi tin giữ NGUYÊN thân yêu cầu đã chuẩn bị
 * (kể cả ảnh đã tải lên) cùng `maLanGui`. Máy chủ nhận ra lần gửi lại và trả lại
 * đúng mã tra cứu + PIN. Chỉ thay vé "không phải người máy" (không nằm trong dấu vân).
 *
 * MÁY DÙNG CHUNG (trọng tài P92): người mở trình duyệt sau không được thấy mã tra cứu
 * + PIN của người trước (mã tra cứu đọc được nội dung tin). Mỗi tin gắn với PHIÊN đã
 * soạn (sessionStorage — đóng trình duyệt là hết) và một MÃ NHẬN KẾT QUẢ 6 số chỉ hiện
 * cho người soạn. Khác phiên: không hiện mã tra cứu, không ghi vào lịch sử máy, chỉ
 * mở được bằng mã nhận kết quả (sai SAI_TOI_DA lần thì xoá kết quả — người gửi gọi
 * trực ban). Chỉ chống người dùng sau bình thường; người mở công cụ lập trình của
 * chính trình duyệt này đọc được mọi thứ trang đọc được.
 *
 * HẠN SỐNG: máy chủ chỉ nhận ra lần gửi lại trong SONG_GIO giờ (P91). Tin có thể ĐÃ
 * tới máy chủ (mạng đứt lúc chờ trả lời) mà quá HAN_GUI_LAI_GIO thì không gửi lại nữa
 * — gửi là thành đơn thứ hai; báo bà con gọi trực ban. Tin chắc chắn chưa tới (bấm Gửi
 * lúc máy báo mất mạng) gửi tới HAN_TIN_GIO. Quá hạn thì dừng, rồi tự xoá khỏi máy.
 *
 * Trạng thái một tin: cho (đợi mạng) · can_xac_minh (máy chủ đòi vé — cần bà con tích
 * ô ở trang) · can_xac_minh_them (mạng đông, cần mã Turnstile tươi) · loi (máy chủ
 * từ chối hẳn — báo lý do, bà con xoá) · qua_han (quá hạn gửi lại).
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
const GIO = 3_600_000;
/** Dưới SONG_GIO (24) của server/src/lib/lan-gui.js, chừa biên đồng hồ máy lệch */
const HAN_GUI_LAI_GIO = 20;
const HAN_TIN_GIO = 72;
/** Kết quả chưa ai bấm "đã lưu mã" — quá hạn này thì xoá khỏi máy */
const HAN_KET_QUA_GIO = 72;
const SAI_TOI_DA = 5;
const KHOA_PHIEN = 'htans_phien_hang_cho';

export type TrangThaiTin = 'cho' | 'can_xac_minh' | 'can_xac_minh_them' | 'loi' | 'qua_han';

interface BanGhiTin {
  id: string;
  taoLuc: number;
  trangThai: TrangThaiTin;
  loi?: string;
  /** Có thể máy chủ đã lưu (mạng đứt lúc chờ trả lời) — gửi lại chỉ trong HAN_GUI_LAI_GIO */
  coTheDaToi?: boolean;
  iv: Uint8Array;
  duLieu: ArrayBuffer;
}

/** Phần mã hoá của một tin chờ */
interface NoiDungTin { url: string; than: Record<string, unknown>; phien?: string; maMo?: string }

export interface TinChoTomTat {
  id: string; taoLuc: number; trangThai: TrangThaiTin; loi?: string;
  /** Tin do chính phiên trình duyệt này soạn */
  cuaPhienNay: boolean;
  /** Mã nhận kết quả — chỉ có khi cuaPhienNay */
  maMo?: string;
}

interface KetQuaDayDu {
  trackingCode: string;
  chatPin?: string;
  pendingReview?: boolean;
  category?: string;
  tepKhongNhan?: { ten: string; lyDo: string }[];
  phien?: string;
  maMo?: string;
}

export interface KetQuaGuiNgam extends Partial<Omit<KetQuaDayDu, 'phien' | 'maMo'>> {
  id: string;
  /** false: tin của phiên khác — mã tra cứu ẩn tới khi nhập đúng mã nhận kết quả */
  cuaPhienNay: boolean;
}

interface BanGhiKetQua { id: string; taoLuc?: number; soLanSai?: number; iv: Uint8Array; duLieu: ArrayBuffer }

/** Lỗi đặc biệt: tin đã được cất vào hàng chờ (không phải gửi hỏng) */
export class DaXepHang extends Error {
  code = 'DA_XEP_HANG';
  constructor(public maMo: string) { super('Tin đã được lưu trên máy và sẽ tự gửi khi có mạng.'); }
}

/** Mã phiên trình duyệt (sessionStorage: mỗi tab, đóng là hết). Không đọc được thì
    mỗi lần tải trang một mã — coi như phiên khác (an toàn: ẩn mã tra cứu) */
let phienDuPhong = '';
function maPhien(): string {
  try {
    let p = sessionStorage.getItem(KHOA_PHIEN);
    if (!p) { p = crypto.randomUUID(); sessionStorage.setItem(KHOA_PHIEN, p); }
    return p;
  } catch {
    return phienDuPhong || (phienDuPhong = crypto.randomUUID());
  }
}

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

async function layKhoa(): Promise<CryptoKey> {
  const cu = await lam<CryptoKey | undefined>(KHO_KHOA, 'readonly', (k) => k.get(KHOA_KHOA) as IDBRequest<CryptoKey | undefined>);
  if (cu) return cu;
  const moi = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  await lam(KHO_KHOA, 'readwrite', (k) => k.put(moi, KHOA_KHOA));
  return moi;
}

async function maHoa(obj: unknown): Promise<{ iv: Uint8Array; duLieu: ArrayBuffer }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const duLieu = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await layKhoa(), new TextEncoder().encode(JSON.stringify(obj)));
  return { iv, duLieu };
}

async function giaiMa<T>(b: { iv: Uint8Array; duLieu: ArrayBuffer }): Promise<T> {
  const tho = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b.iv as BufferSource }, await layKhoa(), b.duLieu);
  return JSON.parse(new TextDecoder().decode(tho)) as T;
}

const baoDoi = () => { try { window.dispatchEvent(new Event(SU_KIEN_HANG_CHO)); } catch { /* ngoài trang */ } };

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
  const ds = await dsTinCho();
  if (ds.length >= TOI_DA_TIN) {
    throw new Error(`Máy này đang giữ ${ds.length} tin chờ gửi. Bà con chờ có mạng để các tin đó gửi đi, `
      + 'hoặc xoá bớt tin chờ. Việc khẩn cấp xin gọi ngay 113.');
  }
  /* Mã Turnstile chỉ dùng được một lần, vài phút là hết hạn: không cất — lúc gửi
     lại máy chủ cần thì xin mã mới (can_xac_minh_them) */
  const { xacMinhThem: _boQua, ...gon } = than;
  const maMo = taoMaMo();
  const noiDung: NoiDungTin = { url: diaChiApi('/api/submissions'), than: gon, phien: maPhien(), maMo };
  const ban: BanGhiTin = {
    id: String(than.maLanGui),
    taoLuc: Date.now(),
    trangThai: 'cho',
    coTheDaToi,
    ...(await maHoa(noiDung)),
  };
  await lam(KHO_TIN, 'readwrite', (k) => k.put(ban));
  baoDoi();
  void henDongBo();
  return maMo;
}

const LOI_QUA_HAN = 'Tin chờ đã quá lâu chưa gửi được nên máy dừng gửi (có thể tin đã tới công an — gửi lại '
  + 'sẽ thành tin trùng). Bà con gọi trực ban để hỏi, rồi xoá tin chờ. Việc khẩn cấp xin gọi ngay 113.';

/** Dừng tin quá hạn gửi lại, xoá tin / kết quả đã quá hạn giữ trên máy */
async function donQuaHan() {
  const bay = Date.now();
  const ds = await lam<BanGhiTin[]>(KHO_TIN, 'readonly', (k) => k.getAll() as IDBRequest<BanGhiTin[]>);
  for (const b of ds) {
    const tuoi = (bay - b.taoLuc) / GIO;
    if (tuoi > HAN_TIN_GIO + 24) await lam(KHO_TIN, 'readwrite', (k) => k.delete(b.id));
    else if (b.trangThai !== 'qua_han' && ((b.coTheDaToi && tuoi > HAN_GUI_LAI_GIO) || tuoi > HAN_TIN_GIO)) {
      await doiTrangThai(b.id, 'qua_han', LOI_QUA_HAN);
    }
  }
  const kq = await lam<BanGhiKetQua[]>(KHO_KET_QUA, 'readonly', (k) => k.getAll() as IDBRequest<BanGhiKetQua[]>);
  for (const b of kq) {
    if (b.taoLuc && (bay - b.taoLuc) / GIO > HAN_KET_QUA_GIO) await lam(KHO_KET_QUA, 'readwrite', (k) => k.delete(b.id));
  }
}

export async function dsTinCho(): Promise<TinChoTomTat[]> {
  if (!coHangCho) return [];
  try {
    await donQuaHan();
    const ds = await lam<BanGhiTin[]>(KHO_TIN, 'readonly', (k) => k.getAll() as IDBRequest<BanGhiTin[]>);
    const phien = maPhien();
    const tomTat = await Promise.all(ds.map(async ({ id, taoLuc, trangThai, loi, iv, duLieu }) => {
      const nd = await giaiMa<NoiDungTin>({ iv, duLieu }).catch(() => null);
      const cuaPhienNay = Boolean(nd?.phien) && nd?.phien === phien;
      return { id, taoLuc, trangThai, loi, cuaPhienNay, ...(cuaPhienNay ? { maMo: nd?.maMo } : {}) };
    }));
    return tomTat.sort((a, b) => a.taoLuc - b.taoLuc);
  } catch {
    return [];
  }
}

export async function xoaTinCho(id: string) {
  await lam(KHO_TIN, 'readwrite', (k) => k.delete(id));
  baoDoi();
}

const congKhai = ({ phien: _p, maMo: _m, ...con }: KetQuaDayDu) => con;

/** Kết quả đã gửi. Của phiên khác thì KHÔNG kèm mã tra cứu / PIN (xem moKetQua) */
export async function dsKetQua(): Promise<KetQuaGuiNgam[]> {
  if (!coHangCho) return [];
  try {
    const ds = await lam<BanGhiKetQua[]>(KHO_KET_QUA, 'readonly', (k) => k.getAll() as IDBRequest<BanGhiKetQua[]>);
    const phien = maPhien();
    const kq = await Promise.all(ds.map(async (b): Promise<KetQuaGuiNgam | null> => {
      const nd = await giaiMa<KetQuaDayDu>(b).catch(() => null);
      if (!nd) return null;
      const cuaPhienNay = Boolean(nd.phien) && nd.phien === phien;
      return cuaPhienNay ? { ...congKhai(nd), id: b.id, cuaPhienNay } : { id: b.id, cuaPhienNay, category: nd.category };
    }));
    return kq.filter((x): x is KetQuaGuiNgam => x !== null);
  } catch {
    return [];
  }
}

/**
 * Mở kết quả của phiên khác bằng mã nhận kết quả. Sai SAI_TOI_DA lần thì xoá hẳn
 * (người dùng sau không dò được; người gửi thật gọi trực ban hỏi lại).
 */
export async function moKetQua(id: string, maNhap: string): Promise<{ kq?: KetQuaGuiNgam; conLai: number }> {
  const b = await lam<BanGhiKetQua | undefined>(KHO_KET_QUA, 'readonly', (k) => k.get(id) as IDBRequest<BanGhiKetQua | undefined>);
  if (!b) return { conLai: 0 };
  const nd = await giaiMa<KetQuaDayDu>(b);
  if (nd.maMo && maNhap.trim() === nd.maMo) {
    saveTrackingCode(nd.trackingCode, nd.category);
    return { kq: { ...congKhai(nd), id, cuaPhienNay: true }, conLai: SAI_TOI_DA };
  }
  const sai = (b.soLanSai || 0) + 1;
  if (sai >= SAI_TOI_DA) await lam(KHO_KET_QUA, 'readwrite', (k) => k.delete(id));
  else await lam(KHO_KET_QUA, 'readwrite', (k) => k.put({ ...b, soLanSai: sai }));
  baoDoi();
  return { conLai: SAI_TOI_DA - sai };
}

/** Bà con đã lưu mã tra cứu + PIN -> xoá kết quả khỏi máy */
export async function xoaKetQua(id: string) {
  await lam(KHO_KET_QUA, 'readwrite', (k) => k.delete(id));
  baoDoi();
}

async function doiTrangThai(id: string, trangThai: TrangThaiTin, loi?: string) {
  const db = await moKho();
  await new Promise<void>((ok, sai) => {
    const tx = db.transaction(KHO_TIN, 'readwrite');
    const kho = tx.objectStore(KHO_TIN);
    const rq = kho.get(id);
    rq.onsuccess = () => { if (rq.result) kho.put({ ...rq.result, trangThai, loi }); };
    tx.oncomplete = () => { db.close(); ok(); };
    tx.onerror = () => { db.close(); sai(tx.error); };
  });
}

async function guiMot(ban: BanGhiTin, xacMinhThem?: string): Promise<void> {
  const { url, than, phien, maMo } = await giaiMa<NoiDungTin>(ban);
  /* Vé "không phải người máy" mới nhất của trang (vé lúc cất có thể đã hết hạn) — vé
     không nằm trong dấu vân của lần gửi nên đổi được */
  const ve = layVe();
  const thanGui = { ...than, ...(ve ? { veVaoCua: ve } : {}), ...(xacMinhThem ? { xacMinhThem } : {}) };
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(thanGui),
      signal: AbortSignal.timeout(60_000),
    });
  } catch {
    return;   // vẫn mất mạng / hết giờ: để nguyên, thử lại sau
  }
  const j = await res.json().catch(() => ({} as Record<string, unknown>));
  const code = typeof j?.code === 'string' ? j.code : '';
  if (res.status === 200 || res.status === 201) {
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
    /* Lịch sử tra cứu của máy chỉ ghi cho đúng người soạn (máy dùng chung) */
    if (phien && phien === maPhien()) saveTrackingCode(kq.trackingCode, kq.category);
    await xoaTinCho(ban.id);
    return;
  }
  if (res.status === 403 && code === 'CAN_XAC_MINH') return doiTrangThai(ban.id, 'can_xac_minh');
  if (res.status === 429 && code === 'CAN_XAC_MINH_THEM') return doiTrangThai(ban.id, 'can_xac_minh_them');
  /* Thử lại sau: đang gửi (lần khác cùng mã), giới hạn tạm thời, máy chủ lỗi */
  if (res.status === 409 && code === 'DANG_GUI') return;
  if (res.status === 429 || res.status >= 500) return;
  /* Còn lại là từ chối hẳn (400, 409 LAN_GUI_KHAC...): báo lý do, không gửi nữa */
  return doiTrangThai(ban.id, 'loi', typeof j?.error === 'string' ? j.error : `Máy chủ từ chối (mã ${res.status}).`);
}

let dangChay = false;
/**
 * Gửi các tin chờ. Một lượt một lúc (giữa các tab và với service worker qua Web
 * Locks nếu có). `xacMinhThem`: mã Turnstile tươi cho tin đang cần xác minh thêm.
 */
export async function guiTinCho(xacMinhThem?: string): Promise<void> {
  if (!coHangCho || dangChay) return;
  dangChay = true;
  const chay = async () => {
    let ds: BanGhiTin[] = [];
    try {
      await donQuaHan();
      ds = await lam<BanGhiTin[]>(KHO_TIN, 'readonly', (k) => k.getAll() as IDBRequest<BanGhiTin[]>);
    } catch { return; }
    for (const ban of ds.sort((a, b) => a.taoLuc - b.taoLuc)) {
      if (ban.trangThai === 'loi' || ban.trangThai === 'qua_han') continue;
      if (ban.trangThai === 'can_xac_minh' && !layVe()) continue;
      if (ban.trangThai === 'can_xac_minh_them' && !xacMinhThem) continue;
      if (ban.trangThai !== 'cho') await doiTrangThai(ban.id, 'cho');
      await guiMot(ban, ban.trangThai === 'can_xac_minh_them' ? xacMinhThem : undefined);
    }
  };
  try {
    const locks = (navigator as Navigator & { locks?: { request(n: string, o: object, f: (l: unknown) => Promise<void>): Promise<void> } }).locks;
    if (locks) await locks.request(THE_DONG_BO, { ifAvailable: true }, async (lock) => { if (lock) await chay(); });
    else await chay();
  } finally {
    dangChay = false;
    baoDoi();
  }
}

/** Xoá sạch tin chờ + kết quả trên máy (máy dùng chung) */
export async function xoaHetHangCho() {
  await lam(KHO_TIN, 'readwrite', (k) => k.clear());
  await lam(KHO_KET_QUA, 'readwrite', (k) => k.clear());
  baoDoi();
}
