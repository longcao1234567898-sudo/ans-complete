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
 * Trạng thái một tin: cho (đợi mạng) · can_xac_minh (máy chủ đòi vé — cần bà con tích
 * ô ở trang) · can_xac_minh_them (mạng đông, cần mã Turnstile tươi) · loi (máy chủ
 * từ chối hẳn — báo lý do, bà con xoá).
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

export type TrangThaiTin = 'cho' | 'can_xac_minh' | 'can_xac_minh_them' | 'loi';

interface BanGhiTin {
  id: string;
  taoLuc: number;
  trangThai: TrangThaiTin;
  loi?: string;
  iv: Uint8Array;
  duLieu: ArrayBuffer;
}

export interface TinChoTomTat { id: string; taoLuc: number; trangThai: TrangThaiTin; loi?: string }

export interface KetQuaGuiNgam {
  id: string;
  trackingCode: string;
  chatPin?: string;
  pendingReview?: boolean;
  category?: string;
  tepKhongNhan?: { ten: string; lyDo: string }[];
}

/** Lỗi đặc biệt: tin đã được cất vào hàng chờ (không phải gửi hỏng) */
export class DaXepHang extends Error {
  code = 'DA_XEP_HANG';
  constructor() { super('Tin đã được lưu trên máy và sẽ tự gửi khi có mạng.'); }
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

/** Cất một tin (thân yêu cầu ĐÃ chuẩn bị, có maLanGui). Đủ TOI_DA_TIN thì từ chối */
export async function themTinCho(than: Record<string, unknown>): Promise<void> {
  const ds = await dsTinCho();
  if (ds.length >= TOI_DA_TIN) {
    throw new Error(`Máy này đang giữ ${ds.length} tin chờ gửi. Bà con chờ có mạng để các tin đó gửi đi, `
      + 'hoặc xoá bớt tin chờ. Việc khẩn cấp xin gọi ngay 113.');
  }
  /* Mã Turnstile chỉ dùng được một lần, vài phút là hết hạn: không cất — lúc gửi
     lại máy chủ cần thì xin mã mới (can_xac_minh_them) */
  const { xacMinhThem: _boQua, ...gon } = than;
  const ban: BanGhiTin = {
    id: String(than.maLanGui),
    taoLuc: Date.now(),
    trangThai: 'cho',
    ...(await maHoa({ url: diaChiApi('/api/submissions'), than: gon })),
  };
  await lam(KHO_TIN, 'readwrite', (k) => k.put(ban));
  baoDoi();
  void henDongBo();
}

export async function dsTinCho(): Promise<TinChoTomTat[]> {
  if (!coHangCho) return [];
  try {
    const ds = await lam<BanGhiTin[]>(KHO_TIN, 'readonly', (k) => k.getAll() as IDBRequest<BanGhiTin[]>);
    return ds.map(({ id, taoLuc, trangThai, loi }) => ({ id, taoLuc, trangThai, loi })).sort((a, b) => a.taoLuc - b.taoLuc);
  } catch {
    return [];
  }
}

export async function xoaTinCho(id: string) {
  await lam(KHO_TIN, 'readwrite', (k) => k.delete(id));
  baoDoi();
}

export async function dsKetQua(): Promise<KetQuaGuiNgam[]> {
  if (!coHangCho) return [];
  try {
    const ds = await lam<{ id: string; iv: Uint8Array; duLieu: ArrayBuffer }[]>(KHO_KET_QUA, 'readonly', (k) => k.getAll() as IDBRequest<{ id: string; iv: Uint8Array; duLieu: ArrayBuffer }[]>);
    return Promise.all(ds.map(async (b) => ({ ...(await giaiMa<Omit<KetQuaGuiNgam, 'id'>>(b)), id: b.id })));
  } catch {
    return [];
  }
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
  const { url, than } = await giaiMa<{ url: string; than: Record<string, unknown> }>(ban);
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
    const kq: Omit<KetQuaGuiNgam, 'id'> = {
      trackingCode: String(j.trackingCode),
      chatPin: j.chatPin ? String(j.chatPin) : undefined,
      pendingReview: j.pendingReview === true,
      category: typeof than.category === 'string' ? than.category : undefined,
      tepKhongNhan: Array.isArray(j.tepKhongNhan) ? j.tepKhongNhan : [],
    };
    /* Cất kết quả TRƯỚC, xoá tin SAU: đứt giữa chừng thì lần sau gửi lại cùng mã —
       máy chủ trả lại đúng mã tra cứu, không mất */
    const mh = await maHoa(kq);
    await lam(KHO_KET_QUA, 'readwrite', (k) => k.put({ id: ban.id, ...mh }));
    saveTrackingCode(kq.trackingCode, kq.category);
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
    try { ds = await lam<BanGhiTin[]>(KHO_TIN, 'readonly', (k) => k.getAll() as IDBRequest<BanGhiTin[]>); } catch { return; }
    for (const ban of ds.sort((a, b) => a.taoLuc - b.taoLuc)) {
      if (ban.trangThai === 'loi') continue;
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
