/**
 * Dịch vụ cho khu vực cán bộ: đăng nhập, giữ access token, gọi API admin.
 * Refresh token do backend quản lý qua httpOnly cookie.
 */
import { hasBackend } from './api';
import { layVe, veHetHan } from '../utils/veVaoCua';

const API_URL = (
  (import.meta.env.VITE_ADMIN_API_URL as string | undefined)?.trim() ||
  (import.meta.env.VITE_API_URL as string | undefined)?.trim() ||
  ''
).replace(/\/$/, '');

export interface StaffInfo {
  id: number;
  name: string;
  username: string;
  role: 'admin' | 'manager' | 'handler';
}

/* Access token và thông tin cán bộ giữ trong RAM, KHÔNG lưu sessionStorage.
   VÌ SAO: sessionStorage đọc/ghi được bằng JavaScript, nên
     - một lỗ XSS là mất trắng vé đăng nhập của cán bộ;
     - và chỉ cần một dòng trong Console
         sessionStorage.setItem('htans_admin_staff', '{"role":"admin",...}')
       là vào được toàn bộ giao diện quản trị (AdminLayout chỉ chặn bằng `if (!staff)`).
   Mất token khi F5 không sao: restoreSession() lấy lại được từ cookie refresh
   httpOnly, cán bộ không thấy khác biệt. */
let accessToken: string | null = null;
let currentStaff: StaffInfo | null = null;

/** Lấy token đang giữ */
export function getToken(): string | null {
  return accessToken;
}

/** Lấy thông tin cán bộ đang đăng nhập */
export function getStoredStaff(): StaffInfo | null {
  return currentStaff;
}

function saveSession(token: string, staff: StaffInfo) {
  accessToken = token;
  currentStaff = staff;
}

function clearSession() {
  accessToken = null;
  currentStaff = null;
}

/** Gọi API có kèm token; tự thử refresh 1 lần nếu token hết hạn */
export async function adminFetch<T>(path: string, options: RequestInit = {}, retry = true): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
    credentials: 'include', // gửi kèm cookie refresh token
  });

  if (res.status === 401 && retry) {
    // Thử làm mới token rồi gọi lại
    const ok = await tryRefresh();
    if (ok) return adminFetch<T>(path, options, false);
    clearSession();
    throw new Error('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string })?.error || `Lỗi máy chủ (${res.status})`);
  return data as T;
}

/** Đăng nhập */
/** Lỗi đăng nhập kèm cờ báo cần xác minh captcha */
export class LoginError extends Error {
  canCaptcha: boolean;
  constructor(message: string, canCaptcha = false) {
    super(message);
    this.canCaptcha = canCaptcha;
  }
}

export async function login(
  username: string,
  password: string,
  captchaToken?: string
): Promise<StaffInfo> {
  if (!hasBackend) throw new Error('Chưa cấu hình máy chủ. Cần chạy backend để đăng nhập.');
  const res = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    /* veVaoCua: vé cổng vào (ADR-003 việc 23). captchaToken chỉ còn dùng khi
       máy chủ đòi xác minh thêm sau nhiều lần đăng nhập sai. */
    body: JSON.stringify({ username, password, captchaToken, veVaoCua: layVe() }),
    credentials: 'include',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const d = data as { error?: string; canCaptcha?: boolean; code?: string };
    if (d?.code === 'CAN_XAC_MINH') veHetHan();
    throw new LoginError(d?.error || 'Đăng nhập thất bại.', Boolean(d?.canCaptcha));
  }
  const { accessToken, staff } = data as { accessToken: string; staff: StaffInfo };
  saveSession(accessToken, staff);
  return staff;
}

