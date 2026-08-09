/**
 * Dịch vụ tra cứu tiến độ xử lý.
 * Có backend → hỏi API (dữ liệu MySQL dùng chung); không có → mock + localStorage.
 */
import type { TrackingResult } from '../types/tracking';
import { MOCK_TRACKING, buildSteps } from '../utils/mockData';
import { readSubmissions } from './feedbackService';
import { delay } from '../utils/helpers';
import { apiFetch, hasBackend } from './api';

export async function lookupTracking(rawCode: string): Promise<TrackingResult> {
  const code = rawCode.trim().toUpperCase();

  // Có backend: dữ liệu dùng chung toàn hệ thống (backend trả đúng cấu trúc TrackingResult)
  if (hasBackend) {
    return apiFetch<TrackingResult>(`/api/tracking/${encodeURIComponent(code)}`);
  }

  // Không có backend: dữ liệu demo + ý kiến đã gửi trên máy này
  await delay(900);

  const mock = MOCK_TRACKING.find((t) => t.code === code);
  if (mock) return mock;

  const own = readSubmissions().find((s) => s.trackingCode === code);
  if (own) {
    return {
      code,
      status: 'received',
      category: own.category,
      summary: own.normalizedContent,
      createdAt: own.createdAt,
      steps: buildSteps('received', own.createdAt),
    };
  }

  throw new Error('Không tìm thấy mã tra cứu. Vui lòng kiểm tra lại 6 ký tự trên phiếu tiếp nhận.');
}

/** Yêu cầu xoá thông tin cá nhân theo Nghị định 13/2023/NĐ-CP (xem server/src/routes/tracking.js) */
export async function requestDataDeletion(
  rawCode: string
): Promise<{ status: string; message: string; requestedAt?: string }> {
  const code = rawCode.trim().toUpperCase();
  if (!hasBackend) {
    throw new Error('Chức năng này cần kết nối máy chủ, hiện không khả dụng ở chế độ ngoại tuyến.');
  }
  return apiFetch(`/api/tracking/${encodeURIComponent(code)}/request-deletion`, { method: 'POST' });
}

/* ==========================================================================
   KÊNH TRAO ĐỔI HAI CHIỀU

   Vào phòng chat cần MÃ TRA CỨU + MÃ PIN. Vé nhận về sống 2 giờ, cất trong
   bộ nhớ phiên của trình duyệt (sessionStorage) chứ không phải localStorage —
   đóng tab là mất, tránh việc máy dùng chung ở tiệm net để lộ cho người sau.
   ========================================================================== */

export interface ChatMessageItem {
  id: number;
  sender_type: 'staff' | 'reporter';
  message: string;
  created_at: string;
}

export interface ChatOpenResult {
  chatToken: string;
  trackingCode: string;
  status: string;
  daDong: boolean;
}

const KHOA_VE = 'chat_ve';

export function luuVeChat(code: string, token: string) {
  try { sessionStorage.setItem(`${KHOA_VE}:${code}`, token); } catch { /* bỏ qua */ }
}
export function layVeChat(code: string): string {
  try { return sessionStorage.getItem(`${KHOA_VE}:${code}`) || ''; } catch { return ''; }
}
export function xoaVeChat(code: string) {
  try { sessionStorage.removeItem(`${KHOA_VE}:${code}`); } catch { /* bỏ qua */ }
}

/** Mở phòng chat bằng mã tra cứu + mã PIN */
export async function moPhongChat(code: string, pin: string): Promise<ChatOpenResult> {
  const kq = await apiFetch<ChatOpenResult>('/api/chat/open', {
    method: 'POST',
    body: JSON.stringify({ code, pin }),
  });
  luuVeChat(code, kq.chatToken);
  return kq;
}

/** Lấy toàn bộ tin nhắn của phòng */
export async function layTinNhan(code: string): Promise<{
  messages: ChatMessageItem[];
  status: string | null;
  daDong: boolean;
}> {
  const ve = layVeChat(code);
  return apiFetch('/api/chat/messages', {
    headers: { Authorization: `Bearer ${ve}` },
  });
}

/** Gửi một tin nhắn */
export async function guiTinNhan(code: string, message: string): Promise<void> {
  const ve = layVeChat(code);
  await apiFetch('/api/chat/messages', {
    method: 'POST',
    headers: { Authorization: `Bearer ${ve}` },
    body: JSON.stringify({ message }),
  });
}
