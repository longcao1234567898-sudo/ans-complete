/**
 * VÒNG ĐỜI CỦA DẤU NỐI — mã máy và IP đã băm tự xoá sau 30 ngày
 * ============================================================================
 *
 * submissions.device_id và submissions.ip_address không chỉ ra ai cả, nhưng hai
 * đơn cùng giá trị là hai đơn từ cùng một máy / một mạng. Đó là DẤU NỐI: có nó,
 * người cầm bản sao CSDL (hoặc một cán bộ đọc được nó qua đường nào đó) nối
 * được tố giác với một đơn có tên của cùng người gửi (BUG-014, SEC-DEC-008).
 *
 * Chống spam chỉ cần hai dấu này trong 30 ngày: mọi cửa sổ trong mã đều ngắn
 * hơn (giới hạn giờ/ngày, chặn trùng 24 giờ, khoá 24 giờ, tái phạm 30 ngày).
 * Giữ lâu hơn chỉ có lợi cho người đọc trộm. Nên quá 30 ngày thì xoá.
 *
 * Mã máy và IP còn một bản sao nữa: blacklists.identifier. Dòng khoá hết hạn
 * không còn chặn gì (mọi câu đọc khoá đều lọc expires_at > NOW()), nhưng vẫn
 * giữ mã máy cùng giờ khoá và người khoá — ghép với status_history là ra lại
 * đơn nào gây khoá, dù đơn đó đã mất mã máy. Nên dòng hết hạn cũng xoá.
 *
 * Mỗi lượt làm ĐỦ bốn việc của database/nang_cap_v21.sql (xem donDauNoi), vì
 * tệp đó chạy trước khi cập nhật mã, và mã cũ còn ghi dữ liệu kiểu cũ ở giữa.
 *
 * ⚠️ KHÔNG CHỜ AI MỞ TRANG NÀO.
 * Kiểu "dọn khi có cán bộ mở thùng rác" (donRacQuaHan) nghĩa là đơn vị ít
 * người dùng thì dấu nối sống mãi. Ở đây máy chủ tự dọn ngay lúc khởi động,
 * rồi lặp lại theo chu kỳ, ở cả ba điểm vào (index.js, may-chu-cong-khai.js,
 * may-chu-can-bo.js). Chạy tách hai máy chủ thì cả hai cùng dọn — câu lệnh
 * chạy lại bao nhiêu lần cũng ra một kết quả.
 *
 * Đánh đổi đã chấp nhận (SEC-DEC-008):
 *   · quá 30 ngày thì không đối chiếu IP để truy kẻ phá được nữa, và khiếu nại
 *     cũ mất phần "đơn có tên bị rác cùng máy"
 *   · máy chủ ngủ (Render gói miễn phí) thì không dọn lúc ngủ; dấu nối có thể
 *     sống quá 30 ngày đúng bằng thời gian ngủ, tới lần khởi động kế tiếp
 *   · dọn lỗi (mất kết nối CSDL) thì chỉ ghi log và thử lại chu kỳ sau — dừng
 *     phục vụ không xoá được dấu nối nào, chỉ làm mất kênh tố giác
 */

/** Số ngày giữ dấu nối — SEC-DEC-008 câu 5 */
export const SO_NGAY_GIU_DAU_NOI = 30;

/* Một giờ: đủ dày để dấu nối không sống quá hạn đáng kể, đủ thưa để câu UPDATE
   (quét theo created_at) không thành tải. */
const CHU_KY_MAC_DINH_MS = 60 * 60_000;

/**
 * Xoá mã máy và IP đã băm của mọi đơn quá hạn giữ.
 *
 * updated_at = updated_at: cột này tự đóng giờ khi sửa (ON UPDATE
 * CURRENT_TIMESTAMP). Để nó đóng giờ thì mọi đơn bị dọn cùng một lượt mang cùng
 * một giờ — đó lại là một dấu gom nhóm mới (bài học P29, N1).
 *
 * @returns số đơn đã dọn
 */
export async function xoaDauNoiQuaHan(pool) {
  const [kq] = await pool.query(
    `UPDATE submissions
        SET device_id = NULL, ip_address = NULL, updated_at = updated_at
      WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY)
        AND (device_id IS NOT NULL OR ip_address IS NOT NULL)`,
    [SO_NGAY_GIU_DAU_NOI]
  );
  return kq?.affectedRows || 0;
}

/**
 * Xoá mọi dòng khoá thiết bị / địa chỉ mạng không còn tác dụng:
 *   · đã hết hạn, mọi loại đơn;
 *   · loai_don = 'khong_ro' — chỉ mã trước nang_cap_v19 ghi loại này, và từ v19
 *     nó không chặn gì. Mã hiện tại không bao giờ ghi nó, nên xoá định kỳ là an
 *     toàn. Phải xoá ở đây chứ không chỉ trong nang_cap_v21.sql: tệp đó chạy
 *     TRƯỚC khi cập nhật mã máy chủ, và trong khoảng giữa mã cũ vẫn ghi dòng
 *     khong_ro mới — mang lại đúng dòng khoá ghi đè chéo loại (R1).
 *
 * Chỉ kind 'device' và 'ip': dòng 'trusted_device' là danh sách máy kiosk (cũng
 * mang 'khong_ro'), không phải khoá — xoá nhầm là máy dùng chung bị khoá oan ở
 * lần "Tin rác" sau.
 *
 * @returns số dòng đã xoá
 */
