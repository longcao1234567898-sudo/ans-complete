/**
 * Dịch vụ cho khu vực cán bộ: đăng nhập, giữ access token, gọi API admin.
 * Refresh token do backend quản lý qua httpOnly cookie.
 */
import { hasBackend } from './api';

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
    body: JSON.stringify({ username, password, captchaToken }),
    credentials: 'include',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const d = data as { error?: string; canCaptcha?: boolean };
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

export interface SubmissionRow {
  /** Số tin nhắn người dân gửi mà cán bộ chưa đọc — dùng hiện chấm đỏ */
  tin_chua_doc?: number;
  id: number;
  tracking_code: string;
  urgency?: 'normal' | 'important' | 'urgent';
  /** Cấp độ bảo mật (v14): thuong/can_bao_ve/mat. Mặc định 'thuong' nếu chưa nâng cấp DB */
  security_level?: 'thuong' | 'can_bao_ve' | 'mat';
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

export function fetchSubmissions(params: {
  status?: string; category?: string; urgency?: string; sla?: string; assigned?: string;
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

export interface SubmissionDetail extends SubmissionRow {
  /** Mã thiết bị đã gửi đơn — rỗng với đơn gửi trước khi có tính năng chặn spam */
  device_id?: string | null;
  sender_phone: string;
  sender_email: string | null;
  rejection_reason: string | null;
  resolution_note: string | null;
  resolved_by_name: string | null;
  images: Array<{ image_url: string; mime_type: string; moderation_status: string }>;
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

/** Đổi cấp độ bảo mật của một ý kiến (chỉ admin/manager). */
export const setSecurityLevel = (id: number, level: 'thuong' | 'can_bao_ve' | 'mat') =>
  adminFetch<{ ok: boolean; message: string }>(`/api/admin/submissions/${id}/security-level`, {
    method: 'PATCH',
    body: JSON.stringify({ level }),
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
  action: string;
  target_type: string | null;
  target_id: number | null;
  details: any;
  ip_address: string | null;
  created_at: string;
  staff_name: string | null;
  staff_role: string | null;
  tracking_code: string | null;
}

export interface LogsResult {
  data: ActivityLog[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  revealCount30d: number;
}

/** Nhật ký hệ thống (chỉ admin/manager) */
export const fetchLogs = (params: { action?: string; page?: number; limit?: number }): Promise<LogsResult> => {
  const p = new URLSearchParams();
  if (params.action) p.set('action', params.action);
  if (params.page) p.set('page', String(params.page));
  if (params.limit) p.set('limit', String(params.limit));
  const qs = p.toString();
  return adminFetch<LogsResult>(`/api/admin/logs${qs ? '?' + qs : ''}`);
};


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
}

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
  identifier: string;
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

/** Đánh dấu tin rác + khoá thiết bị đã gửi (24 giờ) */
export const markSpam = (id: number, reason?: string, khoaIp?: boolean): Promise<{
  ok: boolean; coMaThietBi: boolean; cachKhoa: string; ghiChu: string;
}> => adminFetch(`/api/admin/submissions/${id}/mark-spam`, {
  method: 'POST',
  body: JSON.stringify({ reason: reason || '', khoaIp: khoaIp === true }),
});
