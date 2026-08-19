/** GET /api/tracking/:code — tra cứu tiến độ theo mã, trả về đúng cấu trúc frontend cần */
import { Router } from 'express';
import { pool } from '../db.js';
import { STATUS_LABEL, layIpThat } from '../lib/helpers.js';

const router = Router();

router.get('/:code', async (req, res) => {
  const code = String(req.params.code || '').trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(code)) {
    return res.status(400).json({ error: 'Mã tra cứu phải gồm 6 ký tự.' });
  }

  try {
    const [rows] = await pool.query(
      `SELECT s.tracking_code, s.original_content, s.ai_processed_content,
              c.code AS category_code, s.status, s.rejection_reason, s.created_at,
              /* Hạn xử lý — cần để nói thật với bà con khi hồ sơ đã trễ hẹn */
              s.deadline_at
       FROM submissions s LEFT JOIN categories c ON s.category_id = c.id
       WHERE s.tracking_code = ?`,
      [code]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Không tìm thấy mã tra cứu. Vui lòng kiểm tra lại 6 ký tự trên phiếu tiếp nhận.' });
    }
    const s = rows[0];

    const [history] = await pool.query(
      `SELECT old_status, new_status, note, changed_at
       FROM status_history h JOIN submissions sub ON sub.id = h.submission_id
       WHERE sub.tracking_code = ? ORDER BY h.changed_at ASC`,
      [code]
    );

    // Dựng timeline: các bước đã xảy ra (done) + các bước tương lai (chưa done)
    const doneSteps = history.map((h) => ({
      status: h.new_status,
      label: STATUS_LABEL[h.new_status],
      timestamp: h.changed_at,
      note: h.note || undefined,
      done: true,
    }));
    // Ý kiến ẨN DANH có thêm bước "Chờ kiểm duyệt" ở đầu luồng
    const isPending = s.status === 'pending_review';
    const flow = isPending
      ? ['pending_review', 'received', 'processing', 'resolved']
      : ['received', 'processing', 'resolved'];

    const steps = [...doneSteps];

    // Tin ẩn danh chưa duyệt: trigger chưa ghi lịch sử -> tự dựng bước đầu
    if (isPending && steps.length === 0) {
      steps.push({
        status: 'pending_review',
        label: STATUS_LABEL.pending_review,
        timestamp: s.created_at,
        note: 'Tin báo ẩn danh đang được cán bộ kiểm duyệt trước khi đưa vào xử lý.',
        done: true,
      });
    }

    if (s.status !== 'rejected' && s.status !== 'spam') {
      const reachedIdx = flow.indexOf(s.status);
      for (let i = reachedIdx + 1; i < flow.length; i++) {
        steps.push({ status: flow[i], label: STATUS_LABEL[flow[i]], timestamp: '', done: false });
      }
    }

    /* ========================================================================
       HỒ SƠ QUÁ HẠN MÀ CHƯA XỬ LÝ XONG -> NÓI THẲNG RA

       "Quá hạn" không phải một trạng thái trong database, mà là phép so hạn
       xử lý với thời điểm hiện tại — giống hệt cách trang quản trị tính.

       ⚠️ CHỈ tính với hồ sơ CHƯA ĐÓNG. Hồ sơ đã giải quyết hoặc đã từ chối thì
       xong việc rồi, có trễ cũng không còn gì để bà con chờ nữa; dán thêm nhãn
       đỏ vào đó chỉ gây hoang mang chứ không giúp được gì.
       ======================================================================== */
    const chuaXong = ['pending_review', 'received', 'processing'].includes(s.status);
    const quaHan = Boolean(
      chuaXong && s.deadline_at && new Date(s.deadline_at).getTime() < Date.now()
    );

    res.json({
      code: s.tracking_code,
      status: s.status,
      category: s.category_code,
      summary: s.ai_processed_content || s.original_content,
      createdAt: s.created_at,
      steps,
      rejectionReason: s.rejection_reason || undefined,
      overdue: quaHan,
      deadlineAt: s.deadline_at || undefined,
    });
  } catch (err) {
    console.error('Lỗi tra cứu:', err);
    res.status(500).json({ error: 'Lỗi máy chủ khi tra cứu.' });
  }
});

/**
 * POST /api/tracking/:code/request-deletion
 * YÊU CẦU XOÁ DỮ LIỆU CÁ NHÂN — theo Nghị định 13/2023/NĐ-CP
 *
 * XÁC MINH QUYỀN: người gửi phải có MÃ TRA CỨU. Mã này chỉ cấp cho người
 * gửi lúc gửi ý kiến, nên có mã nghĩa là có quyền với hồ sơ đó.
 *
 * HAI TÌNH HUỐNG:
 *   1. Hồ sơ ĐÃ ĐÓNG (đã giải quyết / từ chối) -> xoá danh tính NGAY
 *   2. Hồ sơ ĐANG XỬ LÝ -> ghi nhận yêu cầu, cán bộ xử lý sau khi đóng
 *
 * VÌ SAO KHÔNG XOÁ NGAY MỌI TRƯỜNG HỢP?
 * Nghị định 13 Điều 16 cho quyền xoá, NHƯNG có ngoại lệ khi dữ liệu cần cho
 * nghĩa vụ pháp lý hoặc phục vụ điều tra. Tin báo đang xử lý là chứng cứ —
 * xoá danh tính giữa chừng thì cán bộ không xác minh được, hồ sơ thành vô giá trị.
 *
 * "XOÁ" ở đây là ẨN DANH HOÁ: bóc danh tính, giữ nội dung nghiệp vụ.
 */
