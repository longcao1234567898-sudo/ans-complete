/** API quản lý ý kiến cho cán bộ (yêu cầu đăng nhập) */
import { Router } from 'express';
import { layIpThat, ghiNhatKy, ghiNhatKyTruoc } from '../../lib/helpers.js';
import {
  khoaThietBi, xetKhoaTaiPham,
  xetDonGayKhoa, laDonAnDanh, GHI_CHU_KHONG_TINH_TAI_PHAM,
} from '../../lib/chan-spam.js';
import { pool } from '../../db.js';
import { requireAuth } from '../../middleware/auth.js';
import { authorize } from '../../middleware/authorize.js';
import { LANH_DAO, laLanhDao } from '../../lib/vai-tro.js';
import { decrypt, maskPhone, maskName } from '../../lib/crypto.js';
import { danhGiaMucKhan } from '../../lib/phan-loai.js';
import {
  dieuKienXem, coSql, nhomXemDuoc, hoSoMangCo, coCotCo,
} from '../../lib/pham-vi-ho-so.js';
import { nhanDienToGiacMat } from '../../lib/to-giac-mat.js';

const router = Router();
router.use(requireAuth);

/* Phạm vi xem (ADR-003 §4): mọi đường đọc/ghi hồ sơ ở tệp này AND với
   dieuKienXem() — xem lib/pham-vi-ho-so.js. Cán bộ không thấy hồ sơ mang cờ
   to_giac_mat hay ngoai_tham_quyen; lãnh đạo thấy hết. */
/* Cột toạ độ vụ việc chỉ có sau khi chạy nang_cap_v16.sql. Kiểm một lần rồi
   nhớ, để trang chi tiết không sập khi database chưa nâng cấp. */
