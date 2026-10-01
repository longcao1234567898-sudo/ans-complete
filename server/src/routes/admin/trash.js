/**
 * THÙNG RÁC — nơi chứa tin đã bị đánh dấu "Tin rác".
 *
 * VÌ SAO CẦN: cán bộ lỡ tay bấm nhầm là mất luôn tin báo của bà con.
 * Tin vào thùng rác được GIỮ 7 NGÀY, trong thời gian đó khôi phục lại được.
 * Quá 7 ngày hệ thống tự xoá vĩnh viễn (đỡ phình database).
 *
 * Route nằm sau requireAuth -> chỉ cán bộ đăng nhập mới gọi được.
 */
import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { ghiNhatKy, ghiNhatKyTruoc } from '../../lib/helpers.js';
import { pool } from '../../db.js';
import { dieuKienXem } from '../../lib/pham-vi-ho-so.js';
import { laLanhDao } from '../../lib/vai-tro.js';
import { coCotSangLoc } from '../../lib/sang-loc.js';

const router = Router();

/* 🔒 Bắt buộc đăng nhập.
   Trước đây file này import requireAuth nhưng KHÔNG BAO GIỜ GỌI, khiến toàn bộ
   đường dẫn ở đây mở cho bất kỳ ai trên Internet. /api/admin đã chặn chung ở
   routes/admin/index.js, dòng này là lớp thứ hai — phòng khi router được gắn
   ở chỗ khác. */
router.use(requireAuth);

const GIU_NGAY = 7; // số ngày giữ trong thùng rác trước khi xoá hẳn

/**
 * Tự dọn tin quá hạn giữ. Gọi mỗi lần cán bộ mở thùng rác —
 * đơn giản hơn dựng cron job, mà vẫn bảo đảm dữ liệu không tồn mãi.
 */
async function donRacQuaHan() {
  try {
    /* Tin tố giác bị sàng lọc đánh "Tin giả" (giu_cho_lanh_dao = 1) KHÔNG tự
       xoá: giữ tới khi lãnh đạo khôi phục hoặc xoá tay (ADR-003 việc 14) —
       một lần bấm không được làm mất một tố giác thật. */
    const [r] = (await coCotSangLoc())
      ? await pool.query(
        `DELETE FROM submissions
         WHERE deleted_at IS NOT NULL
           AND deleted_at < NOW() - INTERVAL ? DAY
           AND giu_cho_lanh_dao = 0`,
        [GIU_NGAY]
      )
      : await pool.query(
        `DELETE FROM submissions
         WHERE deleted_at IS NOT NULL
           AND deleted_at < NOW() - INTERVAL ? DAY`,
        [GIU_NGAY]
      );
    if (r.affectedRows > 0) {
      console.log(`🗑️  Đã tự xoá vĩnh viễn ${r.affectedRows} tin quá ${GIU_NGAY} ngày trong thùng rác`);
    }
    return r.affectedRows;
  } catch (err) {
    console.warn('Dọn thùng rác lỗi:', err.message);
    return 0;
  }
}

/** GET /api/admin/trash — danh sách tin trong thùng rác */
router.get('/', async (req, res) => {
  try {
    const autoDeleted = await donRacQuaHan();

    /* Vào thùng rác không làm hồ sơ Mật hết Mật (BUG-009) */
    const phamVi = await dieuKienXem(req.staff);
    const [rows] = await pool.query(
      `SELECT s.id, s.tracking_code, s.original_content, s.ai_processed_content,
              s.is_anonymous, s.created_at, s.deleted_at,
              st.full_name AS deleted_by_name,
              c.name AS category_name, c.code AS category_code,
              DATEDIFF(DATE_ADD(s.deleted_at, INTERVAL ? DAY), NOW()) AS days_left
       FROM submissions s
       LEFT JOIN staff st ON st.id = s.deleted_by
       LEFT JOIN categories c ON c.id = s.category_id
       WHERE s.deleted_at IS NOT NULL
         AND ${phamVi.sql}
       ORDER BY s.deleted_at DESC
       LIMIT 200`,
      [GIU_NGAY, ...phamVi.params]
    );

    res.json({
      items: rows.map((r) => {
        const toanVan = String(r.ai_processed_content || r.original_content || '');
        return {
          ...r,
          // Nội dung rút gọn để hiện trong danh sách
          preview: toanVan.slice(0, 200),
          /* Toàn văn để cán bộ bấm "Xem chi tiết" đọc ngay tại chỗ, khỏi phải
             khôi phục tin ra mới đọc được. Giới hạn 5000 ký tự cho nhẹ — dài
             hơn thế thì khôi phục rồi mở trang chi tiết. */
          noiDungDayDu: toanVan.slice(0, 5000),
          coBiCat: toanVan.length > 5000,
          daysLeft: Math.max(0, Number(r.days_left) || 0),
        };
      }),
      keepDays: GIU_NGAY,
      autoDeleted,
    });
  } catch (err) {
    /* ---------------------------------------------------------------------
       BÁO RÕ LỖI GÌ, KHÔNG CHỈ "Lỗi máy chủ"

       Câu "Lỗi máy chủ" chung chung khiến không ai lần ra được nguyên nhân —
       cán bộ chỉ biết hỏng, quản trị viên cũng không biết sửa từ đâu.

       Hai nguyên nhân hay gặp nhất đều đoán được từ nội dung lỗi:
         · Thiếu bảng/cột  -> chưa chạy tệp nâng cấp SQL
         · Ràng buộc khoá ngoại -> có bảng con trỏ tới submissions mà không
           đặt ON DELETE CASCADE, nên lệnh dọn rác quá hạn bị chặn
       --------------------------------------------------------------------- */
    const m = String(err.message || '');
    let goiY = 'Lỗi máy chủ.';
    if (/Unknown column|doesn't exist|Table .* doesn't exist/i.test(m)) {
      goiY = `Database thiếu bảng hoặc cột. Cần chạy các tệp nâng cấp SQL còn thiếu. (${m})`;
    } else if (/foreign key|constraint/i.test(m)) {
      goiY = `Vướng ràng buộc khoá ngoại khi dọn thùng rác — có bảng con trỏ tới `
           + `submissions mà chưa đặt ON DELETE CASCADE. (${m})`;
    } else if (m) {
      goiY = `Lỗi máy chủ: ${m}`;
    }
    console.error('Lỗi thùng rác:', m);
    res.status(500).json({ error: goiY });
  }
});

