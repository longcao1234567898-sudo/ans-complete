/**
 * useTrackingHistory — LƯU MÃ TRA CỨU vào chính thiết bị người dân.
 *
 * VÌ SAO CẦN: người dân gửi ý kiến xong được cấp mã tra cứu, nhưng nếu
 * quên/mất mã thì không tra lại được (hệ thống không bắt đăng nhập).
 * Lưu mã ngay trên máy họ -> lần sau vào trang Tra cứu, danh sách mã đã
 * gửi hiện sẵn, bấm là xem kết quả — KHÔNG cần đăng nhập, KHÔNG cần nhớ mã.
 *
 * Lưu ở localStorage (theo từng trình duyệt/thiết bị). Chỉ lưu MÃ + nhóm +
 * thời điểm — KHÔNG lưu nội dung ý kiến hay danh tính (an toàn nếu máy chung).
 */
import { useCallback, useEffect, useState } from 'react';

const KEY = 'htans_tracking_history_v1';
const MAX_ITEMS = 30; // giữ tối đa 30 mã gần nhất

export interface TrackingHistoryItem {
  code: string;
  category?: string;
  savedAt: number;
}

function read(): TrackingHistoryItem[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as TrackingHistoryItem[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function write(items: TrackingHistoryItem[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items.slice(0, MAX_ITEMS)));
  } catch {
    /* localStorage đầy/bị chặn -> bỏ qua */
  }
}

export function useTrackingHistory() {
  const [items, setItems] = useState<TrackingHistoryItem[]>([]);

  useEffect(() => {
    setItems(read());
  }, []);

  /** Thêm 1 mã (gọi sau khi gửi ý kiến thành công) */
  const addCode = useCallback((code: string, category?: string) => {
    if (!code) return;
    const now = read().filter((x) => x.code !== code); // bỏ trùng, đưa lên đầu
    const next = [{ code, category, savedAt: Date.now() }, ...now];
    write(next);
    setItems(next);
  }, []);

  /** Xoá 1 mã khỏi lịch sử */
  const removeCode = useCallback((code: string) => {
    const next = read().filter((x) => x.code !== code);
    write(next);
    setItems(next);
  }, []);

  /** Xoá sạch lịch sử (dùng khi máy chung, muốn dọn) */
  const clearAll = useCallback(() => {
    try { localStorage.removeItem(KEY); } catch { /* bỏ qua */ }
    setItems([]);
  }, []);

  return { items, addCode, removeCode, clearAll };
}

/** Thêm mã ngoài React (gọi trực tiếp từ service sau khi gửi) */
export function saveTrackingCode(code: string, category?: string) {
  if (!code) return;
  try {
    const raw = localStorage.getItem(KEY);
    const arr: TrackingHistoryItem[] = raw ? JSON.parse(raw) : [];
    const filtered = arr.filter((x) => x.code !== code);
    const next = [{ code, category, savedAt: Date.now() }, ...filtered].slice(0, MAX_ITEMS);
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* bỏ qua */
  }
}
