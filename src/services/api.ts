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
  /* ------------------------------------------------------------------------
     ⚠️ PHẢI GỘP headers, KHÔNG ĐƯỢC để ...options ghi đè.

     Bản trước viết:
         headers: { 'Content-Type': 'application/json' },
         ...options,

     Toán tử ...options nằm SAU nên nếu nơi gọi có truyền headers riêng (ví dụ
     Authorization cho phòng chat) thì cả object headers bị THAY THẾ, mất luôn
     Content-Type. Máy chủ không biết thân yêu cầu là JSON nên không đọc ra
     nội dung -> báo "Bà con chưa nhập nội dung" dù đã gõ đầy đủ.

     Lỗi này im lặng và rất khó lần: gõ có chữ, gửi đi vẫn báo chưa nhập.
     ------------------------------------------------------------------------ */
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  /* tuMayChu: máy chủ có trả lời kèm lý do. Nơi gọi cần phân biệt với trang lỗi
     của cổng mạng (502 trả HTML) — xem utils/loiGui.ts. */
  if (!res.ok) {
    throw Object.assign(new Error(data?.error || `Lỗi máy chủ (${res.status})`), {
      status: res.status,
      tuMayChu: Boolean(data?.error),
      /* Mã lỗi máy chủ (ví dụ CAN_XAC_MINH — vé cổng vào hết hạn) */
      code: typeof data?.code === 'string' ? data.code : undefined,
    });
  }
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
