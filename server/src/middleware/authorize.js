/**
 * Middleware phân quyền theo vai trò.
 * authorize()                 -> chỉ cần đã đăng nhập
 * authorize('admin')          -> chỉ admin
 * authorize('admin','manager')-> admin hoặc manager
 */

/* Khớp ENUM cột staff.role trong database/. Allow-list: vai trò nào không có
   ở đây thì không phải cán bộ, dù token mang chữ ký hợp lệ. */
export const VAI_TRO_CAN_BO = ['admin', 'manager', 'handler'];

/* ⚠️ "ĐÃ ĐĂNG NHẬP" NGHĨA LÀ CÓ id VÀ role HỢP LỆ, không phải req.staff tồn tại
   (BUG-001). Trước đây chỉ kiểm `if (!req.staff)` — vé OTP của công dân lọt
   qua requireAuth sinh ra req.staff = {} (object rỗng vẫn truthy) nên
   authorize() không tham số cho qua. Lớp này phải tự đứng được, không trông
   vào việc requireAuth không bao giờ hở. */
export function laCanBoHopLe(staff) {
  return Boolean(staff)
    && Number.isInteger(staff.id) && staff.id > 0
    && VAI_TRO_CAN_BO.includes(staff.role);
}

export function authorize(...roles) {
  return (req, res, next) => {
    const s = req.staff;
    if (!s || !Number.isInteger(s.id) || s.id <= 0) {
      return res.status(401).json({ error: 'Chưa đăng nhập.' });
    }
    // Có id nhưng vai trò lạ (vd. bị sửa tay trong DB) -> không có quyền gì.
    if (!laCanBoHopLe(s) || (roles.length > 0 && !roles.includes(s.role))) {
      return res.status(403).json({ error: 'Bạn không có quyền thực hiện thao tác này.' });
    }
    next();
  };
}
