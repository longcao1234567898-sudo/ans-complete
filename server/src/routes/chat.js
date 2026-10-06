/**
 * CHAT ẨN DANH HAI CHIỀU
 * ============================================================================
 *
 * VÌ SAO CẦN:
 * Bà con gửi tố giác ẩn danh xong là hết đường liên lạc. Cán bộ đọc thấy thiếu
 * thông tin — "đối tượng mặc áo màu gì", "khoảng mấy giờ", "xe biển số bao
 * nhiêu" — nhưng không hỏi lại được vì không có số điện thoại. Đơn đành xếp lại,
 * mà đó thường là những tin báo giá trị nhất.
 *
 * Kênh này giải bài toán đó mà KHÔNG phá vỡ tính ẩn danh.
 *
 * ---------------------------------------------------------------------------
 * BẢO ĐẢM VỀ QUYỀN RIÊNG TƯ:
 * Bảng report_messages chỉ lưu: nội dung tin nhắn, bên gửi là ai (cán bộ hay
 * người dân), và thời điểm. KHÔNG lưu tên, số điện thoại, email hay địa chỉ IP.
 * Cán bộ chat với người tố giác mà vẫn không biết đó là ai.
 *
 * ---------------------------------------------------------------------------
 * VÌ SAO VÀO PHÒNG CHAT CẦN THÊM MÃ PIN:
 * Mã tra cứu chỉ 6 ký tự và dùng để XEM tiến độ — lộ ra cũng chỉ biết đơn đang
 * ở bước nào. Phòng chat thì khác: trong đó có câu hỏi nghiệp vụ của cán bộ,
 * lộ ra là lộ hướng xác minh, và kẻ bị tố giác có thể mạo danh người báo tin
 * để đánh lạc hướng.
 *
 * Nên phải có THÊM mã PIN 6 số, cấp một lần lúc gửi đơn, database chỉ giữ bản
 * băm bcrypt.
 */

import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { pool } from '../db.js';
import { sanitizeText, scanTextForThreats } from '../lib/security.js';
import { containsProfanity } from '../lib/security.js';
import { locDanhSachAnh, SO_ANH_TOI_DA } from '../lib/anh-an-toan.js';
import { ghiTepKhongNhan, choNguoiDan, LY_DO_LUU_LOI, moTaThua, moTaSaiDang } from '../lib/tep-khong-nhan.js';
import {
  GIO_BO_SUNG, SO_LAN_BO_SUNG_TOI_DA, TRANG_THAI_NHAN_BO_SUNG, coBangBoSung,
} from '../lib/bo-sung.js';

const router = Router();

/* Vé vào phòng chat sống 2 giờ — đủ cho một lượt trao đổi, hết thì nhập lại
   PIN. Không để dài hơn vì vé nằm trong trình duyệt, máy dùng chung thì người
   sau vào được. */
const VE_CHAT_TTL = '2h';

const MAX_DAI_TIN = 1000;

/* ---------------------------------------------------------------------------
   TRẠNG THÁI NÀO THÌ ĐƯỢC CHAT

   Hồ sơ đã giải quyết xong hoặc bị từ chối thì luồng xử lý đã khép lại. Cho
   chat tiếp sẽ sinh ra hai vấn đề:
     · Bà con nhắn vào khoảng không, không ai đọc — mất niềm tin
     · Kẻ xấu dùng làm chỗ nhồi dữ liệu rác vào database

   Chặn ở CẢ HAI LỚP: máy chủ trả 403, và giao diện khoá ô nhập. Chỉ khoá ở
   giao diện là không đủ — người biết dùng công cụ gọi API vẫn bắn tin vào được.
   --------------------------------------------------------------------------- */
const TRANG_THAI_DUOC_CHAT = ['received', 'processing', 'pending_review'];

function chatDaDong(status) {
  return !TRANG_THAI_DUOC_CHAT.includes(status);
}

/* Chống dò mã PIN: 5 lần thử sai / 15 phút cho mỗi IP.
   PIN chỉ 6 số nên không có giới hạn là dò ra trong vài phút. */
const gioiHanMoPhong = rateLimit({
  windowMs: 15 * 60_000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Bà con đã thử sai quá nhiều lần. Vui lòng chờ 15 phút.' },
});

