/**
 * CHỐNG CHÈN CÔNG THỨC VÀO EXCEL (Formula Injection) — dùng chung cho tệp xuất
 *
 * Excel/LibreOffice coi ô bắt đầu bằng = + - @ (hoặc tab/xuống dòng rồi tới các
 * ký tự đó) là CÔNG THỨC và TỰ CHẠY khi mở file. Nhật ký có chữ do người ngoài
 * gõ (tên tài khoản thử đăng nhập sai, từ cấm, tên điểm QR...). Kẻ tấn công gõ
 * =HYPERLINK(...) rồi chờ lãnh đạo xuất nhật ký và mở file: công thức chạy trên
 * máy LÃNH ĐẠO, vòng qua mọi lớp phòng thủ phía máy chủ.
 *
 * Cách chặn: thêm dấu nháy đơn ở đầu -> Excel hiểu là VĂN BẢN THUẦN.
 * (Trang báo cáo có một bản viết tại chỗ cùng cách làm — AdminReportsPage.tsx.)
 */
export const chongCongThuc = (v: unknown) =>
  typeof v === 'string' && /^[\s]*[=+\-@\t\r]/.test(v) ? `'${v}` : v;

/** Bọc mọi giá trị chuỗi của một dòng trước khi đưa vào sheet */
export const donDong = <T extends Record<string, unknown>>(row: T) =>
  Object.fromEntries(Object.entries(row).map(([k, v]) => [k, chongCongThuc(v)]));
