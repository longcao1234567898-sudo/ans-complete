/**
 * ÁP DỤNG CHẾ ĐỘ TỐI TRƯỚC KHI TRANG HIỆN
 *
 * VÌ SAO PHẢI LÀ FILE RIÊNG, KHÔNG VIẾT THẲNG VÀO index.html:
 * Chính sách bảo mật nội dung (CSP) của hệ thống KHÔNG cho phép script viết
 * thẳng trong HTML — đó là biện pháp chống chèn mã độc. Có hai cách xử lý:
 *   1. Khai báo mã băm của script trong CSP -> mong manh, đổi một khoảng
 *      trắng là hỏng
 *   2. Tách ra file riêng -> chắc chắn, không phụ thuộc nội dung
 * Hệ thống chọn cách 2.
 *
 * File này nạp ĐỒNG BỘ trong <head> nên chạy xong mới vẽ trang -> không nháy
 * màn hình trắng khi người dùng đang ở chế độ tối.
 */
try {
  if (JSON.parse(localStorage.getItem('htans_theme')) === 'dark') {
    document.documentElement.classList.add('dark');
  }
} catch (e) {
  /* localStorage bị chặn (chế độ riêng tư) -> bỏ qua, dùng chế độ sáng */
}