/* Chống spam tin nhắn: 20 tin / 5 phút */
const gioiHanGuiTin = rateLimit({
  windowMs: 5 * 60_000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Bà con gửi hơi nhanh. Vui lòng chờ một chút.' },
});

/**
 * Xác thực vé của NGƯỜI DÂN.
 * Trả về submissionId nếu vé hợp lệ, ném lỗi nếu không.
 */
function kiemTraVeNguoiDan(req) {
  const ve = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim()
    || String(req.body?.chatToken || '').trim();
  if (!ve) throw new Error('Bà con chưa vào phòng chat.');

  const payload = jwt.verify(ve, process.env.JWT_SECRET);
  if (payload.purpose !== 'chat_reporter') throw new Error('Vé không hợp lệ.');
  return Number(payload.sub);
}

/* ==========================================================================
   1) MỞ PHÒNG CHAT — người dân nhập mã tra cứu + mã PIN
   ========================================================================== */
router.post('/open', gioiHanMoPhong, async (req, res) => {
  const code = String(req.body?.code || '').trim().toUpperCase();
  const pin = String(req.body?.pin || '').trim();

  if (!/^[A-Z0-9]{6}$/.test(code)) {
    return res.status(400).json({ error: 'Mã tra cứu gồm 6 ký tự.' });
  }
  if (!/^\d{6}$/.test(pin)) {
    return res.status(400).json({ error: 'Mã PIN gồm 6 chữ số.' });
  }

  try {
    const [rows] = await pool.query(
      `SELECT id, status, chat_pin_hash
         FROM submissions
        WHERE tracking_code = ? AND deleted_at IS NULL
        LIMIT 1`,
      [code]
    );

    /* Trả về CÙNG MỘT thông báo cho cả "không có mã" lẫn "sai PIN".
       Nếu tách riêng, kẻ xấu dò được mã tra cứu nào có thật rồi mới tập trung
       dò PIN cho mã đó. */
    const loiChung = { error: 'Mã tra cứu hoặc mã PIN không đúng.' };

    if (rows.length === 0) return res.status(401).json(loiChung);

    const don = rows[0];
    if (!don.chat_pin_hash) {
      return res.status(400).json({
        error: 'Ý kiến này gửi trước khi có kênh trao đổi nên không có mã PIN. '
             + 'Bà con vui lòng liên hệ trực tiếp số trực ban.',
      });
    }

    const dung = await bcrypt.compare(pin, don.chat_pin_hash);
    if (!dung) return res.status(401).json(loiChung);

    const ve = jwt.sign(
      { sub: don.id, purpose: 'chat_reporter' },
      process.env.JWT_SECRET,
      { expiresIn: VE_CHAT_TTL }
    );

    /* Đánh dấu người dân đã đọc hết tin của cán bộ */
    await pool.query(
      `UPDATE report_messages SET read_by_reporter = 1
        WHERE submission_id = ? AND sender_type = 'staff'`,
      [don.id]
    ).catch(() => { /* không quan trọng */ });

    res.json({
      chatToken: ve,
      trackingCode: code,
      status: don.status,
      daDong: chatDaDong(don.status),
    });
  } catch (err) {
    console.error('Mở phòng chat lỗi:', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ. Bà con thử lại sau.' });
  }
});

/* ==========================================================================
   2) NGƯỜI DÂN XEM TIN NHẮN
   ========================================================================== */
router.get('/messages', async (req, res) => {
  let submissionId;
  try {
    submissionId = kiemTraVeNguoiDan(req);
  } catch {
    return res.status(401).json({ error: 'Phiên trao đổi đã hết hạn. Bà con vào lại bằng mã PIN.' });
  }

  try {
    const [[don]] = await pool.query(
      'SELECT status FROM submissions WHERE id = ? LIMIT 1',
      [submissionId]
    );
    const [tin] = await pool.query(
      `SELECT id, sender_type, message, created_at
         FROM report_messages
        WHERE submission_id = ?
        ORDER BY created_at ASC
        LIMIT 200`,
      [submissionId]
    );

    await pool.query(
      `UPDATE report_messages SET read_by_reporter = 1
        WHERE submission_id = ? AND sender_type = 'staff' AND read_by_reporter = 0`,
      [submissionId]
    ).catch(() => {});

    res.json({
      messages: tin,
      status: don?.status || null,
      daDong: chatDaDong(don?.status),
    });
  } catch (err) {
    console.error('Đọc tin nhắn lỗi:', err.message);
    res.status(500).json({ error: 'Không tải được tin nhắn.' });
  }
});

/* ==========================================================================
   3) NGƯỜI DÂN GỬI TIN NHẮN
   ========================================================================== */
router.post('/messages', gioiHanGuiTin, async (req, res) => {
  let submissionId;
  try {
    submissionId = kiemTraVeNguoiDan(req);
  } catch {
    return res.status(401).json({ error: 'Phiên trao đổi đã hết hạn. Bà con vào lại bằng mã PIN.' });
  }

  const noiDung = sanitizeText(req.body?.message || '', MAX_DAI_TIN);
  if (!noiDung || noiDung.trim().length < 2) {
    return res.status(400).json({ error: 'Bà con chưa nhập nội dung.' });
  }
  if (containsProfanity(noiDung)) {
    return res.status(400).json({ error: 'Nội dung có từ ngữ không phù hợp. Bà con vui lòng viết lại.' });
  }

  try {
    /* CHẶN TẠI GỐC: kiểm tra trạng thái TRƯỚC khi ghi vào database.
       Đây là lớp thật sự bảo vệ — giao diện khoá ô nhập chỉ là để bà con
       thấy rõ, người dùng công cụ gọi API vẫn đi thẳng vào đây. */
    const [[don]] = await pool.query(
      'SELECT status FROM submissions WHERE id = ? LIMIT 1',
      [submissionId]
    );
    if (!don) return res.status(404).json({ error: 'Không tìm thấy ý kiến.' });
    if (chatDaDong(don.status)) {
      return res.status(403).json({
        error: 'Hồ sơ đã đóng, không gửi thêm tin nhắn được. '
             + 'Nếu còn việc cần trình báo, bà con vui lòng gửi ý kiến mới.',
      });
    }

    await pool.query(
      `INSERT INTO report_messages (submission_id, sender_type, message, read_by_reporter)
       VALUES (?, 'reporter', ?, 1)`,
      [submissionId, noiDung]
    );

    /* Đẩy hồ sơ lên đầu danh sách của cán bộ — có tin mới thì phải thấy ngay */
    await pool.query(
      'UPDATE submissions SET updated_at = NOW() WHERE id = ?',
      [submissionId]
    ).catch(() => {});

    res.status(201).json({ ok: true });
  } catch (err) {
    console.error('Gửi tin nhắn lỗi:', err.message);
    res.status(500).json({ error: 'Không gửi được tin nhắn.' });
  }
});

/* ==========================================================================
   BỔ SUNG THÔNG TIN TRONG 72 GIỜ (ADR-003 việc 21)

   Người dân bổ sung nội dung, ảnh cho tin đã gửi. Vào bằng VÉ PHÒNG TRAO ĐỔI
   (mã tra cứu + mã PIN), không chỉ mã tra cứu: người lấy được mã tra cứu — có
   thể chính là người bị tố giác — không được thêm thông tin giả vào hồ sơ.

   · Lưu RIÊNG, ghi giờ; nội dung gốc không đổi.
   · Ảnh qua đúng lớp kiểm tra lúc gửi (lib/anh-an-toan.js).
   · 72 giờ tính từ lúc gửi, máy chủ tự tính bằng giờ CSDL — không tin giờ máy
     người dùng.
   · Số lần có giới hạn, đếm ATOMIC (luật 6): mỗi lần giữ một "thứ tự" riêng,
     khoá duy nhất (submission_id, thu_tu). Hai yêu cầu cùng lúc giành cùng
     một thứ tự thì CSDL chỉ cho một câu thành công; thứ tự không bao giờ vượt
     SO_LAN_BO_SUNG_TOI_DA nên số dòng cũng không vượt.
   ========================================================================== */
const DAI_BO_SUNG_TOI_THIEU = 10;
const DAI_BO_SUNG_TOI_DA = 2000;

/* Không thêm giới hạn theo IP ở đây: vé không giả được (ký bằng JWT_SECRET),
   dò PIN đã bị chặn ở /open, và mỗi tin bị chặn cứng ở SO_LAN_BO_SUNG_TOI_DA
   lần × 3 ảnh bằng phép đếm atomic — tổng dữ liệu một vé đẩy vào là có trần.
   Giới hạn theo IP chỉ thêm chặn oan nhiều người chung mạng 4G (CGNAT). */

const trungKhoa = (e) => e?.code === 'ER_DUP_ENTRY' || e?.errno === 1062;
const thieuBang = (e) => e?.code === 'ER_NO_SUCH_TABLE' || e?.errno === 1146
  || /no such table|doesn't exist|Unknown column|no such column/i.test(String(e?.message || ''));

router.post('/bo-sung', async (req, res) => {
  let submissionId;
  try {
    submissionId = kiemTraVeNguoiDan(req);
  } catch {
    return res.status(401).json({ error: 'Bà con vào lại bằng mã tra cứu và mã PIN để bổ sung thông tin.' });
  }

  const tho = req.body?.noiDung;
  if (typeof tho !== 'string') return res.status(400).json({ error: 'Vui lòng nhập nội dung bổ sung.' });
  if (tho.trim().length > DAI_BO_SUNG_TOI_DA) {
    return res.status(400).json({ error: `Nội dung bổ sung tối đa ${DAI_BO_SUNG_TOI_DA} ký tự.` });
  }
  const noiDung = sanitizeText(tho, DAI_BO_SUNG_TOI_DA);
  if (noiDung.length < DAI_BO_SUNG_TOI_THIEU) {
    return res.status(400).json({ error: 'Nội dung bổ sung quá ngắn, bà con mô tả thêm giúp.' });
  }
  const quet = scanTextForThreats(tho);
  if (!quet.safe) return res.status(400).json({ error: `Nội dung chứa yếu tố không an toàn (${quet.reasons.join(', ')}).` });
  if (containsProfanity(noiDung)) return res.status(400).json({ error: 'Nội dung chứa ngôn từ không phù hợp.' });
  const anhDayDu = Array.isArray(req.body?.images) ? req.body.images : [];
  const anhGui = anhDayDu.slice(0, SO_ANH_TOI_DA);

  if (!(await coBangBoSung())) {
    return res.status(503).json({ error: 'Hệ thống tạm chưa nhận bổ sung. Việc khẩn cấp xin gọi ngay 113.' });
  }

  try {
    const [rows] = await pool.query(
      `SELECT id, status, deleted_at, (created_at > NOW() - INTERVAL ? HOUR) AS trong_han
         FROM submissions WHERE id = ? LIMIT 1`,
      [GIO_BO_SUNG, submissionId]
    );
    const don = rows[0];
    if (!don || don.deleted_at || !TRANG_THAI_NHAN_BO_SUNG.includes(don.status)) {
      return res.status(403).json({ error: 'Tin này đã khép lại, không nhận bổ sung. Có việc mới bà con gửi ý kiến mới.' });
    }
    if (!Number(don.trong_han)) {
      return res.status(403).json({
        error: `Đã quá ${GIO_BO_SUNG} giờ kể từ lúc gửi nên không bổ sung được nữa. `
          + 'Bà con nhắn cho cán bộ trong khung trao đổi, hoặc gửi ý kiến mới.',
      });
    }

    const [[{ n }]] = await pool.query(
      'SELECT COUNT(*) AS n FROM bo_sung_thong_tin WHERE submission_id = ?', [submissionId]
    );
    if (Number(n) >= SO_LAN_BO_SUNG_TOI_DA) {
      return res.status(429).json({
        error: `Mỗi tin bổ sung được tối đa ${SO_LAN_BO_SUNG_TOI_DA} lần. Bà con nhắn thêm cho cán bộ trong khung trao đổi.`,
      });
    }
    let boSungId;
    try {
      const [kq] = await pool.query(
        'INSERT INTO bo_sung_thong_tin (submission_id, thu_tu, noi_dung) VALUES (?, ?, ?)',
        [submissionId, Number(n) + 1, noiDung]
      );
      boSungId = kq.insertId;
    } catch (e) {
      if (trungKhoa(e)) {
        return res.status(429).json({ error: 'Hệ thống đang nhận một bổ sung khác của tin này. Bà con chờ vài giây rồi gửi lại.' });
      }
      throw e;
    }

    /* Ảnh: cùng lớp kiểm như lúc gửi. Ảnh bị chặn hay lưu lỗi thì phần chữ vẫn nhận,
       nhưng phải BÁO người dân và để dấu cho cán bộ (BUG-035) — không bỏ âm thầm. */
    let soAnh = 0;
    const khongNhan = [];
    const rb = req.body ?? {};
    if (rb.images !== undefined && rb.images !== null && !Array.isArray(rb.images)) khongNhan.push(moTaSaiDang('anh'));
    /* Phần thừa gộp MỘT mục — mảng dựng tay dài không thành hàng triệu câu INSERT */
    if (anhDayDu.length > SO_ANH_TOI_DA) khongNhan.push(moTaThua('anh', anhDayDu.length - SO_ANH_TOI_DA, SO_ANH_TOI_DA, 'Mỗi lần bổ sung'));
    /* Phần bổ sung không nhận tài liệu — gửi kèm thì báo, không bỏ âm thầm */
    if (rb.taiLieu !== undefined && rb.taiLieu !== null) {
      khongNhan.push({ ten: 'Tài liệu', loai: 'tai_lieu', lyDo: 'Phần bổ sung chỉ nhận ảnh. Bà con chụp ảnh từng trang tài liệu rồi gửi.' });
    }
    if (anhGui.length > 0) {
      let kq = { hopLe: [], biChan: [] };
      try {
        kq = locDanhSachAnh(anhGui, { cloudName: (process.env.CLOUDINARY_CLOUD_NAME || '').trim() });
      } catch (e) {
        console.error(`[BỔ SUNG] Không kiểm được ảnh của hồ sơ ${submissionId}:`, e.message);
        anhGui.forEach((_, i) => khongNhan.push({ ten: `Ảnh ${i + 1}`, loai: 'anh', lyDo: LY_DO_LUU_LOI }));
      }
      const { hopLe, biChan } = kq;
      if (biChan.length) console.warn(`[BỔ SUNG] chặn ${biChan.length} ảnh:`, biChan.map((b) => b.lyDo).join(' | '));
      for (const b of biChan) khongNhan.push({ ten: `Ảnh ${b.viTri}`, loai: 'anh', lyDo: b.lyDo });
      for (const { anh, trangThai, viTri } of hopLe) {
        const laLink = typeof anh === 'object' && anh?.url;
        try {
          await pool.query(
            `INSERT INTO submission_images
               (submission_id, image_url, cloudinary_id, storage, mime_type, is_verified, moderation_status, bo_sung_id)
             VALUES (?,?,?,?,?,?,?,?)`,
            [submissionId, laLink ? String(anh.url) : String(anh), laLink ? anh.publicId || null : null,
              laLink ? 'cloudinary' : 'base64', 'image/jpeg', true, trangThai, boSungId]
          );
          soAnh += 1;
        } catch (e) {
          console.error(`[BỔ SUNG] Lưu ảnh của hồ sơ ${submissionId} lỗi:`, e.message);
          khongNhan.push({ ten: `Ảnh ${viTri}`, loai: 'anh', lyDo: LY_DO_LUU_LOI });
        }
      }
    }
    await ghiTepKhongNhan(submissionId, khongNhan, { boSungId });

    res.status(201).json({
      ok: true,
      soAnh,
      tepKhongNhan: choNguoiDan(khongNhan),
      message: 'Đã nhận phần bổ sung. Cán bộ sẽ thấy ngay trên hồ sơ của bà con.',
    });
  } catch (err) {
    if (thieuBang(err)) {
      return res.status(503).json({ error: 'Hệ thống tạm chưa nhận bổ sung. Việc khẩn cấp xin gọi ngay 113.' });
    }
    console.error('Bổ sung thông tin lỗi:', err.message);
    res.status(500).json({ error: 'Gửi thất bại — Vấn đề khẩn cấp liên hệ ngay 113 để được giải quyết.' });
  }
});

export default router;