let _coCotToaDoAd = null;
async function coCotToaDoAd() {
  if (_coCotToaDoAd !== null) return _coCotToaDoAd;
  try {
    const [r] = await pool.query(
      `SELECT 1 FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = 'submissions'
          AND column_name = 'incident_lat' LIMIT 1`
    );
    _coCotToaDoAd = r.length > 0;
  } catch {
    _coCotToaDoAd = false;
  }
  return _coCotToaDoAd;
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
  /* PHẠM VI THEO CẤP ĐỘ (BUG-009). Nằm trong `where` chung nên trang dữ liệu,
     total và ô tìm kiếm cùng chỉ thấy hồ sơ được xem — hồ sơ bị ẩn mà vẫn đếm
     vào total khi "khớp" từ khoá là để lộ nó tồn tại. */
  const phamVi = await dieuKienXem(req.staff);
  where.push(phamVi.sql);
  params.push(...phamVi.params);
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
              ${await coSql('s')},
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
    /* Hồ sơ ngoài phạm vi trả 404 y như không tồn tại (BUG-009) */
    const phamVi = await dieuKienXem(req.staff);
    const [rows] = await pool.query(
      /* Liệt kê cột TƯỜNG MINH, KHÔNG dùng SELECT s.* — trước đây s.* kéo theo cả
         ip_address, user_agent, content_hash, sender_phone_hash rồi spread thẳng
         vào response (dòng ...row bên dưới). Nghĩa là bất kỳ cán bộ handler nào
         mở chi tiết một tin ẨN DANH cũng thấy luôn IP và User-Agent của người tố
         giác — đường lộ danh tính thật, không cần chờ lộ database.
         Thêm cột mới vào bảng thì phải cân nhắc rồi mới thêm vào đây. */
      `SELECT s.id, s.tracking_code, s.original_content, s.ai_processed_content,
              s.category_id, s.status, s.urgency, ${await coSql('s')}, s.is_anonymous,
              s.is_flagged, s.flag_reason,
              s.sender_name, s.sender_phone,
              /* Email: CHỈ lấy cờ có/không, KHÔNG lấy cột. Trang chi tiết chỉ
                 cần biết để hiện dòng thư; email đầy đủ chỉ ra qua /reveal (ba
                 lớp + nhật ký). Từng lấy cột rồi giải mã trả nguyên văn cho mọi
                 cán bộ (BUG-010). Không che bằng maskName được: email không có
                 khoảng trắng là MỘT từ, maskName giữ nguyên từ đầu tiên. */
              (s.sender_email IS NOT NULL) AS co_email,
              s.created_at, s.updated_at, s.deadline_at, s.resolved_at,
              s.assigned_to, s.resolved_by, s.reviewed_by, s.reviewed_at,
              s.rejection_reason, s.resolution_note, s.ward_id,
              /* Toạ độ nơi XẢY RA VỤ VIỆC do người dân tự nguyện gửi — thông
                 tin nghiệp vụ để cán bộ tìm đúng hiện trường, KHÔNG phải vị
                 trí người báo. Cột chỉ có sau nang_cap_v16.sql nên phải kiểm. */
              ${(await coCotToaDoAd()) ? 's.incident_lat, s.incident_lng,' : 'NULL AS incident_lat, NULL AS incident_lng,'}
              s.identity_erased, s.identity_erased_at, s.deleted_at,
              s.incident_group_id,
              /* Mã thiết bị: CHỈ lấy cờ có/không, KHÔNG lấy giá trị. Từng mã
                 đơn lẻ là chuỗi ngẫu nhiên, nhưng nó sống mãi trong trình duyệt
                 nên hai hồ sơ cùng mã là hai đơn từ cùng một máy — đơn tố giác
                 ẩn danh nối được với đơn có tên của cùng người gửi (BUG-014).
                 Giao diện chỉ cần biết có khoá được máy không; mark-spam và
                 review tự đọc mã phía máy chủ theo id hồ sơ. Trả băm hay một
                 khúc của mã cũng nối được y hệt — không làm.
                 (Chú thích cố ý KHÔNG nhắc tên các cột nhạy cảm — bài kiểm thử
                  admin-detail-columns quét nguyên văn chuỗi SQL này, nhắc tên
                  chúng ở đây sẽ làm test báo đỏ oan.) */
              (s.device_id IS NOT NULL) AS co_ma_thiet_bi,
              c.code AS category_code, c.name AS category_name, c.sla_days,
              st.full_name AS assigned_name, rb.full_name AS resolved_by_name,
              w.name AS ward_name
       FROM submissions s
       LEFT JOIN categories c ON s.category_id = c.id
       LEFT JOIN staff st ON s.assigned_to = st.id
       LEFT JOIN staff rb ON s.resolved_by = rb.id
       LEFT JOIN wards w ON s.ward_id = w.id
       WHERE s.id = ? AND ${phamVi.sql}`,
      [req.params.id, ...phamVi.params]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Không tìm thấy ý kiến.' });

    /* NHẬT KÝ LƯỢT MỞ (ADR-003 việc 9). Tin chỉ lãnh đạo xem (tố giác mật,
       ngoài thẩm quyền): ghi TRƯỚC, ghi không được thì không mở — một tố giác
       nhắm vào chính một lãnh đạo thì nhật ký là thứ duy nhất cho người khác
       biết ai đã đọc nó (ADR-003, rủi ro đã chấp nhận). Hồ sơ thường: ghi nếu
       được. Gộp lượt mở lại trong 10 phút: giao diện tải lại trang chi tiết mỗi
       lần chuyển tab, ghi hết thì lượt mở thật chìm giữa hàng trăm dòng lặp. */
    const mangCo = Number(rows[0].to_giac_mat) === 1 || Number(rows[0].ngoai_tham_quyen) === 1;
    const luotMo = { loaiDoiTuong: 'submission', doiTuongId: Number(req.params.id), gopPhut: 10 };
    if (mangCo) await ghiNhatKyTruoc(pool, req, { ...luotMo, hanhDong: 'view_flagged_submission' });
    else await ghiNhatKy(pool, req, { ...luotMo, hanhDong: 'view_submission' });

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
      co_email: Boolean(row.co_email),
      co_ma_thiet_bi: Boolean(row.co_ma_thiet_bi),
      /* Chỉ trỏ tới nhóm người xem mở được. Nhóm chứa hồ sơ bị ẩn trả 404 —
         trỏ tới nó là báo "có hồ sơ tương tự bạn không được xem" (BUG-009) */
      incident_group_id: (await nhomXemDuoc(req.staff, row.incident_group_id)) ? row.incident_group_id : null,
      is_masked: true,
      /* Vì sao hệ thống xếp mức khẩn này (ADR-003 việc 10) — tính lại từ nội
         dung bằng bộ từ khoá hiện hành; mức đã lưu thì không đổi */
      muc_khan: danhGiaMucKhan(row.original_content),
      /* Vì sao tin vào phần tố giác mật (ADR-003 việc 12) — chỉ trả khi tin
         mang cờ; cán bộ không bao giờ mở được tin mang cờ nên chỉ lãnh đạo thấy */
      ...(Number(row.to_giac_mat) === 1 ? { to_giac_mat_nhan_dien: nhanDienToGiacMat(row.original_content).lyDo } : {}),
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
 * HAI LỚP, theo đúng thứ tự ngăn chặn trước — phát hiện sau:
 *   1. authorize(...LANH_DAO) — cán bộ (handler) không bao giờ chạm tới được
 *   2. GHI NHẬT KÝ trước khi trả dữ liệu
 *
 * ADR-003 §3: mọi lãnh đạo xem được danh tính mọi tin có danh tính, không cần
 * được giao hồ sơ. Trước đây (ADR-002) danh tính chỉ theo Trưởng và người
 * Trưởng giao — người vận hành đã chọn bỏ, rủi ro ghi ở ADR-003. Vì không còn
 * lớp phân công, nhật ký là thứ duy nhất để lãnh đạo kiểm lẫn nhau: ghi TRƯỚC,
 * ghi không được thì không trả danh tính.
 */
router.post('/:id/reveal', authorize(...LANH_DAO), async (req, res) => {
  try {
    /* Ngoài phạm vi cấp độ thì 404, không 403 — 403 là xác nhận hồ sơ tồn tại
       (BUG-009). Lớp 2 bên dưới vẫn đứng riêng: xem được nội dung chưa có
       nghĩa là được xem danh tính. */
    const phamVi = await dieuKienXem(req.staff, '');
    const [rows] = await pool.query(
      `SELECT assigned_to, sender_name, sender_phone, sender_email, is_anonymous FROM submissions WHERE id = ? AND ${phamVi.sql}`,
      [req.params.id, ...phamVi.params]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Không tìm thấy ý kiến.' });
    if (rows[0].is_anonymous) {
      return res.status(400).json({ error: 'Ý kiến này được gửi ẨN DANH — không có danh tính để xem.' });
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
    /* Không xem được thì không sửa được (BUG-009). Thủ tục CALL không nhận
       điều kiện phạm vi nên kiểm bằng một câu riêng ngay trước — đánh đổi ghi
       ở SEC-DEC-009. */
    const phamVi = await dieuKienXem(req.staff, '');
    const [thay] = await pool.query(
      `SELECT id, status FROM submissions WHERE id = ? AND ${phamVi.sql}`,
      [req.params.id, ...phamVi.params]
    );
    if (thay.length === 0) return res.status(404).json({ error: 'Không tìm thấy ý kiến.' });

    await pool.query('CALL update_submission_status(?,?,?,?,?)', [
      req.params.id, status, note || null, rejectionReason || null, req.staff.id,
    ]);
    /* status_history đã có người đổi, nhưng lãnh đạo đọc nhật ký ở MỘT chỗ —
       không phải mở từng hồ sơ để biết hôm nay ai đóng những gì */
    await ghiNhatKy(pool, req, {
      hanhDong: 'update_status', loaiDoiTuong: 'submission', doiTuongId: Number(req.params.id),
      chiTiet: { cu: thay[0].status, moi: status },
    });

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
                 /* Mã máy là dấu nối: giữ nó thì đơn đã xoá danh tính vẫn nối
                    được với đơn có tên cùng máy (BUG-014, SEC-DEC-008). Cùng danh
                    sách cột với routes/tracking.js — sửa một nơi thì sửa cả hai. */
                 device_id = NULL,
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
          await ghiNhatKy(pool, req, {
            hanhDong: 'erase_identity', loaiDoiTuong: 'submission', doiTuongId: Number(req.params.id),
          });
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

/** PATCH /api/admin/submissions/:id/assign — phân công cán bộ (lãnh đạo)
 *
 * ADR-003 §5: lãnh đạo giao cho bất kỳ ai đang hoạt động. Luật cũ "Phó chỉ giao
 * cho cán bộ" (BUG-008) tồn tại vì phân công từng mở cửa xem danh tính; nay
 * danh tính không còn đi theo phân công nên luật đó không còn lý do. */
router.patch('/:id/assign', authorize(...LANH_DAO), async (req, res) => {
  const { staffId } = req.body || {};

  /* Chỉ nhận số nguyên dương, hoặc null để bỏ giao. mysql2 định dạng tham số
     phía client: "3" và [3] đều thành 3, true thành 1 — nên kiểu lạ không được
     tới câu UPDATE. */
  if (staffId !== null && !(Number.isInteger(staffId) && staffId > 0)) {
    return res.status(400).json({ error: 'Mã cán bộ không hợp lệ.' });
  }

  try {
    const phamVi = await dieuKienXem(req.staff, '');
    const [hoSo] = await pool.query(
      `SELECT id FROM submissions WHERE id = ? AND ${phamVi.sql}`,
      [req.params.id, ...phamVi.params]
    );
    if (hoSo.length === 0) return res.status(404).json({ error: 'Không tìm thấy ý kiến.' });

    if (staffId !== null) {
      const [nguoiNhan] = await pool.query('SELECT role, is_active FROM staff WHERE id = ?', [staffId]);
      if (nguoiNhan.length === 0 || !nguoiNhan[0].is_active) {
        return res.status(400).json({ error: 'Cán bộ không tồn tại hoặc đã bị khoá.' });
      }
      /* Tin tố giác mật và tin ngoài thẩm quyền chỉ lãnh đạo đọc được
         (ADR-003 §4). Giao cho cán bộ thì người nhận thấy tên việc trên bảng
         phân công mà không mở được — chặn ngay ở đây, vai trò đọc từ CSDL. */
      if (!laLanhDao(nguoiNhan[0]) && await hoSoMangCo(req.params.id)) {
        return res.status(400).json({
          error: 'Tin này nằm ở phần chỉ lãnh đạo xem (tố giác mật hoặc ngoài thẩm quyền), chỉ giao được cho lãnh đạo.',
        });
      }
    }

    await pool.query('UPDATE submissions SET assigned_to = ? WHERE id = ?', [staffId, req.params.id]);
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
    const phamVi = await dieuKienXem(req.staff, '');   // BUG-009
    const [rows] = await pool.query(
      `SELECT id, status, is_anonymous, device_id, is_spam, reviewed_by FROM submissions WHERE id = ? AND ${phamVi.sql}`,
      [req.params.id, ...phamVi.params]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Không tìm thấy ý kiến.' });
    if (rows[0].status !== 'pending_review') {
      return res.status(400).json({ error: 'Ý kiến này không nằm trong hàng chờ kiểm duyệt.' });
    }

    const newStatus = action === 'approve' ? 'received' : 'spam';

    /* ĐƠN NÀY CÓ ĐƯỢC GÂY KHOÁ KHÔNG (BUG-015) — hỏi TRƯỚC khi ghi lịch sử lần
       này. Hàng chờ có thể chứa đơn bị chặn ngầm (đơn có ảnh nghi ngờ được đổi
       sang 'pending_review' lúc nhận) và đơn được khôi phục; xem xetDonGayKhoa. */
    const xet = action === 'spam'
      ? await xetDonGayKhoa(pool, rows[0])
      : { gayKhoa: false, khongTinhTaiPham: false };
    /* Khoá và đếm tái phạm đều CHỈ trong loại của đơn này (BUG-015), và đơn ẩn
       danh — gần như cả hàng chờ này — không khoá gì (BUG-017, M-B) */
    const anDanh = laDonAnDanh(rows[0].is_anonymous);
    const gayKhoa = !anDanh && xet.gayKhoa && Boolean(rows[0].device_id);

    /* Đơn chặn ngầm: dòng lịch sử mang GHI_CHU_KHONG_TINH_TAI_PHAM là dấu để
       xetKhoaTaiPham KHÔNG đếm đơn này về sau. Ghi TRƯỚC và KHÔNG nuốt lỗi —
       khác lệ ở dưới, vì đánh rác mà thiếu dấu là đơn chặn ngầm thành "quyết
       định cán bộ", đẩy máy lên khoá 30 ngày. Không ghi được thì không đánh rác. */
    if (xet.khongTinhTaiPham) {
      await pool.query(
        'INSERT INTO status_history (submission_id, old_status, new_status, note, changed_by) VALUES (?,?,?,?,?)',
        [req.params.id, 'pending_review', 'spam', GHI_CHU_KHONG_TINH_TAI_PHAM, req.staff.id]
      );
    }

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
      /* Đơn chặn ngầm đã có dòng lịch sử ghi ở trên — không ghi hai lần */
      if (!xet.khongTinhTaiPham) await pool.query(
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
       ĐÁNH DẤU TIN RÁC Ở HÀNG CHỜ CŨNG PHẢI KHOÁ

       Trước đây chỉ đường /:id/mark-spam mới khoá, còn nút "Đánh dấu tin rác"
       ngay tại màn hình kiểm duyệt thì chỉ đổi trạng thái. Hai nút mang cùng
       một cái tên mà làm hai việc khác nhau — cán bộ dùng nút ở hàng chờ (nút
       hay dùng nhất) lại là nút yếu nhất.

       Cả hai nút chỉ tác động ĐÚNG ĐƠN được bấm, không dọn theo lô (BUG-018):
       xem chú thích "KHÔNG CÒN DỌN THEO LÔ" trong lib/chan-spam.js.
       ====================================================================== */
    let taiPham = false;
    if (gayKhoa) {
      await khoaThietBi(pool, {
        deviceId: rows[0].device_id,
        staffId: req.staff.id,
        lyDo: 'Tin rác — đánh dấu tại hàng chờ kiểm duyệt',
        anDanh,
      });
      const kq = await xetKhoaTaiPham(pool, {
        deviceId: rows[0].device_id,
        staffId: req.staff.id,
        anDanh,
      });
      taiPham = kq.taiPham;
    }

    res.json({
      ok: true,
      taiPham,
      message: action === 'approve'
        ? 'Đã duyệt — ý kiến được đưa vào quy trình xử lý.'
        : taiPham
          ? 'Đã đánh dấu là tin rác. Thiết bị bị đánh dấu 3 lần liên tiếp nên khoá 30 ngày.'
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
  /* Không đọc cờ khoaIp: không còn khoá theo IP (BUG-016, SEC-DEC-008 G1).
     Giao diện cũ còn gửi cờ này thì máy chủ bỏ qua. */

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Mã hồ sơ không hợp lệ.' });
  }

  try {
    const phamVi = await dieuKienXem(req.staff, '');   // BUG-009
    const [rows] = await pool.query(
      `SELECT id, status, is_anonymous, device_id, is_spam, reviewed_by FROM submissions WHERE id = ? AND deleted_at IS NULL AND ${phamVi.sql}`,
      [id, ...phamVi.params]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Không tìm thấy hồ sơ, hoặc hồ sơ đã ở trong thùng rác.' });
    }
    const don = rows[0];
    /* Khoá, dọn và đếm tái phạm đều CHỈ trong loại của đơn này (BUG-015) */
    const anDanh = laDonAnDanh(don.is_anonymous);

    /* ĐƠN NÀY CÓ ĐƯỢC GÂY KHOÁ KHÔNG (BUG-015) — hỏi TRƯỚC khi ghi lịch sử lần
       này. Đọc từ dữ liệu của đơn, không từ status; xem xetDonGayKhoa. */
    const { gayKhoa, khongTinhTaiPham } = await xetDonGayKhoa(pool, don);

    /* Đơn chặn ngầm: dòng lịch sử mang GHI_CHU_KHONG_TINH_TAI_PHAM là dấu để
       xetKhoaTaiPham KHÔNG đếm đơn này về sau (lý do cán bộ gõ vẫn lưu ở
       rejection_reason). Ghi TRƯỚC và KHÔNG nuốt lỗi: không ghi được dấu thì
       không đánh rác — đánh rác mà thiếu dấu là đơn chặn ngầm thành "quyết định
       cán bộ", đẩy máy lên khoá 30 ngày. */
    const ghiLichSu = () => pool.query(
      `INSERT INTO status_history (submission_id, old_status, new_status, note, changed_by)
       VALUES (?, ?, 'spam', ?, ?)`,
      [id, don.status, khongTinhTaiPham ? GHI_CHU_KHONG_TINH_TAI_PHAM : (lyDo || 'Đánh dấu tin rác'),
       req.staff?.id || null]
    );
    if (khongTinhTaiPham) await ghiLichSu();

    await pool.query(
      `UPDATE submissions
          SET status = 'spam', is_spam = 1,
              deleted_at = NOW(), deleted_by = ?,
              rejection_reason = ?
        WHERE id = ?`,
      [req.staff?.id || null, lyDo || 'Cán bộ đánh dấu tin rác', id]
    );

    if (!khongTinhTaiPham) await ghiLichSu().catch(() => {});

    /* Khoá thiết bị. Bọc riêng vì lỗi ở đây không được làm hỏng việc đánh dấu
       đã thành công — thà không khoá được còn hơn để hồ sơ nửa vời. */
    let daKhoa = false;
    let kieuKhoa = '';
    let taiPham = false;
    if (anDanh) {
      /* Đơn ẩn danh (kể cả is_anonymous NULL): không khoá máy, không khoá mạng,
         không đếm tái phạm (BUG-017, SEC-DEC-008 M-B). Khoá IP không còn ở
         đâu nữa (BUG-016), nên hồ sơ không mã máy cũng không có đường lui nào. */
    } else if (!gayKhoa) {
      /* Đơn vẫn vào thùng rác như trên; chỉ không khoá, không đếm */
    } else if (don.device_id) {
      /* Chỉ tác động ĐÚNG ĐƠN này, không dọn các đơn khác cùng máy (BUG-018):
         xem chú thích "KHÔNG CÒN DỌN THEO LÔ" trong lib/chan-spam.js. */
      /* Lý do khoá KHÔNG ghi mã hồ sơ: nó ra ở danh sách khoá — trỏ tới hồ sơ
         nào là nối hồ sơ đó với các đơn/khiếu nại cùng máy (BUG-014). */
      daKhoa = await khoaThietBi(pool, {
        deviceId: don.device_id,
        staffId: req.staff?.id || null,
        lyDo: `Tin rác${lyDo ? ': ' + lyDo : ''}`,
        anDanh,
      });
      if (daKhoa) kieuKhoa = 'thiết bị';

      /* Xét tái phạm SAU khi đã khoá 24 giờ: ba lần liên tiếp trong 30 ngày
         thì nâng lên khoá 30 ngày (ghi đè bản ghi vừa tạo). */
      const kqTaiPham = await xetKhoaTaiPham(pool, {
        deviceId: don.device_id,
        staffId: req.staff?.id || null,
        anDanh,
      });
      taiPham = kqTaiPham.taiPham;
      if (taiPham) { daKhoa = true; kieuKhoa = 'thiết bị'; }
    }
    /* Hồ sơ không có mã máy: KHÔNG khoá gì, kể cả theo IP (BUG-016, SEC-DEC-008
       G1) — khoá IP chặn ngầm cả vùng thuê bao dùng chung địa chỉ. Phản hồi báo
       đúng sự thật cho cán bộ, không hứa một cú khoá không xảy ra. */

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
      /* Phản hồi không được thay đổi theo số đơn khác cùng máy: nó là phép thử
         "người này còn gửi đơn nào nữa không" (BUG-018, biến thể D8). */
      /* Đơn ẩn danh: MỘT câu cố định, không phụ thuộc hồ sơ có mã máy/IP hay
         từng bị chặn — mọi khác biệt ở đây là một phép thử về người gửi. */
      ghiChu: anDanh
        ? 'Đã đánh dấu tin rác. Tố giác ẩn danh không khoá máy hay mạng của người gửi — '
          + 'chỉ hồ sơ này vào thùng rác.'
        : !gayKhoa
        ? 'Đã đánh dấu tin rác. Không khoá thêm: hồ sơ này đã bị chặn từ lúc nhận, '
          + 'hoặc đã từng bị đánh dấu tin rác trước đây — mỗi hồ sơ chỉ gây khoá một lần.'
        : !don.device_id
        ? 'Đã đánh dấu tin rác. Hồ sơ này không có mã thiết bị nên không khoá.'
        : !daKhoa
        ? 'Đã đánh dấu tin rác. Không khoá được thiết bị này.'
        : taiPham
          ? 'Đã đánh dấu tin rác. Thiết bị này bị đánh dấu 3 lần liên tiếp nên khoá 30 ngày.'
          : 'Đã đánh dấu tin rác và khoá thiết bị này trong 24 giờ.',
    });
  } catch (err) {
    console.error('Đánh dấu tin rác lỗi:', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ. Đã chạy nang_cap_v12.sql chưa?' });
  }
});

/* ============================================================================
   CHUYỂN TIN VÀO / RA PHẦN TIN TỐ GIÁC MẬT (ADR-003 việc 12)

   Bộ từ khoá bắt phần lớn tin tố cáo cán bộ ngay lúc nhận. Phần còn lại do
   người đọc phát hiện: MỌI cán bộ được chuyển tin VÀO (một chiều — chuyển vào
   xong thì chính cán bộ đó cũng không mở được nữa). Chỉ LÃNH ĐẠO đưa tin RA,
   cho trường hợp bộ từ khoá bắt dư. Cả hai chiều ghi nhật ký.
   ============================================================================ */
router.post('/:id/to-giac-mat', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Mã hồ sơ không hợp lệ.' });
  if (!(await coCotCo())) {
    return res.status(503).json({ error: 'CSDL chưa có phần tố giác mật — chạy database/nang_cap_v26.sql.' });
  }
  const lyDo = String(req.body?.lyDo ?? '').trim().slice(0, 500);
  try {
    const phamVi = await dieuKienXem(req.staff);
    const [rows] = await pool.query(
      `SELECT s.id, s.assigned_to, st.role AS vai_tro_phu_trach
         FROM submissions s LEFT JOIN staff st ON st.id = s.assigned_to
        WHERE s.id = ? AND ${phamVi.sql}`,
      [id, ...phamVi.params]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Không tìm thấy ý kiến.' });
    /* Tin chỉ lãnh đạo xem thì không để giao cho cán bộ: màn hình người đó sẽ
       hiện một việc họ không mở được (cùng luật với route phân công) */
    const boGiao = rows[0].assigned_to != null && !laLanhDao({ role: rows[0].vai_tro_phu_trach });
    await pool.query(
      `UPDATE submissions
          SET to_giac_mat = 1, assigned_to = CASE WHEN ? = 1 THEN NULL ELSE assigned_to END
        WHERE id = ?`,
      [boGiao ? 1 : 0, id]
    );
    await ghiNhatKy(pool, req, {
      hanhDong: 'move_to_secret', loaiDoiTuong: 'submission', doiTuongId: id,
      chiTiet: { lyDo: lyDo || null, boGiaoCanBo: boGiao ? rows[0].assigned_to : null },
    });
    res.json({
      ok: true,
      message: laLanhDao(req.staff)
        ? 'Đã chuyển tin vào phần Tin tố giác mật.'
        : 'Đã chuyển tin vào phần Tin tố giác mật. Từ giờ chỉ lãnh đạo mở được tin này.',
    });
  } catch (err) {
    console.error('Lỗi chuyển tin vào tố giác mật:', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ.' });
  }
});

router.delete('/:id/to-giac-mat', authorize(...LANH_DAO), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Mã hồ sơ không hợp lệ.' });
  if (!(await coCotCo())) {
    return res.status(503).json({ error: 'CSDL chưa có phần tố giác mật — chạy database/nang_cap_v26.sql.' });
  }
  try {
    const [kq] = await pool.query('UPDATE submissions SET to_giac_mat = 0 WHERE id = ? AND to_giac_mat = 1', [id]);
    if (!kq.affectedRows) return res.status(404).json({ error: 'Tin này không nằm trong phần tố giác mật.' });
    await ghiNhatKy(pool, req, { hanhDong: 'release_secret', loaiDoiTuong: 'submission', doiTuongId: id });
    res.json({ ok: true, message: 'Đã đưa tin ra khỏi phần Tin tố giác mật.' });
  } catch (err) {
    console.error('Lỗi đưa tin ra khỏi tố giác mật:', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ.' });
  }
});

export default router;
