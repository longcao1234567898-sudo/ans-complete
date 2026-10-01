/**
 * HAI CẤP VAI TRÒ (ADR-003 §1) — danh sách duy nhất để mọi chốt quyền đọc theo.
 *
 * Lãnh đạo (Trưởng, Phó; `admin`, `manager`) toàn quyền. Cán bộ (`handler`)
 * xử lý tin nhưng không xem danh tính, nhật ký, Tin tố giác mật, phần Ngoài
 * thẩm quyền, không xuất Excel, không quản trị nội dung.
 *
 * Vì sao một tệp riêng: quyền rải dạng chuỗi `role === 'admin'` ở từng route
 * chính là cách quyền của từng vai trò đã trôi dần qua các bản vá (ADR-002 mục
 * Bối cảnh). Đổi mô hình vai trò thì sửa ở đây, route nào cũng theo.
 * ENUM `staff.role` giữ nguyên ba giá trị, không migration: `admin` và
 * `manager` mang cùng quyền.
 */
export const LANH_DAO = Object.freeze(['admin', 'manager']);

/** @param {{ role?: string } | null | undefined} staff req.staff */
export function laLanhDao(staff) {
  return LANH_DAO.includes(staff?.role);
}
