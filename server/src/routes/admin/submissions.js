/** API quản lý ý kiến cho cán bộ (yêu cầu đăng nhập) */
import { Router } from 'express';
import { layIpThat, ghiNhatKy } from '../../lib/helpers.js';
import { khoaThietBi, khoaIpThuCong, xetKhoaTaiPham, donDonCungThietBi } from '../../lib/chan-spam.js';
import { pool } from '../../db.js';
import { requireAuth } from '../../middleware/auth.js';
import { authorize } from '../../middleware/authorize.js';
import { decrypt, maskPhone, maskName } from '../../lib/crypto.js';

const router = Router();
router.use(requireAuth);

/* Cột security_level chỉ có sau khi chạy nang_cap_v14.sql. Kiểm tra MỘT lần rồi
   nhớ kết quả, để truy vấn danh sách/chi tiết không sập nếu database chưa nâng
   cấp — cột chưa có thì coi mọi tin là 'thuong'. Thà thiếu tính năng phân loại
   còn hơn cả danh sách ý kiến trắng trơn vì thiếu một cột. */
let _coCotMat = null;
async function coCotCapDoMat() {
  if (_coCotMat !== null) return _coCotMat;
  try {
    const [r] = await pool.query(
      `SELECT 1 FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = 'submissions'
          AND column_name = 'security_level' LIMIT 1`
    );
    _coCotMat = r.length > 0;
  } catch {
    _coCotMat = false;
  }
  return _coCotMat;
}

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
  };
  /* ⚠️ PHẢI dùng Object.hasOwn, KHÔNG tra thẳng CACH_SAP_XEP[khoa].

     Tra thẳng thì mọi khoá kế thừa từ prototype đều "có thật": gọi
     ?sort=constructor trả về hàm Object, ?sort=toString trả về một hàm khác —
     đều là giá trị truthy nên lọt qua phép `||` bên dưới, rồi bị nhét nguyên
     văn vào chuỗi SQL ở chỗ ${sapXepSql}. Kết quả là câu lệnh hỏng và máy chủ
     trả 500 cho một tham số mà ai gõ vào thanh địa chỉ cũng tạo được.

     Bảng sắp xếp vẫn CỐ ĐỊNH, không ghép chuỗi từ dữ liệu người dùng — chỗ này
     chỉ bịt nốt đường vòng qua prototype. */
  const khoaSapXep = String(req.query.sort || '');
  const sapXepSql = Object.hasOwn(CACH_SAP_XEP, khoaSapXep)
    ? CACH_SAP_XEP[khoaSapXep]
    : CACH_SAP_XEP.mac_dinh;
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(50, Math.max(5, Number(req.query.limit) || 20));
  const offset = (page - 1) * limit;

  const where = [];
  const params = [];
  /* LUÔN ẩn tin trong thùng rác, dù lọc theo trạng thái nào.
     (Trước đây dòng này nằm nhầm trong khối else -> lọc theo trạng thái
      thì tin đã bỏ thùng rác vẫn hiện ra.) */
  where.push('s.deleted_at IS NULL');

  /* ẨN TIN ĐÃ ĐÁNH DẤU RÁC — phải giống hệt điều kiện của trang tổng quan.

     ⚠️ VÌ SAO QUAN TRỌNG: các thẻ trên trang tổng quan (Việc khẩn cấp, Đã quá
     hạn, Sắp hết hạn, Chưa phân công) đếm với điều kiện
     (is_spam IS NULL OR is_spam = 0). Nếu danh sách này KHÔNG lọc như vậy thì
     bấm vào thẻ sẽ ra số khác với số trên thẻ — cán bộ thấy "20 việc quá hạn"
     rồi bấm vào lại đếm ra số khác, tưởng hệ thống sai.

     Hai nơi phải dùng CÙNG một điều kiện. Sửa một nơi thì phải sửa nơi kia:
     xem server/src/routes/admin/dashboard.js.

     Dùng IS NULL OR = 0 chứ không dùng != 1, vì cột có thể NULL với dữ liệu cũ
     và trong SQL thì NULL != 1 cho kết quả NULL (coi như sai) -> lọc mất tin.

     ⚠️ KHÔNG GIẤU VIỆC MÀ KHÔNG NÓI: tin bị đánh dấu rác TỰ ĐỘNG vẫn giữ trạng
     thái bình thường (để người gửi không biết mình bị chặn), nên trước đây
     chúng lẫn trong danh sách. Nay ẩn đi thì phải có lối xem lại, nếu không
     cán bộ mất hẳn khả năng soát xem hệ thống có chặn oan ai không.
     Lối xem lại: gọi kèm ?nghiRac=1 */
  const xemNghiRac = String(req.query.nghiRac || '') === '1';
  if (xemNghiRac) {
    where.push('s.is_spam = 1');
  } else {
    where.push('(s.is_spam IS NULL OR s.is_spam = 0)');
  }

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
  } else if (!xemNghiRac) {
    /* Khi đang xem tin NGHI RÁC thì KHÔNG áp lọc "việc chưa xong" mặc định.
       Tin bị đánh dấu rác thủ công có trạng thái 'spam', tin bị đánh dấu tự
       động thì giữ trạng thái bình thường. Áp lọc mặc định vào đây sẽ giấu mất
       nhóm thủ công, khiến cán bộ soát không đủ. */
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
  /* ---------------------------------------------------------------------
     LỌC THEO CÁN BỘ PHỤ TRÁCH — ba dạng giá trị

       'me'   : việc của chính người đang đăng nhập
       'none' : chưa phân công cho ai
       số      : mã cán bộ cụ thể (ô chọn tên cán bộ trên danh sách)

     ⚠️ Dạng SỐ phải kiểm tra bằng biểu thức chính quy rồi mới ép kiểu. Đẩy
     thẳng req.query vào tham số truy vấn thì mysql2 vẫn thoát chuỗi an toàn,
     nhưng một chuỗi rác lọt vào sẽ so sánh với cột số và MySQL âm thầm ép
     kiểu -> trả về danh sách sai chứ không báo lỗi. Chặn ngay ở đây rõ hơn.

     Dùng else if: ba dạng loại trừ nhau, để rời từng câu if thì một giá trị
     lạ có thể rơi vào nhiều nhánh cùng lúc.
     --------------------------------------------------------------------- */
  const canBo = String(assigned ?? '').trim();
  if (canBo === 'me') {
    where.push('s.assigned_to = ?');
    params.push(req.staff.id);
  } else if (canBo === 'none') {
    where.push('s.assigned_to IS NULL');
  } else if (/^[0-9]{1,10}$/.test(canBo)) {
    where.push('s.assigned_to = ?');
    params.push(Number(canBo));
  }
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
              ${(await coCotCapDoMat()) ? 's.security_level,' : "'thuong' AS security_level,"}
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
              s.category_id, s.status, s.urgency, ${(await coCotCapDoMat()) ? 's.security_level,' : "'thuong' AS security_level,"} s.is_anonymous,
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

/** PATCH /api/admin/submissions/:id/security-level — đặt cấp độ bảo mật (admin/manager)
 *
 * Ba mức: thuong / can_bao_ve / mat. Chỉ lãnh đạo được đổi, vì đây là quyết
 * định nghiệp vụ ảnh hưởng tới việc ai được xem tin. Ghi nhật ký đầy đủ. */
router.patch('/:id/security-level', authorize('admin', 'manager'), async (req, res) => {
  const { level } = req.body || {};
  const hopLe = ['thuong', 'can_bao_ve', 'mat'];
  if (!hopLe.includes(level)) return res.status(400).json({ error: 'Cấp độ không hợp lệ.' });
  try {
    const [kq] = await pool.query(
      'UPDATE submissions SET security_level = ? WHERE id = ?',
      [level, req.params.id]
    );
    if (!kq.affectedRows) return res.status(404).json({ error: 'Không tìm thấy ý kiến.' });
    await ghiNhatKy(pool, req, {
      hanhDong: 'set_security_level',
      loaiDoiTuong: 'submission',
      doiTuongId: req.params.id,
      chiTiet: { level },
    });
    res.json({ ok: true, message: 'Đã cập nhật cấp độ bảo mật.' });
  } catch (err) {
    /* Cột chưa có (chưa chạy nang_cap_v14.sql) -> báo rõ để biết đường sửa. */
    console.error('Lỗi đặt cấp độ mật:', err.message);
    res.status(500).json({ error: 'Không đổi được. Đã chạy nang_cap_v14.sql chưa?' });
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
      'SELECT status, is_anonymous, device_id FROM submissions WHERE id = ?', [req.params.id]
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

    /* ======================================================================
       GHI LỊCH SỬ + NHẬT KÝ — HỎNG THÌ CŨNG KHÔNG ĐƯỢC LÀM HỎNG VIỆC CHÍNH

       ⚠️ Trước đây hai lệnh INSERT này nằm thẳng trong khối try chung. Lệnh
       UPDATE ở trên đã chạy xong và KHÔNG nằm trong giao dịch, nên chỉ cần
       một lệnh ghi nhật ký ném lỗi là cán bộ thấy "lỗi máy chủ" trong khi ý
       kiến đã đổi trạng thái thật. Bấm lại thì gặp "không nằm trong hàng chờ".
       Không biết tin màn hình hay tin dữ liệu.

       Lỗi thật đã gặp: bảng status_history khai ENUM thiếu 'pending_review'
       và 'spam' (xem database/va_loi_duyet_tin_an_danh.sql). MySQL chế độ
       nghiêm ngặt báo 1265 chứ không âm thầm bỏ qua.

       Nay bọc riêng: ghi được thì tốt, không ghi được thì log ra máy chủ cho
       quản trị viên biết mà vá, còn cán bộ vẫn nhận đúng kết quả. Mất một
       dòng lịch sử nhẹ hơn nhiều so với việc cán bộ mất lòng tin vào cả màn
       hình kiểm duyệt.
       ====================================================================== */
    try {
      await pool.query(
        'INSERT INTO status_history (submission_id, old_status, new_status, note, changed_by) VALUES (?,?,?,?,?)',
        [req.params.id, 'pending_review', newStatus,
         action === 'approve' ? 'Duyệt tin báo ẩn danh — đưa vào xử lý' : 'Đánh dấu tin rác',
         req.staff.id]
      );
    } catch (e) {
      console.error('[review] KHÔNG ghi được status_history:', e.message,
        '— kiểm tra ENUM old_status/new_status đã có pending_review và spam chưa');
    }

    try {
      await pool.query(
        'INSERT INTO staff_activity_logs (staff_id, action, target_type, target_id, ip_address) VALUES (?,?,?,?,?)',
        [req.staff.id, action === 'approve' ? 'review_approve' : 'review_spam',
         'submission', req.params.id,
         layIpThat(req)]
      );
    } catch (e) {
      console.error('[review] KHÔNG ghi được staff_activity_logs:', e.message);
    }

    /* ======================================================================
       ĐÁNH DẤU TIN RÁC Ở HÀNG CHỜ CŨNG PHẢI DỌN VÀ KHOÁ

       Trước đây chỉ đường /:id/spam mới dọn và khoá, còn nút "Đánh dấu tin
       rác" ngay tại màn hình kiểm duyệt thì chỉ đổi trạng thái một đơn. Hai
       nút mang cùng một cái tên mà làm hai việc khác nhau — cán bộ dùng nút ở
       hàng chờ (nút hay dùng nhất) lại là nút yếu nhất.
       ====================================================================== */
    let soDonDaDon = 0;
    let taiPham = false;
    if (action === 'spam' && rows[0].device_id) {
      soDonDaDon = await donDonCungThietBi(pool, {
        deviceId: rows[0].device_id,
        boQuaId: req.params.id,
        staffId: req.staff.id,
        lyDo: 'Dọn theo lô cùng thiết bị với một tin bị đánh dấu rác ở hàng chờ',
      });
      await khoaThietBi(pool, {
        deviceId: rows[0].device_id,
        staffId: req.staff.id,
        lyDo: 'Tin rác — đánh dấu tại hàng chờ kiểm duyệt',
      });
      const kq = await xetKhoaTaiPham(pool, {
        deviceId: rows[0].device_id,
        staffId: req.staff.id,
      });
      taiPham = kq.taiPham;
    }

    res.json({
      ok: true,
      taiPham,
      soDonDaDon,
      message: (action === 'approve'
        ? 'Đã duyệt — ý kiến được đưa vào quy trình xử lý.'
        : taiPham
          ? 'Đã đánh dấu là tin rác. Thiết bị bị đánh dấu 3 lần liên tiếp nên khoá 30 ngày.'
          : 'Đã đánh dấu là tin rác.')
        + (soDonDaDon > 0
            ? ` Đã đưa thêm ${soDonDaDon} tin cùng thiết bị (gửi trong 24 giờ trước) vào Thùng rác.`
            : ''),
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
    let soDonDaDon = 0;
    let taiPham = false;
    if (don.device_id) {
      /* Dọn cả loạt đơn cùng thiết bị trong 24 giờ trước — kẻ rải tin rác
         hiếm khi gửi đúng một đơn. Chỉ đưa vào thùng rác (giữ 7 ngày) và
         không đụng đơn cán bộ đã xử lý; xem chú thích trong chan-spam.js. */
      soDonDaDon = await donDonCungThietBi(pool, {
        deviceId: don.device_id,
        boQuaId: id,
        staffId: req.staff?.id || null,
        lyDo: `Dọn theo lô cùng thiết bị với hồ sơ ${don.tracking_code}`,
      });

      daKhoa = await khoaThietBi(pool, {
        deviceId: don.device_id,
        staffId: req.staff?.id || null,
        lyDo: `Tin rác — hồ sơ ${don.tracking_code}${lyDo ? ': ' + lyDo : ''}`,
      });
      if (daKhoa) kieuKhoa = 'thiết bị';

      /* Xét tái phạm SAU khi đã khoá 24 giờ: ba lần liên tiếp trong 30 ngày
         thì nâng lên khoá 30 ngày (ghi đè bản ghi vừa tạo). */
      const kqTaiPham = await xetKhoaTaiPham(pool, {
        deviceId: don.device_id,
        staffId: req.staff?.id || null,
      });
      taiPham = kqTaiPham.taiPham;
      if (taiPham) { daKhoa = true; kieuKhoa = 'thiết bị'; }
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
      taiPham,
      soDonDaDon,
      /* Nói rõ ĐÃ DỌN BAO NHIÊU ĐƠN. Quét theo lô mà im lặng là kiểu giấu
         việc: cán bộ bấm một nút, năm hồ sơ biến mất khỏi hàng chờ, không ai
         hiểu vì sao. Nói ra thì cán bộ còn biết đường vào Thùng rác kiểm lại
         nếu thấy con số lạ. */
      ghiChu: (!daKhoa
        ? 'Đã đánh dấu tin rác. Hồ sơ này không có mã thiết bị lẫn địa chỉ mạng nên không khoá được.'
        : kieuKhoa === 'thiết bị'
          ? (taiPham
              ? 'Đã đánh dấu tin rác. Thiết bị này bị đánh dấu 3 lần liên tiếp nên khoá 30 ngày.'
              : 'Đã đánh dấu tin rác và khoá thiết bị này trong 24 giờ.')
          : 'Đã đánh dấu tin rác. Hồ sơ không có mã thiết bị nên khoá theo địa chỉ mạng '
            + 'trong 2 giờ — thời hạn ngắn vì có thể ảnh hưởng người dùng chung mạng.')
        + (soDonDaDon > 0
            ? ` Đã đưa thêm ${soDonDaDon} hồ sơ cùng thiết bị (gửi trong 24 giờ trước) vào Thùng rác — khôi phục được trong 7 ngày.`
            : ''),
    });
  } catch (err) {
    console.error('Đánh dấu tin rác lỗi:', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ. Đã chạy nang_cap_v12.sql chưa?' });
  }
});

export default router;
