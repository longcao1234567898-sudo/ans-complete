/**
 * BỘ ĐẾM GIỚI HẠN ATOMIC DÙNG CHUNG (P86)
 * ============================================================================
 *
 * Mỗi lượt phải GIÀNH được một chỗ bằng MỘT câu UPDATE có điều kiện — MySQL khoá
 * dòng, nên 1.000 yêu cầu gửi dồn cùng lúc cũng chỉ đúng `toiDa` lượt qua.
 * Kiểu "SELECT COUNT rồi INSERT" thì cả 1.000 cùng đọc thấy "chưa đủ" (luật 6) —
 * với mã gửi qua SMS/Zalo, đó là tiền thật bị đốt.
 *
 * Cửa sổ cố định: lượt đầu mở cửa sổ `giay` giây; hết cửa sổ thì lượt kế tiếp
 * mở cửa sổ mới ngay trong cùng câu UPDATE (tách câu "đặt lại" riêng thì hai lượt
 * song song cùng đặt lại, xoá lượt của nhau). Hai phép gán đều đọc het_han CŨ
 * (so gán trước het_han).
 *
 * Đánh đổi: lượt bị từ chối ở bộ đếm SAU vẫn đã tính ở bộ đếm TRƯỚC — đếm dư,
 * không bao giờ đếm thiếu. Với chống phá, dư là phía an toàn.
 */
import crypto from 'node:crypto';

/** Giành một lượt. true = được, false = đã hết lượt trong cửa sổ. */
export async function giuLuot(pool, khoa, toiDa, giay) {
  await pool.query(
    `INSERT INTO dem_gioi_han (khoa, so, het_han) VALUES (?, 0, NOW() + INTERVAL ? SECOND)
     ON DUPLICATE KEY UPDATE khoa = khoa`,
    [khoa, giay]
  );
  const [kq] = await pool.query(
    `UPDATE dem_gioi_han
        SET so = CASE WHEN het_han <= NOW() THEN 1 ELSE so + 1 END,
            het_han = CASE WHEN het_han <= NOW() THEN NOW() + INTERVAL ? SECOND ELSE het_han END
      WHERE khoa = ? AND (so < ? OR het_han <= NOW())`,
    [giay, khoa, toiDa]
  );
  /* Dọn dòng đã hết hạn lâu — thỉnh thoảng, không phải mỗi lượt */
  if (crypto.randomInt(100) === 0) {
    pool.query('DELETE FROM dem_gioi_han WHERE het_han < NOW() - INTERVAL 2 DAY').catch(() => {});
  }
  return kq.affectedRows === 1;
}
