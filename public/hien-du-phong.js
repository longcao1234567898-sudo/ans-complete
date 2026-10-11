/**
 * LỐI THOÁT: 3 GIÂY CHƯA THẤY ỨNG DỤNG BÁO SẴN SÀNG THÌ CỨ HIỆN TRANG
 *
 * index.html ẩn #root tới khi main.tsx gắn lớp "san-sang" (tránh nháy trang chưa
 * kịp vẽ). Ứng dụng lỗi giữa chừng thì lớp đó không bao giờ được gắn — đoạn này
 * gắn hộ sau 3 giây để người dùng còn thấy trang.
 *
 * Ở tệp riêng, không viết thẳng trong index.html: CSP không cho script viết thẳng
 * (xem theme-init.js). Trước ND-059 đoạn này nằm trong index.html nên bị chặn
 * im lặng — lối thoát chưa từng chạy.
 */
setTimeout(function () {
  document.documentElement.classList.add('san-sang');
}, 3000);
