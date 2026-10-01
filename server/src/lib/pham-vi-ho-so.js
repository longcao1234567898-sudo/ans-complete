/**
 * PHẠM VI XEM HỒ SƠ (ADR-003 §4, thay chính sách cấp độ của BUG-009 / ADR-002 §3)
 * ============================================================================
 *
 * Luật nằm ở MỘT chỗ này, không rải từng route. Mọi truy vấn trả nội dung hồ sơ
 * cho cán bộ, hoặc ghi lên hồ sơ, đều AND với dieuKienXem(). Bài học của BUG-009:
 * rải kiểm từng route là cách đã để sót — thêm bề mặt mới (báo cáo, xuất file,
 * giao theo lô, tin trùng...) thì gọi hàm này, đừng tự viết lại điều kiện.
 *
 *   Ai                      Xem được
 *   lãnh đạo (admin, manager)  mọi hồ sơ
 *   cán bộ (handler)        hồ sơ KHÔNG mang cờ nào dưới đây
 *
 *   to_giac_mat       tin tố cáo cán bộ, người làm việc trong cơ quan nhà nước,
 *                     chính quyền — hệ thống tự gắn bằng từ khoá lúc nhận tin
 *   ngoai_tham_quyen  tin bị đánh dấu ngoài thẩm quyền ở bước sàng lọc
 *
 * ADR-003 bỏ ba cấp độ Thường / Cần bảo vệ / Mật và luật "người được giao xem
 * được". Cán bộ được giao một hồ sơ mang cờ cũng KHÔNG đọc được: phần Tin tố
 * giác mật chỉ dành cho lãnh đạo, và route phân công chặn giao hồ sơ mang cờ
 * cho cán bộ để màn hình không hiện một việc người nhận không mở được.
 *
 * ⚠️ FAIL-SAFE: cờ không đọc được (NULL — dữ liệu chép tay, cột cho phép NULL ở
 * một bản CSDL lạ) thì coi là CÓ cờ. Thiếu hẳn cột (chưa chạy
 * nang_cap_v26.sql) thì cán bộ không thấy hồ sơ nào. Đánh đổi đã chấp nhận:
 * thà cán bộ thiếu việc trong lúc chờ nâng cấp còn hơn lộ tin tố cáo cán bộ.
 */
import { pool } from '../db.js';
import { laLanhDao } from './vai-tro.js';

/* Nhớ khi CÓ cột. Chưa có thì hỏi lại lần sau: chạy v26 xong không phải khởi
   động lại máy chủ. Lỗi vì bất kỳ lý do gì thì coi như thiếu cột. Dò thẳng cột
   thay vì hỏi information_schema: kiểm đúng thứ các câu truy vấn sẽ đụng tới. */
let _coCot = false;
export async function coCotCo() {
  if (_coCot) return true;
  try {
    await pool.query('SELECT to_giac_mat, ngoai_tham_quyen FROM submissions LIMIT 0');
    _coCot = true;
  } catch {
    /* để false */
  }
  return _coCot;
}

const cot = (bang, ten) => (bang ? `${bang}.${ten}` : ten);

/**
 * Hai cờ để SELECT trả về giao diện (lãnh đạo cần biết hồ sơ đang nằm ở phần
 * nào). Thiếu cột thì trả 0 — chỉ lãnh đạo đọc được hồ sơ lúc đó, nên không lộ gì.
 * @param {string} bang bí danh bảng submissions trong câu truy vấn ('' nếu không có)
 */
export async function coSql(bang = 's') {
  if (!(await coCotCo())) return '0 AS to_giac_mat, 0 AS ngoai_tham_quyen';
  return `COALESCE(${cot(bang, 'to_giac_mat')}, 1) AS to_giac_mat, `
    + `COALESCE(${cot(bang, 'ngoai_tham_quyen')}, 1) AS ngoai_tham_quyen`;
}

