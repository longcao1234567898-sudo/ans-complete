/**
 * LUẬT MẬT KHẨU CÁN BỘ — MỘT NGUỒN DUY NHẤT (BUG-027)
 *
 * Dùng chung cho scripts-them-can-bo.js và scripts-create-admin.js. Trước đây
 * luật nằm riêng trong scripts-them-can-bo.js, còn script đặt mật khẩu cho
 * `admin` — tài khoản quyền cao nhất — chỉ đòi 6 ký tự: hai cửa vào cùng một
 * quyền với hai luật khác nhau. Thêm một cửa đặt mật khẩu mới thì nạp từ đây.
 */
/**
 * KIỂM ĐỘ MẠNH MẬT KHẨU.
 *
 * ⚠️ Trước đây chỉ đòi 6 ký tự — quá yếu cho tài khoản XEM ĐƯỢC DANH TÍNH
 *    NGƯỜI TỐ GIÁC. Mật khẩu 6 ký tự toàn chữ thường có khoảng 300 triệu tổ
 *    hợp, máy thường dò hết trong vài phút.
 *
 *    Nay đòi tối thiểu 12 ký tự, đủ bốn loại ký tự. Không phải để làm khó cán
 *    bộ: 12 ký tự trộn bốn loại cho số tổ hợp lớn gấp hàng tỉ tỉ lần, dò không
 *    nổi trong đời người.
 *
 * @returns chuỗi mô tả lỗi, hoặc null nếu mật khẩu đạt.
 */
export function kiemMatKhau(mk, tenDangNhap) {
  const thieu = [];
  if (mk.length < 12) thieu.push(`dài ít nhất 12 ký tự (hiện ${mk.length})`);
  if (!/[a-z]/.test(mk)) thieu.push('có chữ thường');
  if (!/[A-Z]/.test(mk)) thieu.push('có chữ HOA');
  if (!/[0-9]/.test(mk)) thieu.push('có chữ số');
  if (!/[^A-Za-z0-9]/.test(mk)) thieu.push('có ký tự đặc biệt như @ # ! $');
  if (thieu.length) return 'Mật khẩu cần: ' + thieu.join(', ') + '.';

  /* Chứa chính tên đăng nhập thì kẻ dò đoán được ngay phần đó — tên đăng nhập
     không phải bí mật, nó hiện trong nhật ký và danh sách phân công. */
  if (tenDangNhap && mk.toLowerCase().includes(String(tenDangNhap).toLowerCase())) {
    return 'Mật khẩu không được chứa tên đăng nhập.';
  }

  /* Những mật khẩu "đủ điều kiện" nhưng ai cũng nghĩ ra đầu tiên. */
  const QUEN_THUOC = ['matkhau', 'password', 'congan', 'admin', '123456', 'qwerty', 'abc123'];
  const thuong = mk.toLowerCase();
  const trung = QUEN_THUOC.find((x) => thuong.includes(x));
  if (trung) return `Mật khẩu chứa cụm quá quen thuộc "${trung}", dễ bị đoán. Chọn cụm khác.`;

  return null;
}
