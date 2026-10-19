/**
 * GIỚI HẠN CHUNG CHO MỌI YÊU CẦU — TÁCH "XEM" VÀ "GỬI" (ND-063)
 * ============================================================================
 *
 * Trước đây: 300 yêu cầu / 15 phút cho mỗi IP, đếm chung mọi loại yêu cầu.
 *
 * VẤN ĐỀ (đo P68): nhà mạng 4G cho nhiều thuê bao dùng chung một địa chỉ IP (CGNAT).
 * Một lượt vào trang gọi khoảng 5 yêu cầu XEM, nên 100 người chung 1 IP cùng mở
 * trang lúc có chuyện (mưa ngập, tin nóng) thì 46% bị 429 — dù họ chỉ xem.
 *
 * NAY — hai bộ đếm RIÊNG:
 *   · XEM (GET, HEAD, OPTIONS): 1.500 / 15 phút / IP ≈ 300 lượt vào từ một IP.
 *     Những lượt xem nặng hay nhạy cảm đã có giới hạn riêng chặt hơn nhiều ngay ở
 *     route (tra cứu mã 30/phút, đọc giọng nói, phòng trao đổi, bản đồ…) hoặc có
 *     bộ đệm (dự báo mưa, thống kê) — nới ở đây không nới những chỗ đó.
 *   · GỬI / SỬA / XOÁ / ĐĂNG NHẬP (mọi phương thức khác): GIỮ NGUYÊN 300 / 15 phút
 *     / IP. Chống tin rác và dò mật khẩu (mô hình đe doạ #3) không lỏng ra; các
 *     route gửi còn giới hạn riêng theo thiết bị, số điện thoại, mạng.
 *   · Xem nhiều không ăn vào lượt gửi và ngược lại: người dân lướt tin lâu vẫn gửi
 *     được ý kiến; máy dội yêu cầu gửi không làm người khác hết lượt xem.
 *
 * OPTIONS là yêu cầu "hỏi trước" trình duyệt tự gửi trước mỗi lượt gửi khác nguồn —
 * xếp vào bên XEM để không ăn hai lượt gửi cho một lần bấm nút.
 *
 * Khoá đếm là req.ip (đã qua `trust proxy`, luật 3) — như trước, không đổi.
 * Cả ba biến thể máy chủ (index.js, và may-chu-cong-khai.js / may-chu-can-bo.js qua
 * nen-tang.js) dùng chung hàm này: sửa một chỗ là đủ (ND-010).
 */
import rateLimit from 'express-rate-limit';

export const CUA_SO_MS = 15 * 60_000;
export const TOI_DA_XEM = 1500;
export const TOI_DA_GUI = 300;

const PHUONG_THUC_XEM = new Set(['GET', 'HEAD', 'OPTIONS']);
const laXem = (req) => PHUONG_THUC_XEM.has(req.method);

/** Trả về hai middleware — dùng: app.use(...gioiHanChung()) */
export function gioiHanChung() {
  const chung = { windowMs: CUA_SO_MS, standardHeaders: true, legacyHeaders: false };
  return [
    rateLimit({ ...chung, max: TOI_DA_XEM, skip: (req) => !laXem(req) }),
    rateLimit({ ...chung, max: TOI_DA_GUI, skip: laXem }),
  ];
}
