/**
 * HÀNG SÀNG LỌC VÀ CÁC PHẦN TIN (ADR-003 việc 11, 13–17)
 * ============================================================================
 *
 * Đường đi của một tin:
 *
 *   có danh tính ──► 'received' = CHỜ SÀNG LỌC ──┬─ Xác nhận ──► 'processing'
 *                                                ├─ Chưa xác minh (ở lại, gắn nhãn)
 *                                                ├─ Tin giả ──► thùng rác, không khoá máy
 *                                                ├─ Tin rác ──► thùng rác + khoá máy (/mark-spam)
 *                                                └─ Ngoài thẩm quyền ──► phần lãnh đạo
 *   ẩn danh ──► 'pending_review' (hàng kiểm duyệt ẩn danh) ── Duyệt ──► 'processing'
 *   tố cáo cán bộ (lib/to-giac-mat.js) ──► phần Tin tố giác mật, không qua sàng lọc
 *
 * Sau sàng lọc, tin chia vào các PHẦN theo nhóm và cờ — định nghĩa ở MỘT chỗ
 * dưới đây, route danh sách chỉ tra bảng. Mỗi phần là một mệnh đề SQL CỐ ĐỊNH,
 * không ghép giá trị người dùng. Phạm vi xem (lib/pham-vi-ho-so.js) vẫn AND
 * thêm ở route — phần chỉ là cách sắp, không phải lớp quyền.
 */
import { pool } from '../db.js';

/* Hai cờ chỉ lãnh đạo xem: NULL coi là CÓ cờ (fail-safe, như pham-vi-ho-so) */
const KHONG_CO = 'COALESCE(s.to_giac_mat, 1) = 0 AND COALESCE(s.ngoai_tham_quyen, 1) = 0';
const TO_GIAC = "c.code = 'to_giac'";
const KHONG_TO_GIAC = "(c.code IS NULL OR c.code <> 'to_giac')";

/**
 * Các phần danh sách. `trangThai`: trạng thái được lọc trong phần (null = mọi
 * trạng thái trừ spam); `macDinh`: trạng thái khi không chọn.
 * `canCot`: phần đọc hai cờ — CSDL chưa chạy v26 thì phần chỉ lãnh đạo trả rỗng,
 * các phần khác bỏ điều kiện cờ (cán bộ vốn không thấy hồ sơ nào lúc đó).
 */
export const PHAN = Object.freeze({
  sang_loc: {
    ten: 'Sàng lọc',
    sql: "s.status = 'received' AND s.is_anonymous = 0",
    co: KHONG_CO,
    trangThai: null,
  },
  xu_ly: {
    ten: 'Tin đưa vào xử lý',
    sql: KHONG_TO_GIAC,
    co: KHONG_CO,
    trangThai: ['processing', 'resolved', 'rejected'],
    macDinh: 'processing',
  },
  to_giac: {
    ten: 'Tin tố giác',
    sql: TO_GIAC,
    co: KHONG_CO,
    trangThai: ['processing', 'resolved', 'rejected'],
    macDinh: 'processing',
  },
  to_giac_mat: {
    ten: 'Tin tố giác mật',
    lanhDao: true,
    sql: "s.status <> 'spam'",
    co: 'COALESCE(s.to_giac_mat, 1) = 1',
    trangThai: null,
  },
  ngoai_tham_quyen: {
    ten: 'Ngoài thẩm quyền',
    lanhDao: true,
    sql: "s.status <> 'spam'",
    /* Tin vừa tố cáo cán bộ vừa ngoài thẩm quyền: nằm ở phần mật */
    co: 'COALESCE(s.ngoai_tham_quyen, 1) = 1 AND COALESCE(s.to_giac_mat, 1) = 0',
    trangThai: null,
  },
});

/** Tra phần theo tên — chỉ khoá RIÊNG của bảng (không đi theo prototype) */
export const timPhan = (ma) => (Object.hasOwn(PHAN, String(ma)) ? PHAN[String(ma)] : null);

/** Trạng thái đang chờ sàng lọc — mệnh đề đầy đủ, bí danh bảng bắt buộc là `s` */
export const DANG_CHO_SANG_LOC = `s.status = 'received' AND s.is_anonymous = 0 AND s.deleted_at IS NULL
  AND (s.is_spam IS NULL OR s.is_spam = 0) AND ${KHONG_CO}`;

/* Nhớ khi CÓ cột v28; chưa có thì hỏi lại lần sau (chạy tệp không cần khởi
   động lại). Lỗi bất kỳ coi như thiếu. */
let _coCot = false;
export async function coCotSangLoc() {
  if (_coCot) return true;
  try {
    await pool.query('SELECT chua_xac_minh_luc, sang_loc_boi, sang_loc_luc, giu_cho_lanh_dao FROM submissions LIMIT 0');
    await pool.query('SELECT id FROM ghi_chu_noi_bo LIMIT 0');
    _coCot = true;
  } catch { /* để false */ }
  return _coCot;
}

/** Cột nhãn "Chưa xác minh" cho SELECT danh sách; thiếu cột thì NULL */
export async function sangLocSql(bang = 's') {
  return (await coCotSangLoc()) ? `${bang}.chua_xac_minh_luc` : 'NULL AS chua_xac_minh_luc';
}

export const LOI_THIEU_COT = 'CSDL chưa có hàng sàng lọc — chạy database/nang_cap_v28.sql.';

/** Ghi một ghi chú nội bộ (chỉ ghi thêm). Ném lỗi nếu không ghi được. */
export async function themGhiChu(submissionId, staffId, noiDung) {
  await pool.query(
    'INSERT INTO ghi_chu_noi_bo (submission_id, staff_id, noi_dung) VALUES (?, ?, ?)',
    [submissionId, staffId, noiDung]
  );
}
