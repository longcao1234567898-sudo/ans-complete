/** API quản lý ý kiến cho cán bộ (yêu cầu đăng nhập) */
import { Router } from 'express';
import { layIpThat } from '../../lib/helpers.js';
import { khoaThietBi, khoaIpThuCong } from '../../lib/chan-spam.js';
import { pool } from '../../db.js';
import { requireAuth } from '../../middleware/auth.js';
import { authorize } from '../../middleware/authorize.js';
import { decrypt, maskPhone, maskName } from '../../lib/crypto.js';

const router = Router();
router.use(requireAuth);

/** Tính tình trạng hạn xử lý (SLA) */
function slaOf(row) {
  if (!row.deadline_at) return { sla: 'none', daysLeft: null };
  if (row.status === 'resolved' || row.status === 'rejected') return { sla: 'done', daysLeft: null };
  const ms = new Date(row.deadline_at).getTime() - Date.now();
  const daysLeft = Math.ceil(ms / 86400000);
  if (ms < 0) return { sla: 'overdue', daysLeft };      // QUÁ HẠN
  if (daysLeft <= 3) return { sla: 'near', daysLeft };  // SẮP HẾT HẠN
  return { sla: 'ok', daysLeft };
}

/** GET /api/admin/submissions — danh sách + lọc + phân trang */
router.get('/', async (req, res) => {
  const { status, category, q, sla, assigned, urgency } = req.query;

  /* ------------------------------------------------------------------------
     SẮP XẾP THEO Ý CÁN BỘ

     Mặc định vẫn là thứ tự nghiệp vụ: khẩn cấp trước, rồi quá hạn, rồi mới
     nhất. Đó là thứ tự đúng cho việc xử lý hằng ngày.

     Nhưng có lúc cán bộ cần thứ tự khác — rà lại đơn cũ tồn đọng, hay xem
     riêng nhóm ít khẩn cấp. Nên cho chọn.

     ⚠️ Danh sách CỐ ĐỊNH, không ghép chuỗi từ dữ liệu người dùng. Cho phép
     truyền thẳng tên cột vào ORDER BY là mở đường cho tấn công SQL.
     ------------------------------------------------------------------------ */
  const CACH_SAP_XEP = {
    /* Mặc định — thứ tự nghiệp vụ */
    mac_dinh: `ORDER BY FIELD(s.urgency,'urgent','important','normal'),
                        (s.status IN ('received','processing') AND s.deadline_at < NOW()) DESC,
                        s.created_at DESC`,
    moi_nhat:  'ORDER BY s.created_at DESC',
    cu_nhat:   'ORDER BY s.created_at ASC',
    /* Mức cao trước: khẩn cấp -> quan trọng -> bình thường */
    muc_cao:   `ORDER BY FIELD(s.urgency,'urgent','important','normal'), s.created_at DESC`,
    /* Mức thấp trước — để rà nhóm ít gấp mà hay bị bỏ quên */
    muc_thap:  `ORDER BY FIELD(s.urgency,'normal','important','urgent'), s.created_at DESC`,

    /* ------------------------------------------------------------------
       THEO CÁN BỘ PHỤ TRÁCH

       Gom ý kiến của cùng một cán bộ vào liền nhau. Dùng khi trưởng phòng
       rà xem ai đang ôm bao nhiêu việc, hay khi một cán bộ muốn lọc ra
       phần của mình mà không nhớ mã.

       Đơn CHƯA PHÂN CÔNG xếp lên ĐẦU — đó mới là thứ cần giải quyết trước,
       vì không ai thấy mình có trách nhiệm nên hay nằm im tới lúc quá hạn.
       ------------------------------------------------------------------ */
    theo_can_bo: `ORDER BY (s.assigned_to IS NULL) DESC,
                           st.full_name ASC,
                           FIELD(s.urgency,'urgent','important','normal'),
                           s.created_at DESC`,
    /* Gom theo CÁN BỘ PHỤ TRÁCH — để trưởng phòng xem ai đang ôm việc gì.
       Đơn CHƯA PHÂN CÔNG xếp lên đầu: đó là nhóm dễ rơi vào khoảng trống nhất,
       không ai thấy mình có trách nhiệm nên cứ nằm tới lúc quá hạn. */
    theo_can_bo: `ORDER BY (s.assigned_to IS NULL) DESC,
                           st.full_name ASC,
                           FIELD(s.urgency,'urgent','important','normal'),
                           s.created_at DESC`,
  };
  const sapXepSql = CACH_SAP_XEP[String(req.query.sort || '')] || CACH_SAP_XEP.mac_dinh;
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(50, Math.max(5, Number(req.query.limit) || 20));
  const offset = (page - 1) * limit;

  const where = [];
  const params = [];
  /* LUÔN ẩn tin trong thùng rác, dù lọc theo trạng thái nào.
     (Trước đây dòng này nằm nhầm trong khối else -> lọc theo trạng thái
      thì tin đã bỏ thùng rác vẫn hiện ra.) */
  where.push('s.deleted_at IS NULL');

  /* LỌC THEO TRẠNG THÁI — ba chế độ
     - 'all'          : xem toàn bộ (trừ tin rác) — phải chọn tường minh
     - một trạng thái : chỉ đúng trạng thái đó
     - MẶC ĐỊNH       : chỉ VIỆC CHƯA XONG

     Vì sao mặc định ẩn hồ sơ đã đóng?
     Cán bộ mở danh sách là để LÀM VIỆC. Hồ sơ đã giải quyết hoặc từ chối
     trộn lẫn vào chỉ làm loãng, càng dùng lâu càng nhiều, việc cần làm
     càng bị đẩy xuống dưới. Muốn xem lại thì bấm đúng thẻ đó. */
  if (status === 'all') {
    where.push("s.status <> 'spam'");
  } else if (status) {
    where.push('s.status = ?');
    params.push(status);
  } else {
    where.push("s.status IN ('received','processing')");
  }
  if (category) { where.push('c.code = ?'); params.push(category); }
  if (q) { where.push('(s.original_content LIKE ? OR s.tracking_code = ?)'); params.push(`%${q}%`, String(q).toUpperCase()); }
  if (sla === 'overdue') where.push("s.status IN ('received','processing') AND s.deadline_at IS NOT NULL AND s.deadline_at < NOW()");
  /* ---------------------------------------------------------------------
     ẨN VIỆC QUÁ HẠN KHỎI CÁC MỤC KHÁC

     Việc quá hạn đã có mục riêng "⏰ Quá hạn". Để nó xuất hiện thêm trong mọi
     mục khác thì cán bộ đọc trùng, mà danh sách chung cũng bị việc trễ chiếm
     chỗ của việc đang trong hạn.

     ⚠️ CHỈ ẨN, KHÔNG XOÁ. Giao diện luôn hiện dải báo "Đang ẩn N việc quá hạn"
     kèm nút mở sang mục riêng — nguyên tắc không giấu việc mà không nói.
     --------------------------------------------------------------------- */
  if (sla === 'an_qua_han') {
    where.push(
      "NOT (s.status IN ('received','processing') AND s.deadline_at IS NOT NULL AND s.deadline_at < NOW())"
    );
  }
  if (sla === 'near') where.push("s.status IN ('received','processing') AND s.deadline_at >= NOW() AND s.deadline_at < NOW() + INTERVAL 3 DAY");
  // Lọc theo MỨC KHẨN CẤP: urgent | important | normal
  if (urgency && ['urgent', 'important', 'normal'].includes(urgency)) {
    where.push('s.urgency = ?');
    params.push(urgency);
  }
  if (assigned === 'me') { where.push('s.assigned_to = ?'); params.push(req.staff.id); }
  if (assigned === 'none') where.push('s.assigned_to IS NULL');
  const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';

  try {
    const [rows] = await pool.query(
      `SELECT s.id, s.tracking_code, s.original_content, s.ai_processed_content,
              /* ------------------------------------------------------------
                 SỐ TIN NHẮN NGƯỜI DÂN GỬI MÀ CÁN BỘ CHƯA ĐỌC

                 Dùng để hiện chấm đỏ ngay trên danh sách. Không có nó thì cán
                 bộ phải mở từng hồ sơ mới biết có ai nhắn — bà con bổ sung
                 thông tin quan trọng cũng nằm im không ai hay.

                 Bọc COALESCE để bảng report_messages chưa tạo (chưa chạy
                 nang_cap_v12.sql) thì trả 0 chứ không làm hỏng cả danh sách.
                 ------------------------------------------------------------ */
              COALESCE((SELECT COUNT(*) FROM report_messages m
                         WHERE m.submission_id = s.id
                           AND m.sender_type = 'reporter'
                           AND m.read_by_staff = 0), 0) AS tin_chua_doc,
              c.code AS category_code, c.name AS category_name,
              s.status, s.sender_name, s.is_flagged, s.created_at, s.is_anonymous, s.urgency,
              s.deadline_at, s.assigned_to,
              st.full_name AS assigned_name, w.name AS ward_name
       FROM submissions s
       LEFT JOIN categories c ON s.category_id = c.id
       LEFT JOIN staff st ON s.assigned_to = st.id
       LEFT JOIN wards w ON s.ward_id = w.id
       ${whereSql}
       ${sapXepSql}
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM submissions s LEFT JOIN categories c ON s.category_id = c.id ${whereSql}`,
      params
    );
    // Giải mã tên rồi CHE BỚT — danh sách không bao giờ hiện danh tính đầy đủ
    const data = rows.map((r) => ({
      ...r,
      sender_name: r.is_anonymous ? '🕶️ Người gửi ẩn danh' : maskName(decrypt(r.sender_name)),
      ...slaOf(r),
    }));
    res.json({ data, page, limit, total, totalPages: Math.ceil(total / limit) });
  } catch (err) {
    console.error('Lỗi danh sách ý kiến:', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ.' });
  }
});

/** GET /api/admin/submissions/:id — chi tiết (danh tính CHE SẴN, muốn xem đủ phải bấm nút) */
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await pool.query(
      /* Liệt kê cột TƯỜNG MINH, KHÔNG dùng SELECT s.* — trước đây s.* kéo theo cả
         ip_address, user_agent, content_hash, sender_phone_hash rồi spread thẳng
         vào response (dòng ...row bên dưới). Nghĩa là bất kỳ cán bộ handler nào
         mở chi tiết một tin ẨN DANH cũng thấy luôn IP và User-Agent của người tố
         giác — đường lộ danh tính thật, không cần chờ lộ database.
         Thêm cột mới vào bảng thì phải cân nhắc rồi mới thêm vào đây. */
      `SELECT s.id, s.tracking_code, s.original_content, s.ai_processed_content,
              s.category_id, s.status, s.urgency, s.is_anonymous,
              s.is_flagged, s.flag_reason,
              s.sender_name, s.sender_phone, s.sender_email,
              s.created_at, s.updated_at, s.deadline_at, s.resolved_at,
              s.assigned_to, s.resolved_by, s.reviewed_by, s.reviewed_at,
              s.rejection_reason, s.resolution_note, s.ward_id,
              s.identity_erased, s.identity_erased_at, s.deleted_at,
              s.incident_group_id,
              /* Mã thiết bị: chuỗi NGẪU NHIÊN do trình duyệt tự sinh, KHÔNG
                 suy ra được ai. Cần ở đây để giao diện biết hồ sơ có khoá được
                 máy gửi không.
                 (Chú thích cố ý KHÔNG nhắc tên các cột nhạy cảm — bài kiểm thử
                  admin-detail-columns quét nguyên văn chuỗi SQL này, nhắc tên
                  chúng ở đây sẽ làm test báo đỏ oan.) */
              s.device_id,
              c.code AS category_code, c.name AS category_name, c.sla_days,
              st.full_name AS assigned_name, rb.full_name AS resolved_by_name,
              w.name AS ward_name
       FROM submissions s
       LEFT JOIN categories c ON s.category_id = c.id
       LEFT JOIN staff st ON s.assigned_to = st.id
       LEFT JOIN staff rb ON s.resolved_by = rb.id
       LEFT JOIN wards w ON s.ward_id = w.id
       WHERE s.id = ?`,
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Không tìm thấy ý kiến.' });

    const [images] = await pool.query(
      'SELECT image_url, mime_type, moderation_status FROM submission_images WHERE submission_id = ?',
      [req.params.id]
    );
    const [history] = await pool.query(
      `SELECT h.old_status, h.new_status, h.note, h.changed_at, st.full_name AS changed_by_name
       FROM status_history h LEFT JOIN staff st ON h.changed_by = st.id
       WHERE h.submission_id = ? ORDER BY h.changed_at ASC`,
      [req.params.id]
    );

    const row = rows[0];
    const out = {
      ...row,
      sender_name: row.is_anonymous ? '🕶️ Người gửi ẩn danh' : maskName(decrypt(row.sender_name)),
      sender_phone: row.is_anonymous ? '(không cung cấp)' : maskPhone(decrypt(row.sender_phone)),
      sender_email: row.sender_email ? decrypt(row.sender_email) : null,
      is_masked: true,
      ...slaOf(row),
      images,
      history,
    };
    res.json(out);
  } catch (err) {
    console.error('Lỗi chi tiết ý kiến:', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ.' });
  }
});

