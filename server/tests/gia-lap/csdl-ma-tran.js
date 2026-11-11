/**
 * CSDL giả cho test ma trận quyền (tests/ma-tran-quyen.test.js) — thay `src/db.js` trong
 * TIẾN TRÌNH CON chạy điểm khởi động thật (index.js, may-chu-can-bo.js, may-chu-cong-khai.js).
 *
 * Chỉ trả lời THẬT đúng một câu: `requireAuth` hỏi tài khoản còn hoạt động không. Mọi SELECT
 * khác trả rỗng, mọi câu ghi trả 0 dòng ảnh hưởng.
 *
 * Vì sao cố ý nghèo dữ liệu: ma trận đo LỚP QUYỀN, không đo nghiệp vụ. Một CSDL giả "trả
 * nguyên hàng bất kể câu SELECT" từng làm script kiểm chứng báo sai (bài học P23); còn
 * một CSDL giả trả "đang hoạt động" cho MỌI id thì từng che lỗ hổng BUG-001 (bài học P14).
 * Ở đây chỉ bốn id cố định là cán bộ; id khác — kể cả id lấy từ vé công dân — không có.
 */

/* id 1 trùng `sub` của vé chat công dân trong test (vé chat mang id ĐƠN): ca xấu nhất của
   BUG-001 — chữ ký đúng, sub trùng một cán bộ có thật. */
export const CAN_BO_GIA = Object.freeze({
  1: { role: 'admin', is_active: 1 },
  2: { role: 'manager', is_active: 1 },
  3: { role: 'handler', is_active: 1 },
  4: { role: 'admin', is_active: 0 }, // tài khoản đã bị khoá, vé vẫn còn hạn
});

const HOI_TRANG_THAI = /^\s*SELECT\s+is_active\s+FROM\s+staff\s+WHERE\s+id\s*=\s*\?\s*$/i;
const CAU_GHI = /^\s*(INSERT|UPDATE|DELETE|REPLACE)\b/i;

/* MA_TRAN_CSDL_HONG=1: mọi câu đều ném lỗi như MySQL mất kết nối — lớp quyền phải CHẶN
   (luật 1), không được cho qua vì không kiểm được. */
const HONG = process.env.MA_TRAN_CSDL_HONG === '1';

async function query(sql, params = []) {
  if (HONG) throw Object.assign(new Error('ma-tran-quyen: CSDL giả đang hỏng'), { code: 'ECONNREFUSED' });
  const s = String(sql?.sql ?? sql);
  if (HOI_TRANG_THAI.test(s)) {
    const cb = CAN_BO_GIA[params[0]];
    return [cb ? [{ is_active: cb.is_active }] : []];
  }
  if (CAU_GHI.test(s)) return [{ affectedRows: 0, changedRows: 0, insertId: 0 }];
  return [[]];
}

const ketNoi = {
  query,
  execute: query,
  async beginTransaction() {},
  async commit() {},
  async rollback() {},
  release() {},
};

export const pool = {
  query,
  execute: query,
  async getConnection() { return ketNoi; },
  async end() {},
  on() {},
};

export function buildSsl() { return undefined; }
