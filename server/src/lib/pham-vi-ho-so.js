/**
 * PHẠM VI XEM HỒ SƠ THEO CẤP ĐỘ BẢO MẬT (BUG-009, ADR-002 §3)
 * ============================================================================
 *
 * Mức "Mật" từng chỉ là nhãn: giao diện hứa "chỉ lãnh đạo" nhưng không route
 * nào đọc cột security_level để quyết định gì, nên mọi cán bộ vẫn đọc toàn văn,
 * đọc và GỬI tin trong phòng chat với người tố giác. Một lời hứa bảo vệ không
 * có thật tệ hơn không hứa: lãnh đạo hành xử như thể hồ sơ đã được che.
 *
 * Luật nằm ở MỘT chỗ này, không rải từng route. Mọi truy vấn trả nội dung hồ sơ
 * cho cán bộ, hoặc ghi lên hồ sơ, đều AND với dieuKienXem(). Rải kiểm từng
 * route chính là cách đã để sót ở đây — thêm bề mặt mới (báo cáo, xuất file,
 * giao theo lô...) thì gọi hàm này, đừng tự viết lại điều kiện.
 *
 *   Mức          Ai xem được (nội dung, chat, trích đoạn, thao tác ghi)
 *   thuong       mọi cán bộ (ADR-001)
 *   can_bao_ve   admin, manager, người đang được giao
 *   mat          admin và người admin giao — manager KHÔNG, trừ khi được giao
 *
 * "Người admin giao" của hồ sơ Mật đứng được nhờ ba chốt ở nơi khác, gỡ một
 * cái là manager lách được dòng Mật:
 *   · chỉ admin gọi /assign lên hồ sơ Mật (routes/admin/submissions.js)
 *   · nâng lên Mật thì gỡ người đang được giao (cùng tệp, /security-level)
 *   · phân công cũ của hồ sơ Mật đã gỡ bằng database/nang_cap_v24.sql
 *
 * ⚠️ FAIL-SAFE: mức không đọc được (thiếu cột vì chưa chạy nang_cap_v14.sql,
 * NULL, giá trị ngoài ENUM — MySQL không nghiêm ngặt lưu giá trị lạ thành '')
 * thì coi là Mật. Từng làm ngược lại: thiếu cột thì coi mọi tin là 'thuong'.
 * Đánh đổi đã chấp nhận: CSDL chưa nâng cấp thì handler và manager chỉ thấy
 * hồ sơ đang giao cho mình — thà cán bộ thiếu việc còn hơn lộ tố giác Mật.
 */
import { pool } from '../db.js';

export const CAP_DO_HOP_LE = ['thuong', 'can_bao_ve', 'mat'];

/** Mức chỉ admin được đặt, hạ và phân công */
export const MUC_CHI_TRUONG = 'mat';

/* Allow-list: mức nào mở cho MỌI người của vai trò đó, không cần được giao.
   admin không nằm ở đây vì xem được hết. Vai trò lạ không có dòng -> chỉ thấy
   hồ sơ đang giao cho mình. */
const MUC_MO_THEO_VAI_TRO = {
  manager: ['thuong', 'can_bao_ve'],
  handler: ['thuong'],
};

/* Nhớ khi CÓ cột. Chưa có thì hỏi lại lần sau: CSDL chưa nâng cấp là tình
   trạng tạm, chạy v14 xong không phải khởi động lại máy chủ. Lỗi vì bất kỳ lý
   do gì thì coi như thiếu cột — tức mọi hồ sơ là Mật, không phải là Thường.
   Dò thẳng cột thay vì hỏi information_schema: kiểm đúng thứ các câu truy vấn
   sẽ đụng tới, không phụ thuộc DATABASE() hay quyền đọc information_schema. */
let _coCot = false;
async function coCotCapDo() {
  if (_coCot) return true;
  try {
    await pool.query('SELECT security_level FROM submissions LIMIT 0');
    _coCot = true;
  } catch {
    /* để false */
  }
  return _coCot;
}

const cot = (bang, ten) => (bang ? `${bang}.${ten}` : ten);

/**
 * Biểu thức SQL cho mức của hồ sơ, đã chuẩn hoá: luôn ra một trong ba giá trị
 * hợp lệ, không đọc được thì 'mat'. Dùng cả để SELECT trả về giao diện, để giao
 * diện không hiện "Thường" cho hồ sơ không rõ mức.
 * @param {string} bang bí danh bảng submissions trong câu truy vấn ('' nếu không có)
 */
