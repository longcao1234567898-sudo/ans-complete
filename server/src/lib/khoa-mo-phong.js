/**
 * ĐẾM LẦN THỬ MÃ PIN PHÒNG TRAO ĐỔI THEO HỒ SƠ (BUG-040)
 * ============================================================================
 *
 * VÌ SAO: giới hạn cũ chỉ theo IP (5 lần/15 phút). Kẻ đã biết mã tra cứu của
 * một hồ sơ thuê 1.000 IP là thử ~20.000 PIN mỗi giờ, trung bình chưa tới một
 * ngày ra PIN — vào phòng là đọc câu hỏi nghiệp vụ của cán bộ và mạo danh người
 * tố giác. Bật IPv6 thì mỗi máy có hàng tỷ địa chỉ. Đếm theo HỒ SƠ thì đổi bao
 * nhiêu IP cũng chung một bộ đếm: 10 lần/24 giờ -> dò hết 900.000 PIN mất hàng
 * trăm năm.
 *
 * ĐẶT LƯỢT TRƯỚC, KIỂM PIN SAU (luật 6). Kiểm PIN tốn ~80 ms; nếu kiểm trước rồi
 * mới đếm lần sai thì 1.000 yêu cầu gửi dồn cùng lúc đều đọc thấy "chưa tới
 * ngưỡng" và đều được kiểm. Ở đây mỗi lượt phải giành được một chỗ bằng MỘT câu
 * UPDATE có điều kiện (MySQL khoá dòng) — quá ngưỡng thì câu UPDATE không đổi
 * dòng nào, lượt đó bị chặn trước khi chạm tới PIN. Mở ĐÚNG thì trả lại chỗ:
 * chỉ lần SAI mới bị tính, bà con mở phòng nhiều lần trong ngày không tự khoá
 * mình.
 *
 * ĐÁNH ĐỔI ĐÃ CHẤP NHẬN (biến thể c của Bug Log): người biết mã tra cứu cố tình
 * nhập sai 10 lần là khoá được phòng của người thật — tối đa 24 giờ. Không phân
 * biệt được người thật với kẻ dò (cùng chỉ có mã tra cứu + PIN), mà để kẻ dò thử
 * tiếp thì lộ hướng xác minh. Bù lại: khoá có hạn, tra cứu tiến độ vẫn chạy, cán
 * bộ thấy cảnh báo trong khung trao đổi và vẫn nhắn tin vào được.
 *
 * FAIL-SAFE: chưa chạy database/nang_cap_v37.sql (thiếu bảng) thì KHÔNG mở
 * phòng — không đếm được lần thử thì không cho thử.
 */

export const NGUONG_THU_SAI = 10;
export const CUA_SO_GIO = 24;


/**
 * Giành một lượt thử PIN cho hồ sơ. Trả về true nếu được thử, false nếu hồ sơ
 * đã hết lượt trong cửa sổ 24 giờ. Ném lỗi ER_NO_SUCH_TABLE nếu thiếu bảng.
 */
export async function datLuotThu(pool, submissionId) {
  await pool.query(
    `INSERT INTO khoa_mo_phong (submission_id, so_lan, dem_tu) VALUES (?, 0, NOW())
     ON DUPLICATE KEY UPDATE submission_id = submission_id`,
    [submissionId]
  );
  /* Cửa sổ hết hạn thì bắt đầu cửa sổ mới ngay trong cùng câu — tách thành câu
     "đặt lại" riêng thì hai lượt song song có thể cùng đặt lại, xoá mất lượt
     của nhau. Hai phép gán đều đọc dem_tu CŨ (so_lan gán trước dem_tu). */
  const [kq] = await pool.query(
    `UPDATE khoa_mo_phong
        SET so_lan = CASE WHEN dem_tu <= NOW() - INTERVAL ? HOUR THEN 1 ELSE so_lan + 1 END,
            dem_tu = CASE WHEN dem_tu <= NOW() - INTERVAL ? HOUR THEN NOW() ELSE dem_tu END
      WHERE submission_id = ? AND (so_lan < ? OR dem_tu <= NOW() - INTERVAL ? HOUR)`,
    [CUA_SO_GIO, CUA_SO_GIO, submissionId, NGUONG_THU_SAI, CUA_SO_GIO]
  );
  return kq.affectedRows === 1;
}

/** Mở đúng PIN: trả lại lượt vừa giành — chỉ lần sai mới bị tính. */
export async function traLuotThu(pool, submissionId) {
  await pool.query(
    'UPDATE khoa_mo_phong SET so_lan = so_lan - 1 WHERE submission_id = ? AND so_lan > 0',
    [submissionId]
  );
}

/**
 * Cho cán bộ: hồ sơ có đang bị khoá mở phòng vì nhập sai PIN nhiều lần không.
 * Thiếu bảng (chưa nâng cấp) hoặc đọc lỗi -> null, khung trao đổi của cán bộ vẫn chạy.
 */
export async function trangThaiDoPin(pool, submissionId) {
  try {
    const [rows] = await pool.query(
      `SELECT CASE WHEN dem_tu <= NOW() - INTERVAL ? HOUR THEN 0 ELSE so_lan END AS so_lan,
              CASE WHEN so_lan >= ? AND dem_tu > NOW() - INTERVAL ? HOUR THEN 1 ELSE 0 END AS bi_khoa
         FROM khoa_mo_phong WHERE submission_id = ?`,
      [CUA_SO_GIO, NGUONG_THU_SAI, CUA_SO_GIO, submissionId]
    );
    if (rows.length === 0) return { biKhoa: false, soLanSai: 0 };
    return { biKhoa: Number(rows[0].bi_khoa) === 1, soLanSai: Number(rows[0].so_lan) };
  } catch (err) {
    /* Chỉ là dòng cảnh báo cho cán bộ, không phải lớp chặn — đọc lỗi (thiếu
       bảng, CSDL chập chờn) thì bỏ cảnh báo chứ không làm hỏng cả khung trao
       đổi. Lớp chặn thật (datLuotThu) vẫn fail-safe. */
    if (err.code !== 'ER_NO_SUCH_TABLE') console.error('[dò PIN] không đọc được trạng thái:', err.message);
    return null;
  }
}