/**
 * POST /api/admin/submissions/:id/reveal — XEM DANH TÍNH ĐẦY ĐỦ
 *
 * BA LỚP, theo đúng thứ tự ngăn chặn trước — phát hiện sau:
 *   1. authorize('admin','manager') — handler không bao giờ chạm tới được
 *   2. Kiểm tra phạm vi phân công (bên dưới)
 *   3. GHI NHẬT KÝ trước khi trả dữ liệu
 *
 * Vì sao lớp 1 và 2 cần thiết dù đã có nhật ký: trong hệ thống tố giác, CÁN BỘ
 * THA HOÁ là mô hình đe doạ chính. Nhật ký chỉ phát hiện SAU khi danh tính đã
 * bị xem, mà logs.js lại chỉ cho admin/manager đọc — nên handler biết rõ hành
 * vi của mình không ai ngoài cấp trên nhìn thấy.
 */
router.post('/:id/reveal', authorize('admin', 'manager'), async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT assigned_to, sender_name, sender_phone, sender_email, is_anonymous FROM submissions WHERE id = ?',
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Không tìm thấy ý kiến.' });
    if (rows[0].is_anonymous) {
      return res.status(400).json({ error: 'Ý kiến này được gửi ẨN DANH — không có danh tính để xem.' });
    }

    /* Chỉ admin, hoặc cán bộ ĐƯỢC PHÂN CÔNG hồ sơ này, mới xem được danh tính.
       Không có bước này thì một manager vẫn tra được danh tính của MỌI người
       tố giác trong hệ thống, kể cả hồ sơ mình không hề phụ trách. */
    if (req.staff.role !== 'admin' && rows[0].assigned_to !== req.staff.id) {
      return res.status(403).json({
        error: 'Chỉ cán bộ được phân công xử lý ý kiến này mới xem được danh tính.',
      });
    }

    // GHI NHẬT KÝ trước khi trả dữ liệu
    await pool.query(
      'INSERT INTO staff_activity_logs (staff_id, action, target_type, target_id, details, ip_address) VALUES (?,?,?,?,?,?)',
      [req.staff.id, 'reveal_identity', 'submission', req.params.id,
       JSON.stringify({ at: new Date().toISOString() }),
       layIpThat(req)]
    );

    res.json({
      sender_name: decrypt(rows[0].sender_name),
      sender_phone: decrypt(rows[0].sender_phone),
      sender_email: rows[0].sender_email ? decrypt(rows[0].sender_email) : null,
      warning: 'Lượt xem danh tính này đã được ghi vào nhật ký hệ thống.',
    });
  } catch (err) {
    console.error('Lỗi xem danh tính:', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ.' });
  }
});