export async function capDoSql(bang = 's') {
  if (!(await coCotCapDo())) return `'${MUC_CHI_TRUONG}'`;
  return bieuThucCapDo(bang);
}

/**
 * Như capDoSql nhưng KHÔNG dò cột: dùng cho câu truy vấn vốn bắt buộc có cột
 * (câu ghi security_level). Ở đó thay mức bằng hằng 'mat' khi dò lỗi là SAI
 * CHIỀU: "đã Mật sẵn" thì không gỡ người được giao — một lần mất kết nối thoáng
 * qua làm việc gỡ giao im lặng bỏ qua (trọng tài P44). Cột thật sự thiếu thì
 * câu đó tự lỗi, không ghi gì.
 */
export function bieuThucCapDo(bang = 's') {
  const c = cot(bang, 'security_level');
  return `(CASE WHEN ${c} IN ('thuong', 'can_bao_ve', 'mat') THEN ${c} ELSE '${MUC_CHI_TRUONG}' END)`;
}

/**
 * Điều kiện WHERE: những hồ sơ `staff` được xem. AND vào câu truy vấn, nối
 * `params` vào ĐÚNG vị trí dấu ? của nó.
 *
 * ⚠️ Luôn ra đúng/sai, KHÔNG BAO GIỜ NULL — để đặt được trong NOT (...) khi cần
 * tìm "hồ sơ người này KHÔNG xem được". `assigned_to = ?` với hồ sơ chưa giao
 * ai là NULL; NOT NULL vẫn là NULL, nên NOT EXISTS sẽ lặng lẽ bỏ qua đúng hồ
 * sơ Mật chưa giao — thứ cần bắt nhất.
 * @param {{ id: number, role: string }} staff req.staff
 * @param {string} bang bí danh bảng submissions ('' nếu câu không đặt bí danh)
 * @returns {Promise<{ sql: string, params: any[] }>}
 */
export async function dieuKienXem(staff, bang = 's') {
  if (staff?.role === 'admin') return { sql: '1 = 1', params: [] };
  if (!Number.isInteger(staff?.id) || staff.id <= 0) return { sql: '1 = 0', params: [] };

  const cotGiao = cot(bang, 'assigned_to');
  const giao = `(${cotGiao} IS NOT NULL AND ${cotGiao} = ?)`;
  const moSan = Object.hasOwn(MUC_MO_THEO_VAI_TRO, staff.role) ? MUC_MO_THEO_VAI_TRO[staff.role] : [];
  if (moSan.length === 0) return { sql: `(${giao})`, params: [staff.id] };

  const danhSach = moSan.map((m) => `'${m}'`).join(', ');
  return {
    sql: `(${await capDoSql(bang)} IN (${danhSach}) OR ${giao})`,
    params: [staff.id],
  };
}

/**
 * Điều kiện WHERE cho bảng incident_groups (bí danh BẮT BUỘC là `g`): nhóm
 * không có thành viên nào `staff` không xem được.
 *
 * Nhóm chứa dù chỉ một hồ sơ bị ẩn thì ẩn CẢ NHÓM, không chỉ che trích đoạn:
 * số đơn, giờ nhận đầu/cuối, id đơn đầu của nhóm đều nói "có một tố giác bạn
 * không thấy, cùng thôn, cùng lĩnh vực, lúc mấy giờ" — ở cấp xã thế là đủ để
 * đoán. Đánh đổi: handler mất góc nhìn gộp của những nhóm trộn mức; từng hồ sơ
 * Thường trong nhóm vẫn hiện ở danh sách như mọi hồ sơ khác.
 * Xét cả đơn đầu (first_submission_id), phòng khi dòng gán incident_group_id
 * của nó không ghi được.
 */
/**
 * `staff` có thấy nhóm sự kiện `nhomId` không. Dùng để che incident_group_id ở
 * trang chi tiết hồ sơ: hồ sơ Thường trỏ tới một nhóm trả 404 là nói "nhóm này
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

export async function dieuKienNhomXem(staff) {
  if (staff?.role === 'admin') return { sql: '1 = 1', params: [] };
  const phamVi = await dieuKienXem(staff, 'sx');
  return {
    sql: `NOT EXISTS (SELECT 1 FROM submissions sx
                       WHERE (sx.incident_group_id = g.id OR sx.id = g.first_submission_id)
                         AND NOT ${phamVi.sql})`,
    params: phamVi.params,
  };
}