/**
 * Điều kiện WHERE: những hồ sơ `staff` được xem. AND vào câu truy vấn, nối
 * `params` vào ĐÚNG vị trí dấu ? của nó.
 *
 * ⚠️ Luôn ra đúng/sai, KHÔNG BAO GIỜ NULL — để đặt được trong NOT (...) khi cần
 * tìm "hồ sơ người này KHÔNG xem được" (dieuKienNhomXem). COALESCE giữ điều đó
 * cả khi cờ là NULL.
 * @param {{ id: number, role: string }} staff req.staff
 * @param {string} bang bí danh bảng submissions ('' nếu câu không đặt bí danh)
 * @returns {Promise<{ sql: string, params: any[] }>}
 */
export async function dieuKienXem(staff, bang = 's') {
  if (laLanhDao(staff)) return { sql: '1 = 1', params: [] };   // ADR-003 §1
  if (!Number.isInteger(staff?.id) || staff.id <= 0) return { sql: '1 = 0', params: [] };
  /* Vai trò lạ không có dòng nào ở đây -> như cán bộ. Thiếu cột -> không thấy gì. */
  if (!(await coCotCo())) return { sql: '1 = 0', params: [] };
  return {
    sql: `(COALESCE(${cot(bang, 'to_giac_mat')}, 1) = 0 AND COALESCE(${cot(bang, 'ngoai_tham_quyen')}, 1) = 0)`,
    params: [],
  };
}

/**
 * Hồ sơ có mang cờ nào không (đọc thẳng CSDL, bỏ qua phạm vi). Route phân công
 * dùng để không giao hồ sơ mang cờ cho cán bộ. Không đọc được thì coi là có.
 */
export async function hoSoMangCo(id) {
  if (!(await coCotCo())) return true;
  const [r] = await pool.query(
    `SELECT (COALESCE(to_giac_mat, 1) = 1 OR COALESCE(ngoai_tham_quyen, 1) = 1) AS co
       FROM submissions WHERE id = ?`,
    [id]
  );
  return r.length === 0 ? true : Boolean(Number(r[0].co));
}

/**
 * `staff` có thấy nhóm sự kiện `nhomId` không. Dùng để che incident_group_id ở
 * trang chi tiết hồ sơ: hồ sơ thường trỏ tới một nhóm trả 404 là nói "nhóm này
 * có hồ sơ tương tự bạn không được xem" (trọng tài P44).
 */
export async function nhomXemDuoc(staff, nhomId) {
  if (nhomId == null) return false;
  const phamVi = await dieuKienNhomXem(staff);
  try {
    const [r] = await pool.query(
      `SELECT g.id FROM incident_groups g WHERE g.id = ? AND ${phamVi.sql}`,
      [nhomId, ...phamVi.params]
    );
    return r.length > 0;
  } catch {
    /* Chưa có bảng (nang_cap_v11.sql) hay lỗi khác: che, không để trang chi tiết sập */
    return false;
  }
}

/**
 * Điều kiện WHERE cho bảng incident_groups (bí danh BẮT BUỘC là `g`): nhóm
 * không có thành viên nào `staff` không xem được.
 *
 * Nhóm chứa dù chỉ một hồ sơ bị ẩn thì ẩn CẢ NHÓM, không chỉ che trích đoạn:
 * số đơn, giờ nhận đầu/cuối, id đơn đầu của nhóm đều nói "có một tin bạn không
 * thấy, cùng địa bàn, cùng lĩnh vực, lúc mấy giờ" — ở cấp xã thế là đủ để đoán.
 * Xét cả đơn đầu (first_submission_id), phòng khi dòng gán incident_group_id
 * của nó không ghi được.
 */
export async function dieuKienNhomXem(staff) {
  if (laLanhDao(staff)) return { sql: '1 = 1', params: [] };
  const phamVi = await dieuKienXem(staff, 'sx');
  return {
    sql: `NOT EXISTS (SELECT 1 FROM submissions sx
                       WHERE (sx.incident_group_id = g.id OR sx.id = g.first_submission_id)
                         AND NOT ${phamVi.sql})`,
    params: phamVi.params,
  };
}