/** POST /api/admin/trash/:id/restore — khôi phục về hàng chờ kiểm duyệt */
router.post('/:id/restore', async (req, res) => {
  try {
    const phamVi = await dieuKienXem(req.staff, '');   // BUG-009
    const [rows] = await pool.query(
      `SELECT id, is_anonymous FROM submissions WHERE id = ? AND deleted_at IS NOT NULL AND ${phamVi.sql}`,
      [req.params.id, ...phamVi.params]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Không tìm thấy tin trong thùng rác (có thể đã bị xoá hẳn).' });
    }

    // Tin ẩn danh -> trả về hàng chờ kiểm duyệt để xét lại
    // Tin thường  -> trả về trạng thái đã tiếp nhận
    const newStatus = rows[0].is_anonymous ? 'pending_review' : 'received';

    await pool.query(
      `UPDATE submissions
       SET deleted_at = NULL, deleted_by = NULL, status = ?
       WHERE id = ?`,
      [newStatus, req.params.id]
    );

    /* Ghi nhật ký qua ghiNhatKy: cột details là JSON, ghi chuỗi trần thì MySQL
       từ chối cả câu — lỗi bị nuốt, nhật ký mất dòng (trước đây vẫn thế).
       req.staff LUÔN tồn tại (requireAuth ở router cha) -> ghi được đích danh. */
    await ghiNhatKy(pool, req, {
      hanhDong: 'trash_restore', loaiDoiTuong: 'submission', doiTuongId: Number(req.params.id),
      chiTiet: { trangThaiMoi: newStatus },
    });

    res.json({ ok: true, status: newStatus, message: 'Đã khôi phục tin báo.' });
  } catch (err) {
    console.error('Lỗi khôi phục:', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ khi khôi phục.' });
  }
});

/** DELETE /api/admin/trash/:id — xoá vĩnh viễn NGAY (không chờ hết 7 ngày) */
router.delete('/:id', async (req, res) => {
  // Chỉ admin mới được xoá vĩnh viễn — tránh cán bộ thường xoá mất chứng cứ
  if (!laLanhDao(req.staff)) {
    return res.status(403).json({ error: 'Chỉ lãnh đạo mới được xoá vĩnh viễn.' });
  }

  try {
    const [co] = await pool.query(
      'SELECT tracking_code FROM submissions WHERE id = ? AND deleted_at IS NOT NULL',
      [req.params.id]
    );
    if (co.length === 0) {
      return res.status(404).json({ error: 'Không tìm thấy tin trong thùng rác.' });
    }
    /* Xoá vĩnh viễn không hoàn tác được: ghi TRƯỚC, ghi không được thì không
       xoá (ném lỗi -> 500 ở dưới). Ghi cả mã tra cứu — sau khi xoá, đó là thứ
       duy nhất còn lại để đối chiếu với người dân hay hồ sơ giấy. */
    await ghiNhatKyTruoc(pool, req, {
      hanhDong: 'trash_purge', loaiDoiTuong: 'submission', doiTuongId: Number(req.params.id),
      chiTiet: { maTraCuu: co[0].tracking_code },
    });
    const [r] = await pool.query(
      'DELETE FROM submissions WHERE id = ? AND deleted_at IS NOT NULL',
      [req.params.id]
    );
    if (r.affectedRows === 0) {
      return res.status(404).json({ error: 'Không tìm thấy tin trong thùng rác.' });
    }

    res.json({ ok: true, message: 'Đã xoá vĩnh viễn.' });
  } catch (err) {
    console.error('Lỗi xoá vĩnh viễn:', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ khi xoá.' });
  }
});

/** DELETE /api/admin/trash — dọn sạch toàn bộ thùng rác (chỉ admin) */
router.delete('/', async (req, res) => {
  if (!laLanhDao(req.staff)) {
    return res.status(403).json({ error: 'Chỉ lãnh đạo mới được dọn sạch thùng rác.' });
  }
  try {
    /* Như xoá vĩnh viễn từng tin: ghi TRƯỚC, kèm danh sách mã tra cứu */
    const [ds] = await pool.query('SELECT tracking_code FROM submissions WHERE deleted_at IS NOT NULL');
    await ghiNhatKyTruoc(pool, req, {
      hanhDong: 'trash_empty', loaiDoiTuong: 'submission',
      chiTiet: { soTin: ds.length, maTraCuu: ds.slice(0, 100).map((d) => d.tracking_code) },
    });
    const [r] = await pool.query('DELETE FROM submissions WHERE deleted_at IS NOT NULL');
    res.json({ ok: true, deleted: r.affectedRows });
  } catch (err) {
    console.error('Lỗi dọn thùng rác:', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ.' });
  }
});

export default router;