/** Làm mới access token bằng refresh cookie */
async function tryRefresh(): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/api/auth/refresh`, { method: 'POST', credentials: 'include' });
    if (!res.ok) return false;
    const { accessToken, staff } = (await res.json()) as { accessToken: string; staff: StaffInfo };
    saveSession(accessToken, staff);
    return true;
  } catch {
    return false;
  }
}

/**
 * Khôi phục phiên sau khi tải lại trang (token nằm trong RAM nên F5 là mất).
 * Trả về thông tin cán bộ nếu cookie refresh còn hiệu lực, ngược lại null.
 */
export async function restoreSession(): Promise<StaffInfo | null> {
  if (!hasBackend) return null;
  return (await tryRefresh()) ? currentStaff : null;
}

/** Đăng xuất */
export async function logout(): Promise<void> {
  try {
    await fetch(`${API_URL}/api/auth/logout`, { method: 'POST', credentials: 'include' });
  } catch { /* bỏ qua */ }
  clearSession();
}

/* ============ Các lời gọi API nghiệp vụ ============ */

/** Một việc quá hạn hoặc sắp tới hạn, hiện thẳng trên dashboard */
export interface ViecCanGap {
  id: number;
  tracking_code: string;
  preview: string;
  urgency: 'normal' | 'important' | 'urgent';
  status: string;
  category_name: string | null;
  assigned_name: string | null;
  /** true = đã quá hạn; false = sắp tới hạn */
  quaHan: boolean;
  /** số ngày quá hạn, hoặc số ngày còn lại */
  soNgay: number;
}

export interface DashboardStats {
  /** Việc quá hạn / sắp hạn — sắp xếp khẩn cấp trước */
  canGap?: ViecCanGap[];
  /** Ba con số điều hành: đã quá hạn · sắp hạn (3 ngày) · chưa phân công.
      Trả lời đúng câu hỏi của người chỉ huy khi mở máy buổi sáng. */
  dieuHanh?: {
    qua_han: number;
    sap_han: number;
    chua_phan_cong: number;
    khan_cap?: number;
  };
  overview: {
    total_submissions: number;
    pending_count: number;
    processing_count: number;
    resolved_count: number;
    rejected_count: number;
    flagged_count: number;
    today_count: number;
    active_staff_count: number;
  };
  byCategory: Array<{
    code: string; name: string; total_count: number;
    received_count: number; processing_count: number; resolved_count: number; rejected_count: number;
  }>;
  recent: Array<{
    tracking_code: string; status: string; sender_name: string; category_name: string; created_at: string;
  }>;
  /** Số liệu hạn xử lý — có thể vắng nếu chưa chạy nâng cấp database */
  sla?: {
    overdue_count: number;     // đã quá hạn
    near_due_count: number;    // còn dưới 3 ngày
    unassigned_count: number;  // chưa có cán bộ phụ trách
  };
  /** Nhóm sự kiện trùng lặp CHƯA XEM — "nhiều người cùng báo 1 vụ việc" */
  nhomTrungLap?: NhomSuKien[];
}

export const fetchDashboardStats = () => adminFetch<DashboardStats>('/api/admin/dashboard/stats');

/** Cảnh báo số đơn đột biến theo địa bàn trong 24 giờ (ADR-003 việc 25) */
export interface CanhBaoDotBien {
  id: number;
  ward_id: number;
  ward_name: string | null;
  so_tin: number;
  nguong: number;
  created_at: string;
  tin: { id: number; tracking_code: string; status: string; urgency: string; created_at: string; xem_truoc: string }[];
}
export const fetchCanhBaoDotBien = () =>
  adminFetch<{ data: CanhBaoDotBien[] }>('/api/admin/dashboard/canh-bao-dot-bien').then((r) => r.data);

export interface SubmissionRow {
  /** Số tin nhắn người dân gửi mà cán bộ chưa đọc — dùng hiện chấm đỏ */
  tin_chua_doc?: number;
  /** Số lần người dân bổ sung mà chưa cán bộ nào mở hồ sơ (ADR-003 việc 22) */
  bo_sung_chua_doc?: number;
  id: number;
  tracking_code: string;
  urgency?: 'normal' | 'important' | 'urgent';
  /** Tin tố cáo cán bộ / người nhà nước — chỉ lãnh đạo thấy (ADR-003, nang_cap_v26.sql) */
  to_giac_mat?: number;
  /** Tin bị đánh dấu ngoài thẩm quyền — chỉ lãnh đạo thấy */
  ngoai_tham_quyen?: number;
  /** Lúc sàng lọc bấm "Chưa xác minh" (null = chưa bấm) — ADR-003 việc 14 */
  chua_xac_minh_luc?: string | null;
  original_content: string;
  ai_processed_content: string | null;
  category_code: string | null;
  category_name: string | null;
  status: 'pending_review' | 'received' | 'processing' | 'resolved' | 'rejected' | 'spam';
  is_anonymous?: boolean;
  sender_name: string;
  is_flagged: number;
  created_at: string;
  assigned_name: string | null;
  deadline_at?: string | null;
  sla?: 'overdue' | 'near' | 'ok' | 'done' | 'none';
  daysLeft?: number | null;
  ward_name?: string | null;
  assigned_to?: number | null;
  is_masked?: boolean;
  sla_days?: number;
}

export interface SubmissionListResult {
  data: SubmissionRow[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/** Các phần danh sách (ADR-003): định nghĩa ở server/src/lib/sang-loc.js */
export type PhanDanhSach = 'sang_loc' | 'xu_ly' | 'to_giac' | 'to_giac_mat' | 'ngoai_tham_quyen';

export function fetchSubmissions(params: {
  phan?: PhanDanhSach;
  status?: string; category?: string; urgency?: string; sla?: string; assigned?: string;
  /** '1' = chỉ xem tin đã bị đánh dấu rác, để soát xem có chặn oan ai không */
  nghiRac?: string;
  /** mac_dinh | moi_nhat | cu_nhat | muc_cao | muc_thap */
  sort?: string;
  q?: string; page?: number; limit?: number;
}): Promise<SubmissionListResult> {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== '' && v !== null) qs.set(k, String(v));
  });
  const s = qs.toString();
  return adminFetch<SubmissionListResult>(`/api/admin/submissions${s ? '?' + s : ''}`);
}

export interface GhiChuNoiBo {
  id: number;
  noi_dung: string;
  created_at: string;
  staff_name: string | null;
}

export interface BoSungCuaDan {
  id: number;
  thu_tu: number;
  noi_dung: string;
  created_at: string;
  da_doc_luc: string | null;
  anh: { image_url: string; mime_type: string; moderation_status: string }[];
}

export interface SubmissionDetail extends SubmissionRow {
  /** Các lần người dân bổ sung (ADR-003 việc 21) */
  bo_sung?: BoSungCuaDan[];
  /** Lúc tin vào thùng rác (null = không ở thùng rác) */
  deleted_at?: string | null;
  /** Tin đang ở hàng sàng lọc -> hiện bốn nút sàng lọc (máy chủ vẫn kiểm lại) */
  dang_cho_sang_loc?: boolean;
  /** Ghi chú nội bộ, cũ trước mới sau — người dân không thấy */
  ghi_chu?: GhiChuNoiBo[];
  /** Cặp chức danh + hành vi khiến tin vào phần tố giác mật (chỉ lãnh đạo nhận được) */
  to_giac_mat_nhan_dien?: string[];
  /** Lý do gắn cờ: nghi gửi hàng loạt, nghi máy tự động (ADR-003 việc 24) */
  flag_reason?: string | null;
  /** Vì sao hệ thống xếp mức khẩn (ADR-003 việc 10) */
  muc_khan?: { muc: string; lyDo: string; tuKhoa: string[] };
  /** Hồ sơ có mã thiết bị hay không (false với đơn gửi trước khi có tính năng chặn
      spam). Máy chủ KHÔNG trả giá trị mã: hai hồ sơ cùng mã là hai đơn cùng một máy,
      đủ để nối đơn ẩn danh với đơn có tên (BUG-014). */
  co_ma_thiet_bi: boolean;
  sender_phone: string;
  /** Hồ sơ có email hay không. Email đầy đủ chỉ lấy được qua revealIdentity (có ghi nhật ký). */
  co_email: boolean;
  rejection_reason: string | null;
  resolution_note: string | null;
  resolved_by_name: string | null;
  images: Array<{ image_url: string; mime_type: string; moderation_status: string }>;
  /** Toạ độ nơi XẢY RA VỤ VIỆC — do người dân tự nguyện gửi. Rỗng nếu không gửi. */
  incident_lat?: number | string | null;
  incident_lng?: number | string | null;
  history: Array<{ old_status: string | null; new_status: string; note: string | null; changed_at: string; changed_by_name: string | null }>;
}

export const fetchSubmissionDetail = (id: number) =>
  adminFetch<SubmissionDetail>(`/api/admin/submissions/${id}`);

export const updateSubmissionStatus = (
  id: number,
  body: { status: string; note?: string; rejectionReason?: string }
) => adminFetch<{ ok: boolean; message: string }>(`/api/admin/submissions/${id}/status`, {
  method: 'PATCH',
  body: JSON.stringify(body),
});

/* ============================================================
   NÂNG CẤP V2 — Phân công · SLA · Báo cáo · Bản đồ · Danh tính
   ============================================================ */

export interface StaffOption {
  id: number;
  full_name: string;
  role: string;
  category_name: string | null;
  open_count: number;
}

/** Danh sách cán bộ (để phân công) */
export const fetchStaffList = (): Promise<StaffOption[]> => adminFetch<StaffOption[]>('/api/admin/staff');

/** Phân công ý kiến cho cán bộ (staffId = null để bỏ phân công) */
export const assignSubmission = (id: number, staffId: number | null) =>
  adminFetch<{ ok: boolean; message: string }>(`/api/admin/submissions/${id}/assign`, {
    method: 'PATCH',
    body: JSON.stringify({ staffId }),
  });

/** Xem danh tính đầy đủ — LƯU Ý: mỗi lần xem đều bị ghi nhật ký */
export const revealIdentity = (
  id: number
): Promise<{ sender_name: string; sender_phone: string; sender_email: string | null; warning: string }> =>
  adminFetch<{ sender_name: string; sender_phone: string; sender_email: string | null; warning: string }>(`/api/admin/submissions/${id}/reveal`, { method: 'POST' });

export interface ReportSummary {
  from: string;
  to: string;
  overview: {
    total: number; received: number; processing: number;
    resolved: number; rejected: number; overdue: number;
  };
  byCategory: { category: string; total: number; resolved: number; overdue: number; avg_hours: number | null }[];
  byDay: { day: string; total: number }[];
  /** Số ý kiến theo khung giờ trong ngày (0-23h) — phục vụ bố trí ca trực */
  byHour: { hour: number; total: number }[];
  /** Số ý kiến theo thứ trong tuần — chuẩn MySQL DAYOFWEEK: 1=CN...7=T7 */
  byWeekday: { weekday: number; total: number }[];
  byWard: { ward: string; total: number }[];
  byStaff: { staff: string; assigned: number; resolved: number }[];
}

/** Số liệu báo cáo (để xem biểu đồ + xuất Excel) */
export const fetchReport = (from?: string, to?: string): Promise<ReportSummary> => {
  const p = new URLSearchParams();
  if (from) p.set('from', from);
  if (to) p.set('to', to);
  const qs = p.toString();
  return adminFetch<ReportSummary>(`/api/admin/reports/summary${qs ? '?' + qs : ''}`);
};

export interface WardPoint {
  id: number; name: string; lat: number; lng: number;
  total: number; pending: number; overdue: number; to_giac: number;
  /** Số vụ theo từng nhóm — để vẽ biểu đồ cơ cấu của địa bàn */
  khieu_nai: number; phan_anh: number; de_xuat: number;
  /** Số vụ được đánh dấu khẩn cấp */
  khan_cap: number;
  /** Thời điểm vụ việc gần nhất — biết địa bàn còn "nóng" hay đã nguội */
  gan_nhat: string | null;
  /** Số vụ ở KỲ LIỀN TRƯỚC, dài bằng đúng kỳ đang xem — dùng tính xu hướng.
      Bằng 0 khi đang xem "Toàn bộ" (không có kỳ trước để so). */
  ky_truoc: number;
}

/* --------------------------------------------------------------------------
   XU HƯỚNG CỦA MỘT ĐỊA BÀN

   Vì sao cần: bản đồ chỉ hiện số vụ trong kỳ thì lãnh đạo biết địa bàn nào
   NHIỀU, nhưng không biết địa bàn nào đang XẤU ĐI. Một xã 8 vụ mà kỳ trước
   3 vụ đáng lo hơn nhiều so với một xã 12 vụ mà kỳ trước 20 vụ.
   -------------------------------------------------------------------------- */
export type XuHuong = 'tang' | 'giam' | 'on_dinh' | 'moi' | 'khong_ro';

export interface KetQuaXuHuong {
  huong: XuHuong;
  /** Phần trăm thay đổi so với kỳ trước. null khi không tính được. */
  phanTram: number | null;
  nhan: string;
}

export function tinhXuHuong(w: WardPoint, dangXemToanBo: boolean): KetQuaXuHuong {
  if (dangXemToanBo) {
    return { huong: 'khong_ro', phanTram: null, nhan: 'Chọn khung thời gian để xem xu hướng' };
  }
  const nay = w.total;
  const truoc = w.ky_truoc;

  if (truoc === 0 && nay === 0) {
    return { huong: 'on_dinh', phanTram: null, nhan: 'Không có vụ việc' };
  }
  if (truoc === 0) {
    return { huong: 'moi', phanTram: null, nhan: `Mới phát sinh ${nay} vụ (kỳ trước không có)` };
  }

  const pt = Math.round(((nay - truoc) / truoc) * 100);

  /* Dưới 20% coi như dao động bình thường, không phải xu hướng.
     Không có ngưỡng này thì tháng nào cũng báo "tăng/giảm", mất ý nghĩa. */
  if (Math.abs(pt) < 20) {
    return { huong: 'on_dinh', phanTram: pt, nhan: `Ổn định (kỳ trước ${truoc} vụ)` };
  }
  return pt > 0
    ? { huong: 'tang', phanTram: pt, nhan: `Tăng ${pt}% so với kỳ trước (${truoc} vụ)` }
    : { huong: 'giam', phanTram: pt, nhan: `Giảm ${Math.abs(pt)}% so với kỳ trước (${truoc} vụ)` };
}

/**
 * Dữ liệu bản đồ điểm nóng.
 * @param ngay Số ngày gần nhất. 0 = toàn bộ lịch sử.
 */
export const fetchMapData = (ngay = 30): Promise<WardPoint[]> =>
  adminFetch<WardPoint[]>(`/api/admin/reports/map?ngay=${ngay}`);

export interface ActivityLog {
  id: number;
  staff_id: number | null;
  action: string;
  target_type: string | null;
  target_id: number | null;
  details: any;
  ip_address: string | null;
  created_at: string;
  staff_name: string | null;
  staff_role: string | null;
  tracking_code: string | null;
  /* Nhãn do máy chủ gắn theo lib/danh-muc-nhat-ky.js */
  ten_hanh_dong: string;
  nhom: string;
  ten_nhom: string;
  nhay_cam: boolean;
}

export interface LogsResult {
  data: ActivityLog[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  revealCount30d: number;
}

/** Bộ lọc nhật ký — mọi giá trị máy chủ kiểm lại bằng allow-list */
export interface BoLocNhatKy {
  nhom?: string;
  action?: string;
  staffId?: number;
  tu?: string;   // YYYY-MM-DD
  den?: string;  // YYYY-MM-DD
}

export interface NhomNhatKy {
  ma: string;
  ten: string;
  nhayCam: boolean;
  hanhDong: { ma: string; ten: string }[];
}

export interface ThongKeNhatKy {
  tu: string;
  den: string;
  theoNgay: { ngay: string; tong: number; nhayCam: number; theoNhom: Record<string, number> }[];
  theoCanBo: { staffId: number | null; ten: string; vaiTro: string | null; tong: number; nhayCam: number }[];
}

export interface XuatNhatKy {
  tu: string;
  den: string;
  catBot: boolean;
  toiDa: number;
  data: ActivityLog[];
}

const chuoiLoc = (b: BoLocNhatKy & { page?: number; limit?: number }) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(b)) if (v !== undefined && v !== '' && v !== null) p.set(k, String(v));
  const qs = p.toString();
  return qs ? `?${qs}` : '';
};

/** Nhật ký hệ thống (chỉ admin/manager) */
/* ---------- QUẢN LÝ TIN TỨC ---------- */
export interface TinQuanTri {
  id: number;
  title: string;
  summary: string;
  content?: string;
  category: 'security' | 'warning' | 'guide' | 'document';
  image_url: string | null;
  source_name: string | null;
  source_url: string | null;
  is_published: number | boolean;
  is_featured: number | boolean;
  published_at: string | null;
  created_at?: string;
}

export const fetchTinQuanTri = (hienCaAn = false): Promise<TinQuanTri[]> =>
  adminFetch<TinQuanTri[]>(`/api/admin/news${hienCaAn ? '?hienCaAn=1' : ''}`);

export const fetchMotTin = (id: number): Promise<TinQuanTri> =>
  adminFetch<TinQuanTri>(`/api/admin/news/${id}`);

export const dangTinMoi = (tin: Partial<TinQuanTri>) =>
  adminFetch<{ ok: boolean; id: number; message: string }>('/api/admin/news', {
    method: 'POST', body: JSON.stringify(tin),
  });

export const suaTin = (id: number, tin: Partial<TinQuanTri>) =>
  adminFetch<{ ok: boolean; message: string }>(`/api/admin/news/${id}`, {
    method: 'PUT', body: JSON.stringify(tin),
  });

export const doiHienTin = (id: number, hien: boolean) =>
  adminFetch<{ ok: boolean; message: string }>(`/api/admin/news/${id}/hien`, {
    method: 'PATCH', body: JSON.stringify({ hien }),
  });

/* ---------- ĐIỂM ĐEN GIAO THÔNG ---------- */
export interface DiemDenQuanTri {
  id: number;
  ten: string;
  mo_ta: string | null;
  lat: number | string | null;
  lng: number | string | null;
  ward_id: number | null;
  dia_ban: string | null;
  so_vu: number;
  so_tu_vong: number;
  so_bi_thuong: number;
  ky_thong_ke: string | null;
  muc_do: 'cao' | 'trung_binh' | 'thap';
  khuyen_cao: string | null;
  is_published: number | boolean;
}

/** Máy chủ trả kèm cờ coBang để giao diện phân biệt "bảng chưa tạo" với
    "bảng có nhưng chưa có dữ liệu" — hai việc cần xử lý khác hẳn nhau. */
export const fetchDiemDenQuanTri = (): Promise<{ coBang: boolean; ds: DiemDenQuanTri[] }> =>
  adminFetch<{ coBang: boolean; ds: DiemDenQuanTri[] }>('/api/admin/diem-den');

export const luuDiemDen = (id: number | null, d: Record<string, unknown>) =>
  adminFetch<{ ok: boolean; message: string }>(
    id ? `/api/admin/diem-den/${id}` : '/api/admin/diem-den',
    { method: id ? 'PUT' : 'POST', body: JSON.stringify(d) }
  );

export const doiHienDiemDen = (id: number, hien: boolean) =>
  adminFetch<{ ok: boolean; message: string }>(`/api/admin/diem-den/${id}/hien`, {
    method: 'PATCH', body: JSON.stringify({ hien }),
  });

/* ---------- KHIẾU NẠI MỞ KHOÁ ---------- */
export interface KhieuNai {
  id: number;
  /* Không có mã máy/địa chỉ: máy chủ cố ý không trả — cùng mã đó ở danh sách
     khoá là khoá nối khiếu nại (ký tên) với hồ sơ gây khoá (BUG-014). */
  kind: 'device' | 'ip';
  content: string;
  status: 'cho_xu_ly' | 'da_go_khoa' | 'tu_choi';
  created_at: string;
  handled_at: string | null;
  handler_note: string | null;
  handled_by_name: string | null;
  /** Còn đang bị khoá thật không — khoá có thể đã tự hết hạn trong lúc chờ */
  con_bi_khoa: boolean;
  /** Các ý kiến bị đánh dấu rác của chính thiết bị/địa chỉ này — để cán bộ
      xem người này đã gửi gì rồi mới quyết định gỡ hay từ chối. */
  tinLienQuan?: Array<{
    id: number;
    tracking_code: string;
    status: string;
    created_at: string;
    trich: string;
  }>;
}

export const fetchKhieuNai = (tatCa = false): Promise<KhieuNai[]> =>
  adminFetch<KhieuNai[]>(`/api/admin/chat/khieu-nai${tatCa ? '?tatCa=1' : ''}`);

export const xuLyKhieuNai = (id: number, quyetDinh: 'go_khoa' | 'tu_choi', ghiChu?: string) =>
  adminFetch<{ ok: boolean; message: string }>(`/api/admin/chat/khieu-nai/${id}/xu-ly`, {
    method: 'POST',
    body: JSON.stringify({ quyetDinh, ghiChu: ghiChu || '' }),
  });

export const fetchLogs = (params: BoLocNhatKy & { page?: number; limit?: number }): Promise<LogsResult> =>
  adminFetch<LogsResult>(`/api/admin/logs${chuoiLoc(params)}`);

/** Nhóm và nhãn hành động — một nguồn với máy chủ */
export const fetchDanhMucNhatKy = (): Promise<NhomNhatKy[]> =>
  adminFetch<NhomNhatKy[]>('/api/admin/logs/danh-muc');

/** Thống kê theo ngày (mặc định 30 ngày, tối đa 92) */
export const fetchThongKeNhatKy = (b: { tu?: string; den?: string }): Promise<ThongKeNhatKy> =>
  adminFetch<ThongKeNhatKy>(`/api/admin/logs/thong-ke${chuoiLoc(b)}`);

/** Lấy dữ liệu để xuất Excel — máy chủ ghi một dòng export_logs trước khi trả */
export const xuatNhatKy = (b: BoLocNhatKy): Promise<XuatNhatKy> =>
  adminFetch<XuatNhatKy>(`/api/admin/logs/xuat${chuoiLoc(b)}`);


/* ============================================================
   V5 — HÀNG CHỜ KIỂM DUYỆT (ý kiến ẩn danh)
   ============================================================ */

/** Duyệt tin báo ẩn danh, hoặc đánh dấu là tin rác */
export const reviewSubmission = (id: number, action: 'approve' | 'spam') =>
  adminFetch<{ ok: boolean; message: string }>(`/api/admin/submissions/${id}/review`, {
    method: 'POST',
    body: JSON.stringify({ action }),
  });


/** V7: Danh sách ý kiến chi tiết cho sheet Excel (danh tính đã che) */
export interface ReportDetailRow {
  trackingCode: string;
  content: string;
  category: string;
  ward: string;
  status: string;
  sender: string;
  staff: string;
  createdAt: string;
  deadlineAt: string | null;
  overdue: boolean;
}

export const fetchReportDetails = (from: string, to: string) =>
  adminFetch<ReportDetailRow[]>(`/api/admin/reports/details?from=${from}&to=${to}`);


/* ============================================================
   V10 — MÃ QR ĐỊNH VỊ (dán tại hiện trường / quầy tiếp dân)
   ============================================================ */
export interface QrPoint {
  id: number;
  code: string;
  name: string;
  note: string | null;
  is_active: boolean;
  ward_id: number;
  ward_name: string;
  created_at: string;
}

export const fetchQrPoints = () =>
  adminFetch<{ data: QrPoint[] }>('/api/admin/qr-points').then((r) => r.data);

export const createQrPoint = (name: string, wardId: number, note?: string) =>
  adminFetch<{ id: number; code: string; name: string; wardId: number }>('/api/admin/qr-points', {
    method: 'POST',
    body: JSON.stringify({ name, wardId, note }),
  });

export const toggleQrPoint = (id: number, isActive: boolean) =>
  adminFetch<{ ok: boolean }>(`/api/admin/qr-points/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ isActive }),
  });

