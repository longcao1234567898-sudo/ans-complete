/**
 * TỰ CHUYỂN SANG TRANG DỰ PHÒNG KHI MÁY CHỦ KHÔNG PHẢN HỒI (ADR-003 việc 28)
 *
 * Trang web (Netlify) còn chạy mà máy chủ API sập thì bà con mở form, gõ xong,
 * bấm gửi mới biết không gửi được. Hỏi máy chủ ngay khi vào trang; không phản
 * hồi thì chuyển sang /du-phong.html — trang tĩnh có số 113 và số trực ban.
 *
 * ĐÁNH ĐỔI: máy chủ gói miễn phí "ngủ" khi vắng khách, lần gọi đầu mất 30–60
 * giây mới dậy. Chuyển ngay ở lần chậm đầu tiên là đẩy bà con đi oan mỗi sáng.
 * Nên hỏi SO_LAN lần, mỗi lần chờ tối đa CHO_MS, cách nhau NGHI_MS; trượt hết
 * mới chuyển (khoảng hai phút).
 *
 * Không áp dụng cho trang cán bộ: cán bộ cần thấy lỗi thật để báo kỹ thuật,
 * và trang dự phòng viết cho người dân.
 */
import { useEffect } from 'react';
import { kiemTraMayChu, hasBackend } from '../../services/api';

const SO_LAN = 3;
const CHO_MS = 25_000;
const NGHI_MS = 10_000;

export default function TheoDoiMayChu() {
  useEffect(() => {
    if (!hasBackend) return undefined;
    const duong = window.location.pathname;
    if (duong.startsWith('/quan-tri') || duong.startsWith('/dang-nhap')) return undefined;
    let huy = false;
    (async () => {
      for (let lan = 0; lan < SO_LAN; lan++) {
        if (await kiemTraMayChu(CHO_MS)) return;
        if (huy) return;
        await new Promise((r) => setTimeout(r, NGHI_MS));
        if (huy) return;
      }
      window.location.replace('/du-phong.html');
    })();
    return () => { huy = true; };
  }, []);
  return null;
}
