/**
 * GỢI Ý KHẮC PHỤC LỖI KẾT NỐI DATABASE — dùng chung cho các script dòng lệnh.
 *
 * Vì sao tách riêng: các script (thêm cán bộ, đặt mật khẩu admin...) đều nối
 * cùng một database nên gặp cùng những lỗi. Gom hướng dẫn về một chỗ để sửa
 * một lần là mọi script cùng tốt lên, thay vì chép đi chép lại rồi lệch nhau.
 */

/** In lỗi kèm hướng dẫn khắc phục theo đúng loại lỗi gặp phải. */
export function inLoiKetNoi(err) {
  console.error('\n❌ LỖI:', err.message);

  if (err.message.includes('ECONNREFUSED') || err.message.includes('ENOTFOUND')) {
    console.error('   👉 Không nối được tới database. Kiểm tra file server/.env:');
    console.error('      DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME có đúng chưa?\n');
    return;
  }

  if (err.message.includes('Access denied')) {
    console.error('   👉 Sai tài khoản hoặc mật khẩu database. Kiểm tra DB_USER và');
    console.error('      DB_PASSWORD trong server/.env.\n');
    return;
  }

  /* Lỗi chứng chỉ khi nối MySQL cloud (Aiven, PlanetScale...).
     Nguyên nhân: nhà cung cấp dùng CA riêng, không nằm trong kho CA của hệ điều
     hành. DB_SSL=true là bật TLS CÓ xác thực nên bị từ chối.
     Cách đúng là tải ca.pem của nhà cung cấp rồi trỏ DB_SSL_CA vào — KHÔNG tắt
     xác thực, vì tắt đi là mất luôn khả năng chống kẻ đứng giữa đọc trộm. */
  if (err.message.includes('self-signed certificate')
      || err.message.includes('self signed certificate')
      || err.code === 'SELF_SIGNED_CERT_IN_CHAIN') {
    console.error('   👉 Database cloud (Aiven) dùng chứng chỉ CA riêng. Làm như sau:');
    console.error('      1. Vào Aiven Console → chọn service MySQL → tab Overview');
    console.error('      2. Mục "CA Certificate" → bấm Download, được file ca.pem');
    console.error('      3. Chép ca.pem vào thư mục server/');
    console.error('      4. Mở server/.env, sửa thành:  DB_SSL_CA=./ca.pem');
    console.error('         (xoá hoặc để trống dòng DB_SSL=true)');
    console.error('      5. Chạy lại lệnh này.\n');
    console.error('   ⚠️ Đừng tắt xác thực chứng chỉ để cho nhanh — làm vậy là mất');
    console.error('      lớp chống kẻ đứng giữa đọc trộm dữ liệu danh tính.\n');
  }
}