export const deleteQrPoint = (id: number) =>
  adminFetch<{ ok: boolean }>(`/api/admin/qr-points/${id}`, { method: 'DELETE' });


/* ============================================================
   V11 — GỘP SỰ KIỆN TRÙNG LẶP (nhiều người cùng báo 1 vụ việc)
   ============================================================ */
export interface NhomSuKien {
  id: number;
  submission_count: number;
  last_reported_at: string;
  first_reported_at?: string;
  ward_name: string | null;
  category_name: string | null;
  preview: string;
  acknowledged?: boolean;
  first_tracking_code?: string;
}

export interface ThanhVienNhomSuKien {
  id: number;
  tracking_code: string;
  status: string;
  is_anonymous: boolean;
  created_at: string;
  preview: string;
  urgency?: 'normal' | 'important' | 'urgent';
  assigned_name?: string | null;
  /** Đang chờ sàng lọc -> chọn được để xác nhận / đánh tin giả hàng loạt */
  dang_cho_sang_loc?: boolean;
}

/** Một hàng trong danh mục Tin trùng (ADR-003 việc 18, 19) */
export interface NhomTinTrung {
  id: number;
  so_tin: number;
  dau: string;
  cuoi: string;
  ward_name: string | null;
  category_name: string | null;
  xem_truoc: string;
  /** Có hai tin giống nhau gần từng chữ — nghi một người gửi lặp */
  gan_nhu_giong: boolean;
}

