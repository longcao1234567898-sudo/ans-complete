/**
 * Middleware phân quyền theo vai trò.
 * authorize()                 -> chỉ cần đã đăng nhập
 * authorize('admin')          -> chỉ admin
 * authorize('admin','manager')-> admin hoặc manager
 */
export function authorize(...roles) {
  return (req, res, next) => {
    if (!req.staff) return res.status(401).json({ error: 'Chưa đăng nhập.' });
    if (roles.length > 0 && !roles.includes(req.staff.role)) {
      return res.status(403).json({ error: 'Bạn không có quyền thực hiện thao tác này.' });
    }
    next();
  };
}
