/**
 * Dịch vụ cho khu vực cán bộ: đăng nhập, lưu access token, gọi API admin.
 * Access token lưu trong memory (biến module) + sessionStorage để giữ khi F5.
 * Refresh token do backend quản lý qua httpOnly cookie.
 */
import { hasBackend } from './api';

const API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.trim().replace(/\/$/, '');
const TOKEN_KEY = 'htans_admin_token';
const STAFF_KEY = 'htans_admin_staff';

export interface StaffInfo {
  id: number;
  name: string;
  username: string;
  role: 'admin' | 'manager' | 'handler';
}

/** Lấy token đang lưu */
export function getToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY);
}

/** Lấy thông tin cán bộ đang đăng nhập */
export function getStoredStaff(): StaffInfo | null {
  try {
    const raw = sessionStorage.getItem(STAFF_KEY);
    return raw ? (JSON.parse(raw) as StaffInfo) : null;
  } catch {
    return null;
  }
}

function saveSession(token: string, staff: StaffInfo) {
  sessionStorage.setItem(TOKEN_KEY, token);
  sessionStorage.setItem(STAFF_KEY, JSON.stringify(staff));
}

function clearSession() {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(STAFF_KEY);
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
export async function login(username: string, password: string): Promise<StaffInfo> {
  if (!hasBackend) throw new Error('Chưa cấu hình máy chủ. Cần chạy backend để đăng nhập.');
  const res = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
    credentials: 'include',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string })?.error || 'Đăng nhập thất bại.');
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

/** Đăng xuất */
export async function logout(): Promise<void> {
  try {
    await fetch(`${API_URL}/api/auth/logout`, { method: 'POST', credentials: 'include' });
  } catch { /* bỏ qua */ }
  clearSession();
}

/* ============ Các lời gọi API nghiệp vụ ============ */

export interface DashboardStats {
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
}

export const fetchDashboardStats = () => adminFetch<DashboardStats>('/api/admin/dashboard/stats');

export interface SubmissionRow {
  id: number;
  tracking_code: string;
  original_content: string;
  ai_processed_content: string | null;
  category_code: string | null;
  category_name: string | null;
  status: 'received' | 'processing' | 'resolved' | 'rejected';
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
  status?: string; category?: string; q?: string; page?: number; limit?: number;
}): Promise<SubmissionListResult> {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== '' && v !== null) qs.set(k, String(v));
  });
  const s = qs.toString();
  return adminFetch<SubmissionListResult>(`/api/admin/submissions${s ? '?' + s : ''}`);
}

export interface SubmissionDetail extends SubmissionRow {
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
}

/** Dữ liệu bản đồ điểm nóng */
export const fetchMapData = (): Promise<WardPoint[]> => adminFetch<WardPoint[]>('/api/admin/reports/map');