export const fetchTinTrung = (phan: 'sang_loc' | 'xu_ly' | 'to_giac') =>
  adminFetch<{ data: NhomTinTrung[] }>(`/api/admin/submissions/tin-trung?phan=${phan}`).then((r) => r.data);

/** Xác nhận / đánh tin giả hàng loạt — máy chủ xử lý và ghi nhật ký từng tin */
export const sangLocHangLoat = (ids: number[], hanhDong: 'xac_nhan' | 'tin_gia', ghiChu?: string) =>
  adminFetch<{ ok: boolean; soXong: number; message: string;
    ketQua: { id: number; status: number; message: string }[] }>('/api/admin/submissions/sang-loc-hang-loat', {
    method: 'POST',
    body: JSON.stringify({ ids, hanhDong, ghiChu: ghiChu || '' }),
  });

export const fetchIncidentGroups = (chuaXem = false) =>
  adminFetch<{ data: NhomSuKien[] }>(`/api/admin/incident-groups${chuaXem ? '?chuaXem=1' : ''}`).then((r) => r.data);

export const fetchIncidentGroupDetail = (id: number) =>
  adminFetch<{ group: NhomSuKien; members: ThanhVienNhomSuKien[] }>(`/api/admin/incident-groups/${id}`);

export const ackIncidentGroup = (id: number) =>
  adminFetch<{ ok: boolean }>(`/api/admin/incident-groups/${id}/ack`, { method: 'POST' });

