/**
 * useDraftAutosave — TỰ ĐỘNG LƯU NHÁP nội dung form vào máy người dùng.
 *
 * VÌ SAO CẦN: người dân đang gõ dở, lỡ tắt trình duyệt / mất mạng / hết pin
 * -> mất hết công sức gõ. Lưu nháp giúp lần sau vào lại còn nguyên.
 *
 * Chỉ lưu NỘI DUNG và nhóm — KHÔNG lưu danh tính, SĐT, email
 * (dữ liệu nhạy cảm không nên để lại trên máy). Tự xoá sau khi gửi thành công.
 */
import { useEffect, useRef, useState } from 'react';

const KEY = 'htans_draft_v1';
const EXPIRE_HOURS = 24; // nháp cũ hơn 24 giờ coi như bỏ

export interface Draft {
  content?: string;
  category?: string | null;
  urgency?: string;
  savedAt?: number;
}

/** Đọc nháp đã lưu (nếu còn hạn) */
export function readDraft(): Draft | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as Draft;
    if (!d.savedAt || Date.now() - d.savedAt > EXPIRE_HOURS * 3600_000) {
      localStorage.removeItem(KEY);
      return null;
    }
    return d;
  } catch {
    return null;
  }
}

/** Xoá nháp (gọi sau khi gửi thành công) */
export function clearDraft() {
  try { localStorage.removeItem(KEY); } catch { /* bỏ qua */ }
}

/**
 * Tự lưu nháp mỗi khi nội dung đổi (chống giật bằng debounce 800ms).
 * Trả về { hasSavedDraft, lastSaved } để hiển thị "đã lưu nháp lúc ...".
 */
export function useDraftAutosave(draft: Draft, enabled = true) {
  const [lastSaved, setLastSaved] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (!enabled) return;
    // Không lưu nếu nội dung rỗng
    if (!draft.content || draft.content.trim().length < 5) return;

    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      try {
        const payload: Draft = {
          content: draft.content,
          category: draft.category,
          urgency: draft.urgency,
          savedAt: Date.now(),
        };
        localStorage.setItem(KEY, JSON.stringify(payload));
        setLastSaved(payload.savedAt!);
      } catch { /* localStorage đầy/bị chặn -> bỏ qua */ }
    }, 800);

    return () => clearTimeout(timer.current);
  }, [draft.content, draft.category, draft.urgency, enabled]);

  return { lastSaved };
}