export async function xoaDongKhoaVoHieu(pool) {
  const [kq] = await pool.query(
    `DELETE FROM blacklists
      WHERE kind IN ('device', 'ip')
        AND (expires_at < NOW() OR loai_don = 'khong_ro')`
  );
  return kq?.affectedRows || 0;
}

/**
 * Xoá mã máy còn sót trên đơn đã xoá danh tính. Hai đường xoá danh tính hiện
 * tại tự xoá mã máy; câu này dọn phần mã cũ ghi trong khoảng hở triển khai.
 *
 * @returns số đơn đã dọn
 */
export async function xoaMaMayDonDaXoaDanhTinh(pool) {
  const [kq] = await pool.query(
    `UPDATE submissions
        SET device_id = NULL, updated_at = updated_at
      WHERE identity_erased = 1
        AND device_id IS NOT NULL`
  );
  return kq?.affectedRows || 0;
}

/**
 * Xoá mã máy trên đơn ẩn danh (is_anonymous khác 0 hoặc NULL) và mọi dòng khoá
 * loại ẩn danh — hai việc của database/nang_cap_v22.sql (BUG-017, SEC-DEC-008
 * M-B). Mã hiện tại không ghi hai thứ này nữa; câu dưới dọn phần mã cũ ghi, kể
 * cả trong khoảng giữa lúc chạy v22 và lúc cập nhật mã. Không đụng is_spam hay
 * trusted_device.
 *
 * @returns {{ soDonAnDanh: number, soKhoaAnDanh: number }}
 */
export async function xoaDauNoiDonAnDanh(pool) {
  const [don] = await pool.query(
    `UPDATE submissions
        SET device_id = NULL, updated_at = updated_at
      WHERE COALESCE(is_anonymous, 1) <> 0
        AND device_id IS NOT NULL`
  );
  const [khoa] = await pool.query(
    `DELETE FROM blacklists
      WHERE kind IN ('device', 'ip')
        AND loai_don = 'an_danh'`
  );
  return { soDonAnDanh: don?.affectedRows || 0, soKhoaAnDanh: khoa?.affectedRows || 0 };
}

/**
 * Một lượt dọn đủ mọi dấu nối — cùng các việc với nang_cap_v21.sql và
 * nang_cap_v22.sql, để thứ tự "chạy tệp nâng cấp rồi mới cập nhật mã" không để
 * lại khoảng hở nào. Lỗi thì ném ra cho bên gọi ghi log.
 */
export async function donDauNoi(pool) {
  const soDongKhoa = await xoaDongKhoaVoHieu(pool);
  const soDonDaXoaDanhTinh = await xoaMaMayDonDaXoaDanhTinh(pool);
  const { soDonAnDanh, soKhoaAnDanh } = await xoaDauNoiDonAnDanh(pool);
  const soDon = await xoaDauNoiQuaHan(pool);
  return { soDon, soDongKhoa, soDonDaXoaDanhTinh, soDonAnDanh, soKhoaAnDanh };
}

/**
 * Bật tự dọn: chạy NGAY một lượt, rồi lặp theo chu kỳ. Gọi trong start() của
 * mọi điểm vào máy chủ.
 *
 * @returns {{ dung: () => void }} để test dừng được bộ hẹn giờ
 */
export function batTuDonDauNoi(pool, { chuKyMs = CHU_KY_MAC_DINH_MS } = {}) {
  const motLuot = async () => {
    try {
      const { soDon, soDongKhoa, soDonDaXoaDanhTinh, soDonAnDanh, soKhoaAnDanh } = await donDauNoi(pool);
      if (soDon > 0) console.log(`🧹 Đã xoá dấu nối (mã máy, IP đã băm) của ${soDon} đơn quá ${SO_NGAY_GIU_DAU_NOI} ngày`);
      if (soDongKhoa > 0) console.log(`🧹 Đã xoá ${soDongKhoa} dòng khoá hết hạn / không rõ loại`);
      if (soDonDaXoaDanhTinh > 0) console.log(`🧹 Đã xoá mã máy còn sót của ${soDonDaXoaDanhTinh} đơn đã xoá danh tính`);
      if (soDonAnDanh > 0) console.log(`🧹 Đã xoá mã máy còn sót của ${soDonAnDanh} đơn ẩn danh`);
      if (soKhoaAnDanh > 0) console.log(`🧹 Đã xoá ${soKhoaAnDanh} dòng khoá loại ẩn danh của mã cũ`);
    } catch (err) {
      console.error('🔴 KHÔNG xoá được dấu nối quá hạn — sẽ thử lại chu kỳ sau:', err.message);
    }
  };
  motLuot();
  const hen = setInterval(motLuot, chuKyMs);
  /* Không giữ tiến trình sống chỉ vì bộ hẹn giờ này */
  hen.unref?.();
  return { dung: () => clearInterval(hen) };
}
