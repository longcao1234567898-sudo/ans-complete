/**
 * PHẦN NGƯỜI DÂN BỔ SUNG (ADR-003 việc 21, 22) — dùng chung cho route người dân
 * (routes/chat.js) và route cán bộ (routes/admin/submissions.js).
 */
import { pool } from '../db.js';

/** Bổ sung được trong chừng ấy giờ, tính từ lúc gửi (ADR-003 §7.4) */
export const GIO_BO_SUNG = 72;
/** Số lần bổ sung tối đa mỗi tin — khoá (submission_id, thu_tu) giữ cho phép đếm atomic */
export const SO_LAN_BO_SUNG_TOI_DA = 5;
/** Trạng thái còn nhận bổ sung: tin còn đang được xét */
export const TRANG_THAI_NHAN_BO_SUNG = ['received', 'pending_review', 'processing'];

/* Nhớ khi CÓ bảng và cột (database/nang_cap_v29.sql); chưa có thì hỏi lại lần sau */
let _co = false;
export async function coBangBoSung() {
  if (_co) return true;
  try {
    await pool.query('SELECT id FROM bo_sung_thong_tin LIMIT 0');
    await pool.query('SELECT bo_sung_id FROM submission_images LIMIT 0');
    _co = true;
  } catch { /* để false */ }
  return _co;
}

/** Cột đếm bổ sung chưa đọc cho SELECT danh sách (bí danh bảng hồ sơ: s). Chưa có bảng -> 0. */
export async function boSungSql() {
  return (await coBangBoSung())
    ? `COALESCE((SELECT COUNT(*) FROM bo_sung_thong_tin b
                  WHERE b.submission_id = s.id AND b.da_doc_luc IS NULL), 0) AS bo_sung_chua_doc`
    : '0 AS bo_sung_chua_doc';
}