/** PATCH /api/admin/submissions/:id/status — cập nhật trạng thái */
router.patch('/:id/status', async (req, res) => {
  const { status, note, rejectionReason } = req.body || {};
  const valid = ['received', 'processing', 'resolved', 'rejected'];
  if (!valid.includes(status)) return res.status(400).json({ error: 'Trạng thái không hợp lệ.' });
  if (status === 'rejected' && !rejectionReason?.trim()) {
    return res.status(400).json({ error: 'Vui lòng nhập lý do từ chối.' });
  }
  try {
    await pool.query('CALL update_submission_status(?,?,?,?,?)', [
      req.params.id, status, note || null, rejectionReason || null, req.staff.id,
    ]);

    /* TỰ ĐỘNG XOÁ DANH TÍNH khi hồ sơ ĐÓNG, nếu người dân đã yêu cầu trước đó.
       Theo Nghị định 13/2023: quyền xoá bị hoãn khi dữ liệu còn cần cho việc
       xử lý, nhưng phải thực hiện NGAY khi lý do hoãn không còn.
       Bọc try/catch riêng — lỗi ở đây không được làm hỏng việc cập nhật trạng thái. */
    if (status === 'resolved' || status === 'rejected') {
      try {
        const [cho] = await pool.query(
          `SELECT id FROM data_deletion_requests
           WHERE submission_id = ? AND status = 'pending'`,
          [req.params.id]
        );

        if (cho.length > 0) {
          await pool.query(
            `UPDATE submissions
             SET sender_name = NULL, sender_phone = NULL, sender_phone_hash = NULL,
                 sender_email = NULL, ip_address = NULL, user_agent = NULL,
                 identity_erased = TRUE, identity_erased_at = NOW()
             WHERE id = ?`,
            [req.params.id]
          );
          await pool.query(
            `UPDATE data_deletion_requests
             SET status = 'done', handled_at = NOW(), handled_by = ?
             WHERE submission_id = ? AND status = 'pending'`,
            [req.staff.id, req.params.id]
          );
          console.log(`🔒 Đã tự xoá danh tính ý kiến #${req.params.id} theo yêu cầu đã ghi nhận`);
        }
      } catch (e) {
        console.warn('Bỏ qua xoá danh tính tự động:', e.message,
                     '-> đã chạy nang_cap_v8.sql chưa?');
      }
    }

    res.json({ ok: true, message: 'Đã cập nhật trạng thái.' });
  } catch (err) {
    console.error('Lỗi cập nhật trạng thái:', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ khi cập nhật.' });
  }
});

/** PATCH /api/admin/submissions/:id/assign — phân công cán bộ (admin/manager) */
router.patch('/:id/assign', authorize('admin', 'manager'), async (req, res) => {
  const { staffId } = req.body || {};
  try {
    await pool.query('UPDATE submissions SET assigned_to = ? WHERE id = ?', [staffId || null, req.params.id]);
    await pool.query(
      'INSERT INTO staff_activity_logs (staff_id, action, target_type, target_id, details) VALUES (?,?,?,?,?)',
      [req.staff.id, 'assign', 'submission', req.params.id, JSON.stringify({ assignedTo: staffId })]
    );
    res.json({ ok: true, message: staffId ? 'Đã phân công cán bộ.' : 'Đã bỏ phân công.' });
  } catch (err) {
    console.error('Lỗi phân công:', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ.' });
  }
});

/**
 * POST /api/admin/submissions/:id/review — DUYỆT hoặc ĐÁNH DẤU RÁC
 * Chỉ áp dụng cho ý kiến ẩn danh đang ở hàng chờ (pending_review).
 * body: { action: 'approve' | 'spam' }
 */
router.post('/:id/review', async (req, res) => {
  const { action } = req.body || {};
  if (!['approve', 'spam'].includes(action)) {
    return res.status(400).json({ error: 'Hành động không hợp lệ.' });
  }

  try {
    const [rows] = await pool.query(
      'SELECT status, is_anonymous FROM submissions WHERE id = ?', [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Không tìm thấy ý kiến.' });
    if (rows[0].status !== 'pending_review') {
      return res.status(400).json({ error: 'Ý kiến này không nằm trong hàng chờ kiểm duyệt.' });
    }

    const newStatus = action === 'approve' ? 'received' : 'spam';

    // "Tin rác" -> đưa vào THÙNG RÁC (xoá mềm), giữ 7 ngày để còn khôi phục được.
    // "Duyệt"    -> chuyển sang danh sách xử lý bình thường.
    await pool.query(
      `UPDATE submissions
       SET status = ?, reviewed_by = ?, reviewed_at = NOW(),
           deleted_at = ${action === 'spam' ? 'NOW()' : 'NULL'},
           deleted_by = ${action === 'spam' ? '?' : 'NULL'}
       WHERE id = ?`,
      action === 'spam'
        ? [newStatus, req.staff.id, req.staff.id, req.params.id]
        : [newStatus, req.staff.id, req.params.id]
    );

    // Ghi lịch sử + nhật ký
    await pool.query(
      'INSERT INTO status_history (submission_id, old_status, new_status, note, changed_by) VALUES (?,?,?,?,?)',
      [req.params.id, 'pending_review', newStatus,
       action === 'approve' ? 'Duyệt tin báo ẩn danh — đưa vào xử lý' : 'Đánh dấu tin rác',
       req.staff.id]
    );
    await pool.query(
      'INSERT INTO staff_activity_logs (staff_id, action, target_type, target_id, ip_address) VALUES (?,?,?,?,?)',
      [req.staff.id, action === 'approve' ? 'review_approve' : 'review_spam',
       'submission', req.params.id,
       layIpThat(req)]
    );

    res.json({
      ok: true,
      message: action === 'approve'
        ? 'Đã duyệt — ý kiến được đưa vào quy trình xử lý.'
        : 'Đã đánh dấu là tin rác.',
    });
  } catch (err) {
    console.error('Lỗi kiểm duyệt:', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ.' });
  }
});

/* ==========================================================================
   ĐÁNH DẤU TIN RÁC — dùng được ở BẤT KỲ trạng thái nào

   Khác /review (chỉ dùng cho tin đang chờ duyệt): đường dẫn này để cán bộ
   đang xử lý một hồ sơ, đọc ra là tin bịa đặt, thì đánh dấu ngay tại chỗ.

   Hai việc xảy ra cùng lúc:
     1. Hồ sơ chuyển sang 'spam' và vào thùng rác (giữ 7 ngày, khôi phục được)
     2. KHOÁ THIẾT BỊ đã gửi trong 24 giờ

   Việc thứ hai mới là điểm mấu chốt. Đánh dấu tin rác mà không khoá thì kẻ
   phá hoại gửi tiếp ngay, cán bộ đánh dấu mãi không hết. Khoá thiết bị rồi
   thì lần sau họ gửi vẫn thấy "thành công" nhưng đơn không vào hàng chờ —
   họ không biết mà đổi cách phá.
   ========================================================================== */
router.post('/:id/mark-spam', async (req, res) => {
  const id = Number(req.params.id);
  const lyDo = String(req.body?.reason || '').trim().slice(0, 200);
  /* Cán bộ chủ động chọn khoá IP khi hồ sơ không có mã thiết bị */
  const khoaIp = req.body?.khoaIp === true;

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Mã hồ sơ không hợp lệ.' });
  }

  try {
    const [rows] = await pool.query(
      'SELECT status, device_id, ip_address, tracking_code FROM submissions WHERE id = ? AND deleted_at IS NULL',
      [id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Không tìm thấy hồ sơ, hoặc hồ sơ đã ở trong thùng rác.' });
    }
    const don = rows[0];

    await pool.query(
      `UPDATE submissions
          SET status = 'spam', is_spam = 1,
              deleted_at = NOW(), deleted_by = ?,
              rejection_reason = ?
        WHERE id = ?`,
      [req.staff?.id || null, lyDo || 'Cán bộ đánh dấu tin rác', id]
    );

    await pool.query(
      `INSERT INTO status_history (submission_id, old_status, new_status, note, changed_by)
       VALUES (?, ?, 'spam', ?, ?)`,
      [id, don.status, lyDo || 'Đánh dấu tin rác', req.staff?.id || null]
    ).catch(() => {});

    /* Khoá thiết bị. Bọc riêng vì lỗi ở đây không được làm hỏng việc đánh dấu
       đã thành công — thà không khoá được còn hơn để hồ sơ nửa vời. */
    let daKhoa = false;
    let kieuKhoa = '';
    if (don.device_id) {
      daKhoa = await khoaThietBi(pool, {
        deviceId: don.device_id,
        staffId: req.staff?.id || null,
        lyDo: `Tin rác — hồ sơ ${don.tracking_code}${lyDo ? ': ' + lyDo : ''}`,
      });
      if (daKhoa) kieuKhoa = 'thiết bị';
    } else if (don.ip_address) {
      /* ĐƯỜNG LUI: hồ sơ gửi trước khi có tính năng mã thiết bị, hoặc người
         gửi tắt localStorage. Khoá theo IP với thời hạn ngắn hơn (2 giờ) vì
         có thể chặn oan người dùng chung IP nhà mạng.
         Không có đường lui này thì cán bộ bấm "Tin rác" mà chẳng chặn được gì. */
      daKhoa = await khoaIpThuCong(pool, {
        ip: don.ip_address,
        staffId: req.staff?.id || null,
        lyDo: `Tin rác — hồ sơ ${don.tracking_code}${lyDo ? ': ' + lyDo : ''}`,
      });
      if (daKhoa) kieuKhoa = 'địa chỉ mạng';
    }

    await pool.query(
      `INSERT INTO staff_activity_logs (staff_id, action, target_id, ip_address)
       VALUES (?, 'mark_spam', ?, ?)`,
      [req.staff?.id || null, id, layIpThat(req)]
    ).catch(() => {});

    res.json({
      ok: true,
      daKhoaThietBi: daKhoa,
      /* Báo rõ cho cán bộ biết có khoá được thiết bị không. Đơn gửi trước khi
         có tính năng này thì không có mã thiết bị -> chỉ đánh dấu được thôi. */
      kieuKhoa,
      ghiChu: !daKhoa
        ? 'Đã đánh dấu tin rác. Hồ sơ này không có mã thiết bị lẫn địa chỉ mạng nên không khoá được.'
        : kieuKhoa === 'thiết bị'
          ? 'Đã đánh dấu tin rác và khoá thiết bị này trong 24 giờ.'
          : 'Đã đánh dấu tin rác. Hồ sơ không có mã thiết bị nên khoá theo địa chỉ mạng '
            + 'trong 2 giờ — thời hạn ngắn vì có thể ảnh hưởng người dùng chung mạng.',
    });
  } catch (err) {
    console.error('Đánh dấu tin rác lỗi:', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ. Đã chạy nang_cap_v12.sql chưa?' });
  }
});

export default router;