/* ==========================================================================
   CHAT VỚI NGƯỜI GỬI Ý KIẾN — phía cán bộ
   ========================================================================== */

export interface AdminChatMessage {
  id: number;
  sender_type: 'staff' | 'reporter';
  message: string;
  created_at: string;
  staff_name: string | null;
}

export const fetchChatMessages = (id: number): Promise<{
  messages: AdminChatMessage[];
  status: string;
  daDong: boolean;
  isAnonymous: boolean;
}> => adminFetch(`/api/admin/chat/${id}/messages`);

export const sendChatMessage = (id: number, message: string): Promise<{ ok: boolean }> =>
  adminFetch(`/api/admin/chat/${id}/messages`, {
    method: 'POST',
    body: JSON.stringify({ message }),
  });

/* ==========================================================================
   DANH SÁCH KHOÁ THIẾT BỊ / IP
   ========================================================================== */

export interface BlacklistItem {
  id: number;
  /* Không có mã máy/địa chỉ — xem chú thích ở KhieuNai (BUG-014). */
  kind: 'device' | 'ip';
  reason: string | null;
  created_at: string;
  expires_at: string;
  nguoi_khoa: string | null;
  con_lai_phut: number;
}

export const fetchBlacklist = (): Promise<BlacklistItem[]> =>
  adminFetch('/api/admin/chat/blacklist');