router.post('/:code/request-deletion', async (req, res) => {
  const code = String(req.params.code || '').trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(code)) {
    return res.status(400).json({ error: 'Mã tra cứu phải gồm 6 ký tự.' });
  }

  const ip = layIpThat(req);

  try {
    const [rows] = await pool.query(
      `SELECT id, tracking_code, status, is_anonymous, identity_erased
       FROM submissions
       WHERE tracking_code = ? AND deleted_at IS NULL`,
      [code]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Không tìm thấy ý kiến với mã này.' });
    }
    const sub = rows[0];

    // Tin ẩn danh vốn không có danh tính để xoá
    if (sub.is_anonymous) {
      return res.json({
        ok: true,
        status: 'nothing',
        message: 'Ý kiến này được gửi ẩn danh — hệ thống không lưu bất kỳ thông tin cá nhân nào của bà con.',
      });
    }

    // Đã xoá rồi thì báo lại, không tạo yêu cầu trùng
    if (sub.identity_erased) {
      return res.json({
        ok: true,
        status: 'already',
        message: 'Thông tin cá nhân của bà con đã được xoá trước đó.',
      });
    }

    // Đã có yêu cầu đang chờ -> không tạo thêm
    const [cho] = await pool.query(
      /* Cột tên là requested_at (không phải created_at) — khớp với
         cấu trúc bảng trong nang_cap_v8.sql */
      `SELECT id, requested_at FROM data_deletion_requests
       WHERE submission_id = ? AND status = 'pending'`,
      [sub.id]
    );
    if (cho.length > 0) {
      return res.json({
        ok: true,
        status: 'pending',
        message: 'Yêu cầu của bà con đã được ghi nhận trước đó và đang chờ xử lý.',
        requestedAt: cho[0].requested_at,
      });
    }

    const hoSoDaDong = sub.status === 'resolved' || sub.status === 'rejected';

    if (hoSoDaDong) {
      // ===== XOÁ NGAY =====
      await pool.query(
        `UPDATE submissions
         SET sender_name = NULL,
             sender_phone = NULL,
             sender_phone_hash = NULL,
             sender_email = NULL,
             ip_address = NULL,
             user_agent = NULL,
             identity_erased = TRUE,
             identity_erased_at = NOW()
         WHERE id = ?`,
        [sub.id]
      );

      await pool.query(
        `INSERT INTO data_deletion_requests
         (submission_id, tracking_code, status, requester_ip, handled_at)
         VALUES (?,?,'done',?,NOW())`,
        [sub.id, code, ip]
      );

      return res.json({
        ok: true,
        status: 'done',
        message: 'Đã xoá toàn bộ thông tin cá nhân của bà con khỏi hệ thống. '
               + 'Nội dung ý kiến được giữ lại ở dạng không còn danh tính, phục vụ thống kê nghiệp vụ.',
      });
    }

    // ===== HỒ SƠ ĐANG XỬ LÝ -> GHI NHẬN, CHỜ =====
    await pool.query(
      `INSERT INTO data_deletion_requests
       (submission_id, tracking_code, status, reason, requester_ip)
       VALUES (?,?,'pending',?,?)`,
      [
        sub.id,
        code,
        'Hồ sơ đang trong quá trình xử lý — sẽ xoá danh tính ngay sau khi đóng hồ sơ',
        ip,
      ]
    );

    return res.json({
      ok: true,
      status: 'pending',
      message: 'Đã ghi nhận yêu cầu của bà con. Hiện ý kiến đang trong quá trình xử lý '
             + 'nên chưa xoá được ngay — thông tin cá nhân cần thiết để cán bộ xác minh. '
             + 'Ngay sau khi hồ sơ đóng, hệ thống sẽ tự động xoá.',
    });
  } catch (err) {
    console.error('Lỗi yêu cầu xoá dữ liệu:', err.message);

    /* CHẨN ĐOÁN CỤ THỂ thay vì báo chung chung.
       Lỗi hay gặp nhất: file nâng cấp SQL dừng giữa chừng vì cột đã tồn tại,
       khiến BẢNG data_deletion_requests chưa được tạo. Nói rõ ra để người
       quản trị biết chính xác phải làm gì. */
    let goiY = 'Vui lòng liên hệ trực ban đơn vị để được hỗ trợ.';

    if (err.code === 'ER_NO_SUCH_TABLE' || /doesn't exist/i.test(err.message)) {
      goiY = 'Hệ thống chưa tạo bảng data_deletion_requests. '
           + 'Quản trị viên cần chạy lại file nang_cap_v8.sql (bản mới).';
    } else if (err.code === 'ER_BAD_FIELD_ERROR' || /unknown column/i.test(err.message)) {
      /* Lấy ĐÚNG tên cột bị thiếu từ thông báo của MySQL.
         Trước đây ghi cứng 'identity_erased' -> báo sai chỗ, gây mất thời gian
         tìm nhầm hướng. Giờ nói đúng cột nào đang thiếu. */
      const m = /unknown column '([^']+)'/i.exec(err.message);
      const tenCot = m ? m[1] : 'không rõ';
      goiY = `Hệ thống thiếu cột ${tenCot} trong cơ sở dữ liệu. `
           + 'Quản trị viên xem /api/health/schema để biết chính xác thiếu gì.';
    }

    res.status(500).json({
      error: 'Chưa xử lý được yêu cầu. ' + goiY,
      // Chi tiết kỹ thuật để quản trị viên xem trong Console, không hiện cho dân
      detail: process.env.NODE_ENV === 'production' ? undefined : err.message,
    });
  }
});

export default router;
