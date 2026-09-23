/**
 * useNgonNgu — quản lý ngôn ngữ đang chọn cho phần dành cho người dân.
 *
 * Lưu lựa chọn vào máy để lần sau vào vẫn giữ — người nước ngoài không phải
 * bấm lại mỗi lần.
 *
 * ⚠️ DÙNG SỰ KIỆN CHUNG để đồng bộ giữa các nơi. Nút đổi ngôn ngữ có ở cả đầu
 *    trang lẫn menu điện thoại; nếu mỗi nơi giữ trạng thái riêng thì đổi ở nơi
 *    này, nơi kia không biết — giống hệt lỗi từng gặp với nút chữ lớn.
 */
import { useEffect, useState, useCallback } from 'react';
import { layChu, type NgonNgu, type KhoaChu } from './chu';

const KHOA_LUU = 'htans_ngon_ngu';
const SU_KIEN = 'ans:doi-ngon-ngu';

function docNgonNgu(): NgonNgu {
  try {
    const v = localStorage.getItem(KHOA_LUU);
    if (v === 'en' || v === 'vi') return v;
  } catch { /* trình duyệt chặn lưu trữ */ }
  return 'vi';
}

export function useNgonNgu() {
  const [ngonNgu, setNgonNguState] = useState<NgonNgu>(docNgonNgu);

  useEffect(() => {
    const dongBo = () => setNgonNguState(docNgonNgu());
    window.addEventListener(SU_KIEN, dongBo);
    /* Lắng nghe cả storage để đồng bộ giữa nhiều tab đang mở. */
    window.addEventListener('storage', dongBo);
    return () => {
      window.removeEventListener(SU_KIEN, dongBo);
      window.removeEventListener('storage', dongBo);
    };
  }, []);

  const doiNgonNgu = useCallback((v: NgonNgu) => {
    try { localStorage.setItem(KHOA_LUU, v); } catch { /* bỏ qua */ }
    /* Đặt thuộc tính lang cho thẻ html — trình đọc màn hình dùng nó để chọn
       giọng đọc đúng ngôn ngữ, và trình duyệt dùng để gợi ý dịch trang. */
    try { document.documentElement.lang = v === 'en' ? 'en' : 'vi'; } catch { /* bỏ qua */ }
    window.dispatchEvent(new Event(SU_KIEN));
  }, []);

  /** Lấy chữ theo ngôn ngữ đang chọn. */
  const t = useCallback((khoa: KhoaChu) => layChu(ngonNgu, khoa), [ngonNgu]);

  return { ngonNgu, doiNgonNgu, t, laTiengAnh: ngonNgu === 'en' };
}