export const removeBlacklist = (id: number): Promise<{ ok: boolean }> =>
  adminFetch(`/api/admin/chat/blacklist/${id}`, { method: 'DELETE' });

/** Bốn nút sàng lọc (ADR-003 việc 14). Tin giả bắt buộc ghiChu (lý do). */
export const sangLoc = (id: number, hanhDong: 'xac_nhan' | 'chua_xac_minh' | 'tin_gia' | 'ngoai_tham_quyen', ghiChu?: string) =>
  adminFetch<{ ok: boolean; message: string }>(`/api/admin/submissions/${id}/sang-loc`, {
    method: 'POST',
    body: JSON.stringify({ hanhDong, ghiChu: ghiChu || '' }),
  });

/** Nút của lãnh đạo ở phần Ngoài thẩm quyền (ADR-003 việc 15) */
export const xuLyNgoaiThamQuyen = (id: number, hanhDong: 'chuyen_lai' | 'xoa' | 'da_chuyen', ghiChu?: string) =>
  adminFetch<{ ok: boolean; message: string }>(`/api/admin/submissions/${id}/ngoai-tham-quyen`, {
    method: 'POST',
    body: JSON.stringify({ hanhDong, ghiChu: ghiChu || '' }),
  });

/** Dữ liệu xuất Excel phần Ngoài thẩm quyền — máy chủ ghi nhật ký trước khi trả */
export const xuatNgoaiThamQuyen = () =>
  adminFetch<{ trackingCode: string; content: string; category: string; ward: string;
    status: string; sender: string; createdAt: string }[]>('/api/admin/submissions/ngoai-tham-quyen/xuat');

