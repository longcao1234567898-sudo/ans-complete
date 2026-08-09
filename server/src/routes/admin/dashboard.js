/** Thống kê tổng quan cho dashboard cán bộ */
import { Router } from 'express';
import { pool } from '../../db.js';
import { requireAuth } from '../../middleware/auth.js';
import { decrypt, maskName } from '../../lib/crypto.js';

const router = Router();
router.use(requireAuth);

/** GET /api/admin/dashboard/stats */
router.get('/stats', async (_req, res) => {
  try {
    const [[overview]] = await pool.query('SELECT * FROM vw_dashboard_stats');

    /* ---------------------------------------------------------------------
       BA CON SỐ ĐIỀU HÀNH — thứ trưởng phòng cần biết ngay khi mở máy

       View vw_dashboard_stats chỉ đếm theo TRẠNG THÁI (đã tiếp nhận, đang xử
       lý, đã giải quyết...). Nhưng câu hỏi thật của người chỉ huy không phải
       "có bao nhiêu đơn đang xử lý" mà là:
           · Có việc nào ĐÃ TRỄ HẠN chưa?          -> phải giải trình
           · Có việc nào SẮP TRỄ trong 3 ngày tới?  -> còn kịp cứu
           · Có việc nào CHƯA AI NHẬN?             -> đang rơi vào khoảng trống

       Con số thứ ba quan trọng nhất mà hay bị bỏ quên: đơn đã tiếp nhận nhưng
       chưa phân công cho ai thì không ai thấy mình có trách nhiệm, cứ nằm đó
       tới lúc quá hạn mới lộ ra.
       --------------------------------------------------------------------- */
    let dieuHanh = { qua_han: 0, sap_han: 0, chua_phan_cong: 0 };
    try {
      const [[dh]] = await pool.query(
        `SELECT
           SUM(s.status IN ('received','processing')
               AND s.deadline_at IS NOT NULL
               AND s.deadline_at < NOW())                        AS qua_han,
           SUM(s.status IN ('received','processing')
               AND s.deadline_at IS NOT NULL
               AND s.deadline_at >= NOW()
               AND s.deadline_at <= DATE_ADD(NOW(), INTERVAL 3 DAY)) AS sap_han,
           SUM(s.status IN ('received','processing')
               AND s.assigned_to IS NULL)                        AS chua_phan_cong
         FROM submissions s
         WHERE s.deleted_at IS NULL
           AND (s.is_spam IS NULL OR s.is_spam = 0)`
      );
      dieuHanh = {
        qua_han: Number(dh?.qua_han || 0),
        sap_han: Number(dh?.sap_han || 0),
        chua_phan_cong: Number(dh?.chua_phan_cong || 0),
      };
    } catch (e) {
      /* Cột is_spam chưa có (chưa chạy nang_cap_v12.sql) -> thử lại không lọc.
         Thà thiếu một điều kiện còn hơn cả khối số liệu trắng trơn. */
      try {
        const [[dh2]] = await pool.query(
          `SELECT
             SUM(status IN ('received','processing') AND deadline_at < NOW())     AS qua_han,
             SUM(status IN ('received','processing') AND deadline_at >= NOW()
                 AND deadline_at <= DATE_ADD(NOW(), INTERVAL 3 DAY))              AS sap_han,
             SUM(status IN ('received','processing') AND assigned_to IS NULL)     AS chua_phan_cong
           FROM submissions WHERE deleted_at IS NULL`
        );
        dieuHanh = {
          qua_han: Number(dh2?.qua_han || 0),
          sap_han: Number(dh2?.sap_han || 0),
          chua_phan_cong: Number(dh2?.chua_phan_cong || 0),
        };
      } catch { /* để mặc định 0 */ }
    }
    const [byCategory] = await pool.query('SELECT * FROM vw_category_stats');
    const [recent] = await pool.query(
      `SELECT s.tracking_code, s.status, s.sender_name, c.name AS category_name, s.created_at
       FROM submissions s LEFT JOIN categories c ON s.category_id = c.id
       ORDER BY s.created_at DESC LIMIT 8`
    );
    /* DANH SÁCH VIỆC QUÁ HẠN / SẮP HẠN — hiện thẳng trên dashboard.
       Trước đây chỉ đếm số rồi bắt cán bộ bấm sang trang khác mới xem được.
       Giờ mở dashboard là thấy ngay việc nào cần làm gấp.
       Sắp xếp: khẩn cấp trước, rồi tới quá hạn lâu nhất. */
    let canGap = [];
    try {
      const [rows] = await pool.query(
        `SELECT s.id, s.tracking_code, s.original_content, s.urgency, s.status,
                s.deadline_at, c.name AS category_name,
                st.full_name AS assigned_name,
                DATEDIFF(NOW(), s.deadline_at) AS so_ngay_qua_han
         FROM submissions s
         LEFT JOIN categories c ON c.id = s.category_id
         LEFT JOIN staff st ON st.id = s.assigned_to
         WHERE s.status IN ('received','processing')
           AND s.deleted_at IS NULL
           AND s.deadline_at IS NOT NULL
           AND s.deadline_at < NOW() + INTERVAL 3 DAY
         ORDER BY FIELD(s.urgency,'urgent','important','normal'), s.deadline_at ASC
         LIMIT 10`
      );
      canGap = rows.map((r) => ({
        ...r,
        // Rút gọn nội dung, cán bộ chỉ cần nhìn lướt là biết việc gì
        preview: String(r.original_content || '').slice(0, 90),
        quaHan: Number(r.so_ngay_qua_han) > 0,
        soNgay: Math.abs(Number(r.so_ngay_qua_han) || 0),
      }));
    } catch (e) {
      console.warn('Bỏ qua danh sách việc cần gấp:', e.message);
    }

    /* NHÓM SỰ KIỆN TRÙNG LẶP CHƯA XEM — "nhiều người cùng báo 1 vụ việc".
       Xem server/src/lib/duplicate.js -> timSuKienTrung() để biết cách gộp. */
    let nhomTrungLap = [];
    try {
      const [rows] = await pool.query(
        `SELECT g.id, g.submission_count, g.last_reported_at,
                w.name AS ward_name, c.name AS category_name,
                LEFT(s.original_content, 90) AS preview
         FROM incident_groups g
         LEFT JOIN wards w ON w.id = g.ward_id
         LEFT JOIN categories c ON c.id = g.category_id
         LEFT JOIN submissions s ON s.id = g.first_submission_id
         WHERE g.acknowledged = FALSE AND g.submission_count >= 2
         ORDER BY g.submission_count DESC, g.last_reported_at DESC
         LIMIT 5`
      );
      nhomTrungLap = rows;
    } catch (e) {
      console.warn('Bỏ qua nhóm sự kiện trùng lặp:', e.message); // chưa chạy nang_cap_v11.sql
    }

    // SLA — cảnh báo quá hạn / sắp hết hạn / chưa phân công
    let sla = { overdue_count: 0, near_due_count: 0, unassigned_count: 0, pending_review_count: 0 };
    try {
      const [[row]] = await pool.query('SELECT * FROM vw_sla_stats');
      if (row) sla = row;
    } catch { /* chưa chạy nang_cap_v2.sql */ }

    // Che tên người gửi ở danh sách gần đây
    const recentSafe = recent.map((r) => ({ ...r, sender_name: maskName(decrypt(r.sender_name)) }));

    res.json({ overview, byCategory, recent: recentSafe, sla, dieuHanh, canGap, nhomTrungLap });
  } catch (err) {
    console.error('Lỗi thống kê:', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ.' });
  }
});

export default router;
