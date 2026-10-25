/**
 * useMatMang — máy đang mất mạng không (theo trình duyệt: sự kiện online/offline).
 * Chỉ để giao diện đổi cách cư xử (P92); "có mạng" vẫn có thể là máy chủ không trả
 * lời — chỗ gửi tin tự xử lý trường hợp đó bằng hàng chờ.
 */
import { useEffect, useState } from 'react';

export function useMatMang(): boolean {
  const [mat, setMat] = useState(() => typeof navigator !== 'undefined' && navigator.onLine === false);
  useEffect(() => {
    const doi = () => setMat(navigator.onLine === false);
    window.addEventListener('online', doi);
    window.addEventListener('offline', doi);
    return () => { window.removeEventListener('online', doi); window.removeEventListener('offline', doi); };
  }, []);
  return mat;
}