/** Thêm ghi chú nội bộ (chỉ ghi thêm, không sửa xoá) — ADR-003 việc 16 */
export const themGhiChuNoiBo = (id: number, noiDung: string) =>
  adminFetch<{ ok: boolean; message: string }>(`/api/admin/submissions/${id}/ghi-chu`, {
    method: 'POST',
    body: JSON.stringify({ noiDung }),
  });

/** Chuyển tin vào phần Tin tố giác mật — mọi cán bộ; một chiều (ADR-003 việc 12) */
export const chuyenVaoToGiacMat = (id: number, lyDo?: string) =>
  adminFetch<{ ok: boolean; message: string }>(`/api/admin/submissions/${id}/to-giac-mat`, {
    method: 'POST',
    body: JSON.stringify({ lyDo: lyDo || '' }),
  });

/** Đưa tin ra khỏi phần Tin tố giác mật — chỉ lãnh đạo */
export const duaRaToGiacMat = (id: number) =>
  adminFetch<{ ok: boolean; message: string }>(`/api/admin/submissions/${id}/to-giac-mat`, { method: 'DELETE' });

/** Đánh dấu tin rác + khoá thiết bị đã gửi (24 giờ) */
export const markSpam = (id: number, reason?: string): Promise<{
  ok: boolean; coMaThietBi: boolean; cachKhoa: string; ghiChu: string;
}> => adminFetch(`/api/admin/submissions/${id}/mark-spam`, {
  method: 'POST',
  body: JSON.stringify({ reason: reason || '' }),
});
