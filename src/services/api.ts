/**
 * Lớp giao tiếp với mini-backend.
 * - Địa chỉ backend lấy từ biến VITE_API_URL (.env). Trống = KHÔNG có backend.
 * - Khi không có backend, các service sẽ tự động chạy chế độ localStorage như cũ,
 *   nên web luôn hoạt động dù bạn chưa dựng server.
 */
const API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.trim().replace(/\/$/, '');

/** Có cấu hình backend hay không */
export const hasBackend = Boolean(API_URL);

/** Gọi API backend; ném Error với thông báo từ server nếu có */
export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Lỗi máy chủ (${res.status})`);
  return data as T;
}

/** Trạng thái bật/tắt AI ở backend (cache sau lần gọi đầu) */
let backendAI: boolean | null = null;
export async function backendHasAI(): Promise<boolean> {
  if (!hasBackend) return false;
  if (backendAI !== null) return backendAI;
  try {
    const { available } = await apiFetch<{ available: boolean }>('/api/ai/status');
    backendAI = available;
  } catch {
    backendAI = false;
  }
  return backendAI;
}
