/**
 * DANH MỤC NHẬT KÝ — mọi mã hành động ghi vào staff_activity_logs (ADR-003 việc 9)
 * ============================================================================
 *
 * MỘT chỗ định nghĩa: trang Nhật ký lấy nhãn và nhóm từ đây (GET /logs/danh-muc),
 * bộ lọc theo nhóm và tệp Excel cũng đọc từ đây. Thêm hành động mới mà quên khai
 * ở đây thì bài quét nhat-ky-phu-kin.test.js báo đỏ — để không có dòng nhật ký
 * nào hiện ra dưới dạng mã khó hiểu mà lãnh đạo bỏ qua.
 *
 * Sắp nhóm theo câu hỏi người đọc nhật ký hay hỏi nhất, không theo route:
 *   "ai đã nhìn thấy / mang ra ngoài thứ nhạy cảm?" -> nhóm nhạy cảm đứng đầu
 *   "ai đã làm gì với hồ sơ?"                       -> xử lý, thùng rác
 *   "ai đã đổi cấu hình chống spam / trang công khai?"
 *
 * Hai hành động cũ (trước ADR-003) vẫn khai để dòng cũ trong CSDL đọc được.
 */

export const NHOM_NHAT_KY = Object.freeze([
  {
    ma: 'nhay_cam',
    ten: 'Danh tính, tin mật, xuất dữ liệu',
    nhayCam: true,
    hanhDong: {
      reveal_identity: 'Xem danh tính người gửi',
      view_flagged_submission: 'Mở tin chỉ lãnh đạo xem (tố giác mật, ngoài thẩm quyền)',
      export_data: 'Xuất danh sách ý kiến ra Excel',
      view_map: 'Xem bản đồ điểm nóng',
      view_logs: 'Mở nhật ký hệ thống',
      export_logs: 'Xuất nhật ký ra Excel',
      screen_capture_attempt: 'Bấm phím chụp màn hình / lệnh in trên trang cán bộ',
    },
  },
  {
    ma: 'dang_nhap',
    ten: 'Đăng nhập',
    hanhDong: {
      login: 'Đăng nhập',
      login_failed: 'Đăng nhập sai',
      logout: 'Đăng xuất',
    },
  },
  {
    ma: 'xem_ho_so',
    ten: 'Xem hồ sơ',
    hanhDong: {
      view_submission: 'Mở chi tiết hồ sơ',
    },
  },
  {
    ma: 'xu_ly',
    ten: 'Xử lý hồ sơ',
    hanhDong: {
      update_status: 'Đổi trạng thái xử lý',
      assign: 'Phân công',
      review_approve: 'Duyệt tin ẩn danh',
      review_spam: 'Loại tin ẩn danh (tin rác)',
      mark_spam: 'Đánh dấu tin rác',
      chat_message: 'Nhắn tin cho người báo',
      kiosk_submit: 'Nhập hộ tại trụ sở',
      ack_incident_group: 'Đánh dấu đã xem nhóm sự kiện',
      erase_identity: 'Xoá danh tính theo yêu cầu của người dân',
    },
  },
  {
    ma: 'sang_loc',
    ten: 'Sàng lọc và chuyển phần',
    hanhDong: {
      sang_loc_xac_nhan: 'Sàng lọc: xác nhận tin, đưa vào xử lý',
      sang_loc_chua_xac_minh: 'Sàng lọc: gắn nhãn chưa xác minh',
      sang_loc_tin_gia: 'Sàng lọc: đánh dấu tin giả (vào thùng rác)',
      sang_loc_ngoai_tham_quyen: 'Sàng lọc: chuyển sang ngoài thẩm quyền',
      ntq_chuyen_lai: 'Ngoài thẩm quyền: chuyển lại xử lý',
      ntq_xoa: 'Ngoài thẩm quyền: xoá (vào thùng rác)',
      ntq_da_chuyen: 'Ngoài thẩm quyền: đã chuyển cơ quan có thẩm quyền',
      move_to_secret: 'Chuyển tin vào phần tố giác mật',
      release_secret: 'Đưa tin ra khỏi phần tố giác mật',
      note_add: 'Thêm ghi chú nội bộ',
    },
  },
  {
    ma: 'thung_rac',
    ten: 'Thùng rác và xoá vĩnh viễn',
    hanhDong: {
      trash_restore: 'Khôi phục từ thùng rác',
      trash_purge: 'Xoá vĩnh viễn một hồ sơ',
      trash_empty: 'Dọn sạch thùng rác',
    },
  },
  {
    ma: 'chan_spam',
    ten: 'Chặn spam và thiết bị',
    hanhDong: {
      unblock_device: 'Gỡ khoá thiết bị',
      trust_device: 'Đánh dấu thiết bị tin cậy',
      untrust_device: 'Bỏ thiết bị tin cậy',
      unlock_appeal_accept: 'Chấp nhận khiếu nại mở khoá',
      unlock_appeal_reject: 'Từ chối khiếu nại mở khoá',
      banned_word_add: 'Thêm từ cấm',
      banned_word_delete: 'Xoá từ cấm',
    },
  },
  {
    ma: 'noi_dung',
    ten: 'Nội dung trang công khai',
    hanhDong: {
      news_create: 'Đăng tin tức',
      news_update: 'Sửa tin tức',
      news_show: 'Hiện tin tức',
      news_hide: 'Ẩn tin tức',
      hotspot_create: 'Thêm điểm đen giao thông',
      hotspot_update: 'Sửa điểm đen giao thông',
      hotspot_show: 'Hiện điểm đen giao thông',
      hotspot_hide: 'Ẩn điểm đen giao thông',
      qr_create: 'Tạo điểm QR',
      qr_update: 'Bật/tắt điểm QR',
      qr_delete: 'Xoá điểm QR',
    },
  },
  {
    ma: 'he_thong',
    ten: 'Cảnh báo của hệ thống',
    hanhDong: {
      canh_bao_dot_bien: 'Cảnh báo số đơn đột biến theo địa bàn',
    },
  },
  {
    ma: 'cu',
    ten: 'Hành động đã bỏ (dòng cũ)',
    hanhDong: {
      set_security_level: 'Đổi cấp độ bảo mật (đã bỏ theo ADR-003)',
      assign_denied: 'Phân công bị từ chối (đã bỏ theo ADR-003)',
    },
  },
]);

const THEO_MA = new Map();
for (const nhom of NHOM_NHAT_KY) {
  for (const [ma, ten] of Object.entries(nhom.hanhDong)) {
    THEO_MA.set(ma, { ma, ten, nhom: nhom.ma, tenNhom: nhom.ten, nhayCam: Boolean(nhom.nhayCam) });
  }
}

/** Mọi mã hành động đã khai */
export const MOI_HANH_DONG = Object.freeze([...THEO_MA.keys()]);

/** Tra một mã hành động. Mã lạ (dòng do phiên bản khác ghi) trả nguyên mã, nhóm 'khac'. */
export function tenHanhDong(ma) {
  return THEO_MA.get(ma)
    || { ma, ten: String(ma), nhom: 'khac', tenNhom: 'Khác', nhayCam: false };
}

/** Các mã thuộc một nhóm; nhóm lạ trả null (route trả 400, không đoán). */
export function hanhDongCuaNhom(maNhom) {
  const nhom = NHOM_NHAT_KY.find((n) => n.ma === maNhom);
  return nhom ? Object.keys(nhom.hanhDong) : null;
}
