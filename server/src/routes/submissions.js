/** POST /api/submissions — nhận ý kiến mới, kiểm tra toàn bộ phía máy chủ */
import { Router } from 'express';
import { pool } from '../db.js';
import { generateTrackingCode, sha256, layIpThat } from '../lib/helpers.js';
import {
  sanitizeText, scanTextForThreats, containsProfanity, getPhoneError, normalizePhone,
} from '../lib/security.js';
import { encrypt, hashPhone, hashIdentifier, encryptionEnabled, encryptionProblem } from '../lib/crypto.js';
import { locDanhSachAnh } from '../lib/anh-an-toan.js';
import { xetTruocKhiNhan, xetKhoaIp, layMaThietBi } from '../lib/chan-spam.js';
import bcrypt from 'bcryptjs';
import { kiemTraNoiDungNham, kiemTraHoTenNham } from '../lib/noi-dung-nham.js';
import { verifyTurnstile, turnstileEnabled } from '../lib/turnstile.js';
import { verifyOtpToken, verifyAnonToken } from './otp.js';
import { kiemTraTrungLapGanDung, timSuKienTrung } from '../lib/duplicate.js';

const router = Router();

/* Cột toạ độ vụ việc chỉ có sau khi chạy database/nang_cap_v16.sql.
   Kiểm MỘT lần rồi nhớ kết quả, tránh hỏi database mỗi lần gửi ý kiến. */
let _coCotToaDo = null;
async function kiemCotToaDo() {
  if (_coCotToaDo !== null) return _coCotToaDo;
  try {
    const [r] = await pool.query(
      `SELECT 1 FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = 'submissions'
          AND column_name = 'incident_lat' LIMIT 1`
    );
    _coCotToaDo = r.length > 0;
  } catch {
    _coCotToaDo = false;
  }
  return _coCotToaDo;
}

const COOLDOWN_MS = 2 * 60_000;
const MAX_PER_HOUR = 5;

/* ===== HẠN MỨC NGẶT HƠN CHO Ý KIẾN ẨN DANH =====
 * Ẩn danh không có SĐT/email để chặn -> kẻ xấu đổi IP là spam được.
 * Nên siết chặt hơn hẳn, và bắt buộc CAPTCHA (không cho tắt).
 */
const ANON_COOLDOWN_MS = 10 * 60_000;  // chờ 10 phút giữa 2 lần gửi (thường: 2 phút)
const ANON_MAX_PER_DAY = 2;            // tối đa 2 ý kiến/ngày   (thường: 5/giờ)
const ANON_MIN_LENGTH = 50;            // nội dung tối thiểu 50 ký tự (chống gửi "aaaa")
const CAT_CODE_TO_ID = { to_giac: 1, khieu_nai: 2, phan_anh: 3, de_xuat: 4 };

/** GET /api/submissions/wards — danh sách địa bàn cho ô chọn ở form */
router.get('/wards', async (_req, res) => {
  try {
    const [rows] = await pool.query('SELECT id, name FROM wards ORDER BY display_order, name');
    res.json(rows);
  } catch {
    res.json([]); // chưa chạy nâng cấp v2 -> trả rỗng, form vẫn dùng được
  }
});

/**
 * GET /api/submissions/qr-points/:code — bà con quét mã QR dán tại hiện
 * trường, form gửi ý kiến gọi API này để tự điền sẵn địa bàn.
 * KHÔNG cần đăng nhập — đây là mã công khai in trên giấy dán ở nơi công cộng.
 */
router.get('/qr-points/:code', async (req, res) => {
  try {
    const code = String(req.params.code || '').toUpperCase().slice(0, 8);
    const [[point]] = await pool.query(
      `SELECT p.name, p.ward_id, w.name AS ward_name
       FROM qr_points p JOIN wards w ON w.id = p.ward_id
       WHERE p.code = ? AND p.is_active = TRUE`,
      [code]
    );
    if (!point) return res.status(404).json({ error: 'Mã QR không hợp lệ hoặc đã ngừng dùng.' });
    res.json(point);
  } catch {
    // Chưa chạy nang_cap_v10.sql -> coi như không có, form vẫn dùng được bình thường
    res.status(404).json({ error: 'Mã QR không hợp lệ.' });
  }
});

router.post('/', async (req, res) => {
  try {
    const body = req.body || {};
    const content = sanitizeText(body.content);
    const fullName = sanitizeText(body.fullName, 100);
    const phone = normalizePhone(body.phone);
    const email = sanitizeText(body.email || '', 100);
    const category = body.category;
    const normalizedContent = sanitizeText(body.normalizedContent || content, 2500);
    const images = Array.isArray(body.images) ? body.images.slice(0, 3) : [];
    const wardId = Number(body.wardId) > 0 ? Number(body.wardId) : null;
    const isAnonymous = body.isAnonymous === true;
    const urgency = ['normal','important','urgent'].includes(body.urgency) ? body.urgency : 'normal';

    const ip = layIpThat(req);

    /* ===== KHÔNG LƯU IP THÔ CỦA NGƯỜI GỬI =====
       Với một tin ẩn danh, bộ ba ip_address + user_agent + created_at là đủ để
       định danh người tố giác: ở địa bàn xã, một dải IP cộng một chuỗi
       user-agent hiếm gần như trỏ đích danh một hộ dân. Lưu chữ trần thì toàn
       bộ công sức mã hoá AES-256-GCM cho tên/SĐT thành vô nghĩa.

       Băm cho MỌI tin, không riêng tin ẩn danh -> mọi phép so sánh hạn mức đều
       là hash-với-hash, nhất quán, không phải nhớ chỗ nào băm chỗ nào không.
       Cắt 32 ký tự (vẫn 128 bit, xác suất trùng không đáng kể) để vừa cột
       VARCHAR(45) sẵn có -> KHÔNG cần ALTER TABLE.

       IP thô (biến `ip`) vẫn dùng được cho việc gọi ra ngoài như Turnstile,
       nhưng TUYỆT ĐỐI không ghi vào database. */
    const ipHash = hashIdentifier(ip).slice(0, 32);

    // 0) CAPTCHA chống bot
    const captcha = await verifyTurnstile(body.captchaToken, ip);
    if (!captcha.ok) return res.status(400).json({ error: captcha.error });

    // ẨN DANH: CAPTCHA là BẮT BUỘC (không cho bỏ qua như ý kiến có danh tính)
    if (isAnonymous && turnstileEnabled() && !body.captchaToken) {
      return res.status(400).json({
        error: 'Gửi ẩn danh bắt buộc phải hoàn tất bước xác minh "Tôi không phải người máy".',
      });
    }

    // 1) Ràng buộc cơ bản
    if (!content) return res.status(400).json({ error: 'Nội dung ý kiến không được để trống.' });

    // ẨN DANH: bắt mô tả chi tiết (cán bộ không thể gọi lại hỏi thêm)
    if (isAnonymous && content.trim().length < ANON_MIN_LENGTH) {
      return res.status(400).json({
        error: `Gửi ẩn danh cần mô tả chi tiết ít nhất ${ANON_MIN_LENGTH} ký tự (thời gian, địa điểm, đối tượng) vì cán bộ không thể liên hệ lại để hỏi thêm.`,
      });
    }
    if (!CAT_CODE_TO_ID[category]) return res.status(400).json({ error: 'Nhóm xử lý không hợp lệ.' });
    // ẨN DANH: CHỈ áp dụng cho TỐ GIÁC TỘI PHẠM.
    // Các nhóm khác (khiếu nại, phản ánh, đề xuất) BẮT BUỘC có danh tính:
    //  - Khiếu nại/tố cáo: Luật Khiếu nại yêu cầu người khiếu nại có danh tính
    //  - Phản ánh/đề xuất: cán bộ cần liên hệ lại để phản hồi kết quả
    // Thu hẹp cửa ẩn danh cũng làm giảm mạnh nguy cơ bị lợi dụng gửi tin rác.
    if (isAnonymous && category !== 'to_giac') {
      return res.status(400).json({
        error: 'Gửi ẩn danh chỉ áp dụng cho nhóm "Tố giác tin báo tội phạm". Các nhóm khác cần có danh tính để cán bộ phản hồi kết quả.',
      });
    }

    /* ẨN DANH: KHÔNG còn đòi "vé" xác thực 6 số.

       Trước đây bà con gửi ẩn danh phải bấm lấy mã, chờ mã hiện ra rồi gõ lại
       6 số. Bước đó KHÔNG bảo vệ được gì — mã hiện ngay trên màn hình chính
       máy đang gửi, ai cũng chép lại được — mà lại là một chỗ để người lớn
       tuổi và người vùng sâu bỏ cuộc giữa chừng.

       Việc chống người máy đã có Turnstile lo (kiểm ở trên, dòng 117), chống
       spam đã có khoá thiết bị và khoá địa chỉ mạng lo. Ẩn danh cũng đã bị
       siết bằng hai điều kiện khác: nội dung phải đủ dài (ANON_MIN_LENGTH) và
       chỉ áp dụng cho nhóm tố giác tội phạm.

       ⚠️ VẪN NHẬN otpToken nếu trình duyệt cũ còn gửi lên — chỉ là không bắt
       buộc nữa. Bỏ hẳn việc đọc trường này sẽ làm hỏng các phiên đang mở dở. */

    if (!isAnonymous) {
      // 🔒 CHẶN SỚM: ý kiến này có danh tính, mà danh tính thì BẮT BUỘC phải mã hoá.
      // Khoá hỏng -> từ chối nhận luôn, KHÔNG lưu gì vào database.
      // Thà bà con phải gửi lại sau, còn hơn tên và số điện thoại người tố giác
      // nằm dạng chữ trần trong database mà không ai hay biết.
      if (!encryptionEnabled()) {
        console.error('🔴 TỪ CHỐI nhận ý kiến có danh tính —', encryptionProblem());
        return res.status(503).json({
          error:
            'Hệ thống tạm thời không tiếp nhận ý kiến có thông tin liên hệ do sự cố kỹ thuật về bảo mật. '
            + 'Nếu việc gấp, bà con có thể gửi TỐ GIÁC ẨN DANH (vẫn hoạt động bình thường) '
            + 'hoặc gọi trực tiếp số trực ban. Mong bà con thông cảm.',
          code: 'ENCRYPTION_UNAVAILABLE',
        });
      }

      if (!fullName) return res.status(400).json({ error: 'Vui lòng nhập họ và tên.' });

      /* --------------------------------------------------------------------
         XÁC THỰC EMAIL — TẠM TẮT

         Đặt BAT_XAC_THUC_EMAIL=true trong biến môi trường để bật lại. Toàn bộ
         mã xử lý OTP vẫn còn nguyên (routes/otp.js, lib/mailer.js) — chỉ là
         không chạy tới.

         Vì sao tắt: thêm một bước chờ đợi, mà nhiều bà con lớn tuổi không
         quen mở hộp thư trên điện thoại. Chống người máy đã có Turnstile lo,
         chống spam đã có chặn theo thiết bị.

         ⚠️ Phải khớp với cờ BAT_XAC_THUC_EMAIL bên giao diện. Lệch nhau thì
         giao diện cho qua mà máy chủ chặn — bà con điền xong bấm gửi lại báo
         lỗi, không hiểu vì sao.
         -------------------------------------------------------------------- */
      if (String(process.env.BAT_XAC_THUC_EMAIL || 'false') === 'true') {
        if (!email) return res.status(400).json({ error: 'Vui lòng nhập email để nhận mã xác thực.' });
        const otpCheck = verifyOtpToken(body.otpToken, email);
        if (!otpCheck.ok) return res.status(401).json({ error: otpCheck.error });
      }
    }

    // 2) Lá chắn văn bản
    const scan = scanTextForThreats(content);
    if (!scan.safe) return res.status(400).json({ error: `Nội dung chứa yếu tố không an toàn (${scan.reasons.join(', ')}).` });
    if (containsProfanity(content) || containsProfanity(fullName)) {
      return res.status(400).json({ error: 'Nội dung chứa ngôn từ không phù hợp. Vui lòng diễn đạt lịch sự.' });
    }

    /* 2b) CHẶN NỘI DUNG NHẢM
       Ô nội dung bắt tối thiểu 20 ký tự để bà con mô tả cho rõ. Nhưng người
       muốn nghịch chỉ cần gõ bừa cho đủ 20 ký tự ("Aaaabdjiwma...") là gửi
       được. Mỗi ý kiến rác đều tốn công cán bộ mở ra đọc rồi mới xoá.

       Bộ lọc đặt ở mức DỄ DÃI, phải có ít nhất hai dấu hiệu mạnh mới chặn —
       thà bỏ lọt vài ý kiến rác còn hơn chặn nhầm một tố giác thật. */
    const nham = kiemTraNoiDungNham(content);
    if (nham.nham) {
      console.warn(`Chặn nội dung nhảm (${nham.diem}đ): ${nham.chiTiet.join(' · ')}`);
      return res.status(400).json({ error: nham.lyDo, code: 'NOI_DUNG_KHONG_RO' });
    }
    if (!isAnonymous) {
      const tenNham = kiemTraHoTenNham(fullName);
      if (tenNham.nham) return res.status(400).json({ error: tenNham.lyDo });
    }

    // 3) Số điện thoại nghiêm ngặt
    const phoneErr = isAnonymous ? null : getPhoneError(phone);
    if (phoneErr) return res.status(400).json({ error: `Số điện thoại: ${phoneErr.toLowerCase()}.` });

    // 4) Chống spam — dò theo IP và BĂM SĐT (số thật đã mã hoá nên không so trực tiếp được)
    const contentHash = sha256(normalizedContent);
    const phoneHash = isAnonymous ? null : hashPhone(phone);
    const [spam] = await pool.query(
      `SELECT COUNT(*) AS cnt, MAX(created_at) AS last_at,
              EXISTS(SELECT 1 FROM submissions WHERE content_hash=? AND created_at > NOW()-INTERVAL 1 HOUR) AS dup
       FROM submissions
       WHERE (ip_address=? OR (sender_phone_hash IS NOT NULL AND sender_phone_hash=?)) AND created_at > NOW()-INTERVAL 1 HOUR`,
      [contentHash, ipHash, phoneHash || '__none__']
    );
    const info = spam[0];
    if (info.dup) return res.status(429).json({ error: 'Nội dung này bà con vừa gửi rồi. Vui lòng dùng mã tra cứu đã cấp để theo dõi.' });

    /* CHỐNG TRÙNG GẦN ĐÚNG — bắt cả khi nội dung bị sửa nhẹ để né.
       Băm chính xác ở trên chỉ bắt bản giống hệt; đổi dấu câu hay chèn
       vài chữ là qua. Lớp này so độ tương đồng nên bắt được.
       Cùng IP + giống >=75% -> chặn. Khác IP -> không chặn (có thể là
       nhiều người dân cùng phản ánh một vụ thật) mà ĐÁNH DẤU cho cán bộ xem. */
    const trungLap = await kiemTraTrungLapGanDung(pool, content, ipHash);
    if (trungLap.chan) {
      return res.status(429).json({ error: trungLap.lyDo });
    }

    // Chờ giữa 2 lần gửi — ẩn danh phải chờ LÂU HƠN (10 phút thay vì 2 phút)
    const cooldown = isAnonymous ? ANON_COOLDOWN_MS : COOLDOWN_MS;
    if (info.last_at && Date.now() - new Date(info.last_at).getTime() < cooldown) {
      const waitSec = Math.ceil((cooldown - (Date.now() - new Date(info.last_at).getTime())) / 1000);
      const waitMin = Math.ceil(waitSec / 60);
      return res.status(429).json({
        error: isAnonymous
          ? `Gửi ẩn danh được giới hạn chặt để chống tin rác. Vui lòng chờ thêm ${waitMin} phút.`
          : `Bà con vừa gửi một ý kiến. Vui lòng chờ thêm ${waitSec} giây.`,
      });
    }

    // ẨN DANH: tối đa 2 ý kiến / NGÀY / IP (ý kiến thường: 5 / giờ)
    if (isAnonymous) {
      const [[anonStat]] = await pool.query(
        `SELECT COUNT(*) AS cnt FROM submissions
         WHERE is_anonymous = TRUE AND ip_address = ? AND created_at > NOW() - INTERVAL 1 DAY`,
        [ipHash]
      );
      if (anonStat.cnt >= ANON_MAX_PER_DAY) {
        return res.status(429).json({
          error: `Mỗi thiết bị chỉ được gửi tối đa ${ANON_MAX_PER_DAY} ý kiến ẩn danh trong 24 giờ. Nếu vụ việc gấp, bà con vui lòng gửi có danh tính hoặc gọi 113.`,
        });
      }
    }
    if (info.cnt >= MAX_PER_HOUR) {
      return res.status(429).json({ error: `Mỗi thiết bị chỉ được gửi tối đa ${MAX_PER_HOUR} ý kiến trong 1 giờ.` });
    }

    // 5) Sinh mã tra cứu không trùng
    let trackingCode = generateTrackingCode();
    for (let i = 0; i < 5; i++) {
      const [exist] = await pool.query('SELECT 1 FROM submissions WHERE tracking_code=?', [trackingCode]);
      if (exist.length === 0) break;
      trackingCode = generateTrackingCode();
    }

    // 6) Tính HẠN XỬ LÝ (SLA) theo quy định của từng nhóm
    const catId = CAT_CODE_TO_ID[category];
    let slaDays = 15;
    try {
      const [[cat]] = await pool.query('SELECT sla_days FROM categories WHERE id=?', [catId]);
      if (cat?.sla_days) slaDays = cat.sla_days;
    } catch { /* chưa nâng cấp v2 -> dùng mặc định */ }
    const deadlineAt = new Date(Date.now() + slaDays * 24 * 60 * 60 * 1000);

    /* 6b) GỘP SỰ KIỆN TRÙNG LẶP — "nhiều người cùng báo 1 vụ việc".
       Tìm TRƯỚC khi lưu, vì cần so với các ý kiến ĐÃ có trong database.
       Không chặn gì cả — chỉ để nối vào cùng 1 nhóm sau khi lưu xong. */
    const suKienTrung = await timSuKienTrung(pool, { noiDung: content, wardId, categoryId: catId });

    /* ---------------------------------------------------------------------
       6b) XÉT CHẶN NGẦM (shadow ban)

       Thiết bị hoặc IP đang bị khoá thì VẪN nhận đơn, VẪN cấp mã tra cứu, màn
       hình VẪN báo thành công — nhưng đánh dấu is_spam = 1 để đơn không vào
       hàng chờ của cán bộ.

       Vì sao không báo thẳng "bạn bị khoá": báo thẳng là mách nước, kẻ phá
       hoại xoá bộ nhớ trình duyệt đổi máy ngay. Chặn ngầm thì họ tưởng bình
       thường, gửi mãi chẳng ai xử lý rồi mất hứng.
       --------------------------------------------------------------------- */
    const { chanNgam, deviceId } = await xetTruocKhiNhan(pool, req);

    /* ---------------------------------------------------------------------
       6c) SINH MÃ PIN VÀO PHÒNG CHAT

       Cấp MỘT LẦN duy nhất, trả về cho bà con ngay màn hình xác nhận. Database
       chỉ giữ bản băm bcrypt — kể cả quản trị viên cũng không đọc lại được,
       đúng nguyên tắc đã áp dụng cho mật khẩu cán bộ.

       Mất PIN thì không vào phòng chat được nữa, nhưng vẫn tra cứu tiến độ
       bình thường bằng mã tra cứu. Đánh đổi này chấp nhận được: chat chứa câu
       hỏi nghiệp vụ của cán bộ, lộ ra là lộ hướng xác minh.
       --------------------------------------------------------------------- */
    const chatPin = String(Math.floor(100000 + Math.random() * 900000));
    const chatPinHash = await bcrypt.hash(chatPin, 10);

    /* TOẠ ĐỘ VỤ VIỆC — người dân tự nguyện gửi, có thể không có.

       Kiểm chặt: phải là số, phải nằm trong khoảng hợp lệ của toạ độ địa cầu.
       Sai thì bỏ qua chứ KHÔNG từ chối cả ý kiến — toạ độ chỉ là thông tin
       thêm, không đáng để làm hỏng việc gửi tin của bà con. */
    let viTriLat = null;
    let viTriLng = null;
    {
      const v = body.viTri;
      if (v && typeof v === 'object') {
        const la = Number(v.lat);
        const lo = Number(v.lng);
        if (Number.isFinite(la) && Number.isFinite(lo)
            && la >= -90 && la <= 90 && lo >= -180 && lo <= 180) {
          viTriLat = la;
          viTriLng = lo;
        }
      }
    }

    /* Cột toạ độ chỉ có sau khi chạy nang_cap_v16.sql. Kiểm một lần rồi nhớ,
       để máy chủ chưa nâng cấp database vẫn nhận được ý kiến bình thường —
       chỉ là không lưu toạ độ. Thà thiếu toạ độ còn hơn chặn cả việc gửi tin. */
    const coCotToaDo = await kiemCotToaDo();

    // 7) Lưu ý kiến — DANH TÍNH ĐƯỢC MÃ HOÁ (trigger tự ghi lịch sử "Đã tiếp nhận")
    const [result] = await pool.query(
      `INSERT INTO submissions
       (tracking_code, original_content, ai_processed_content, category_id, ai_suggested_category_id,
        content_hash, sender_name, sender_phone, sender_phone_hash, sender_email,
        status, ip_address, user_agent, deadline_at, ward_id, is_verified_otp, is_anonymous, urgency,
        is_flagged, flag_reason, device_id, is_spam, chat_pin_hash${coCotToaDo ? ', incident_lat, incident_lng' : ''})
       VALUES (?,?,?,?,?, ?,?,?,?,?, ?,?,?,?,?, ?,?,?, ?,?, ?,?,?${coCotToaDo ? ', ?,?' : ''})`,
      [
        // 1-5
        trackingCode, content, normalizedContent, catId, catId,
        // 6-10  (danh tính: ẩn danh -> NULL)
        contentHash,
        isAnonymous ? null : encrypt(fullName),
        isAnonymous ? null : encrypt(phone),
        phoneHash,
        isAnonymous || !email ? null : encrypt(email),
        // 11-15
        // ẨN DANH -> vào HÀNG CHỜ KIỂM DUYỆT (cán bộ duyệt mới vào quy trình chính,
        // giống cách cơ quan thật sàng lọc tin báo nặc danh)
        // Bị chặn ngầm -> 'spam' ngay, không vào hàng chờ làm phiền cán bộ
        chanNgam ? 'spam' : (isAnonymous ? 'pending_review' : 'received'),
        ipHash,
        // User-Agent của người gửi ẨN DANH: KHÔNG lưu. Chuỗi UA hiếm cộng với
        // thời điểm gửi là một dấu vân tay đủ hẹp để lần ra người tố giác.
        isAnonymous ? null : (req.headers['user-agent'] || '').slice(0, 255),
        deadlineAt,
        wardId,
        // 16-17
        !isAnonymous,
        isAnonymous,
        urgency,
        // Cờ nghi gửi hàng loạt (lớp chống trùng gần đúng phát hiện)
        trungLap.danhDau ? 1 : 0,
        trungLap.ghiChu || null,
        // 21-23: chặn spam theo thiết bị + mã PIN vào phòng chat
        deviceId || null,
        chanNgam ? 1 : 0,
        chatPinHash,
        /* Toạ độ chỉ thêm vào khi database đã có cột — thứ tự phải khớp với
           phần dựng câu lệnh ở trên. */
        ...(coCotToaDo ? [viTriLat, viTriLng] : []),
      ]
    );

    /* Đơn vừa lưu bị chặn ngầm -> xét xem có nên khoá luôn cả IP không.
       Chỉ khoá khi cùng một IP có nhiều THIẾT BỊ KHÁC NHAU cùng gửi đơn rác —
       dấu hiệu kẻ phá hoại xoá bộ nhớ trình duyệt để đổi mã thiết bị.
       Bọc riêng vì lỗi ở đây không được làm hỏng việc đã gửi thành công. */
    if (chanNgam) {
      xetKhoaIp(pool, ip).catch(() => { /* bỏ qua */ });
    }

    // 7b) Nối ý kiến vừa lưu vào nhóm sự kiện (nếu tìm thấy ở bước 6b).
    // Làm SAU khi đã lưu xong, và bọc try/catch riêng — lỗi ở đây không
    // được phép làm hỏng việc bà con đã gửi thành công.
    if (suKienTrung) {
      try {
        let groupId = suKienTrung.incident_group_id;
        if (!groupId) {
          // Ý kiến khớp chưa thuộc nhóm nào -> tạo nhóm mới gồm cả 2
          const [g] = await pool.query(
            `INSERT INTO incident_groups
             (ward_id, category_id, first_submission_id, submission_count, first_reported_at, last_reported_at)
             VALUES (?,?,?,2,?,NOW())`,
            [wardId, catId, suKienTrung.id, suKienTrung.created_at]
          );
          groupId = g.insertId;
          await pool.query('UPDATE submissions SET incident_group_id=? WHERE id=?', [groupId, suKienTrung.id]);
        } else {
          // Nhóm đã có sẵn -> chỉ cần cộng thêm 1
          await pool.query(
            'UPDATE incident_groups SET submission_count = submission_count + 1, last_reported_at = NOW(), acknowledged = FALSE WHERE id = ?',
            [groupId]
          );
        }
        await pool.query('UPDATE submissions SET incident_group_id=? WHERE id=?', [groupId, result.insertId]);
      } catch (e) {
        console.warn('Không gộp được vào nhóm sự kiện (bỏ qua):', e.message);
      }
    }

    // 8) Lưu ảnh — bỏ qua nếu lỗi để không chặn ý kiến
    if (images.length > 0) {
      try {
        /* ---------------------------------------------------------------
           KIỂM TRA AN TOÀN ẢNH NGAY TẠI MÁY CHỦ.

           Trước đây mọi ảnh gửi lên đều được ghi thẳng với trạng thái
           'safe' mà không kiểm gì. Các lá chắn chỉ nằm ở trình duyệt —
           tức là ở máy của người gửi, họ toàn quyền bỏ qua. Gọi thẳng API
           bằng công cụ dòng lệnh là nạp được tệp bất kỳ vào hệ thống.

           Nay máy chủ tự kiểm lại: chữ ký nhị phân, dấu vết mã thực thi,
           gói nén nối ở đuôi tệp, và với ảnh dạng link thì bắt buộc phải
           thuộc kho ảnh của đơn vị.
           --------------------------------------------------------------- */
        const { hopLe, biChan, canDuyet } = locDanhSachAnh(images, {
          cloudName: (process.env.CLOUDINARY_CLOUD_NAME || '').trim(),
          // Trình duyệt báo có ảnh nghi nhạy cảm -> đánh dấu chờ cán bộ xem
          canhBaoNoiDung: body.anhNghiNgo === true,
        });

        if (biChan.length > 0) {
          console.warn(
            `[ẢNH] Chặn ${biChan.length} ảnh của ${trackingCode}: `
            + biChan.map((b) => `#${b.viTri} ${b.lyDo}`).join(' | ')
          );
        }

        /* Có ảnh cần cán bộ xem -> cả ý kiến chuyển sang hàng chờ duyệt,
           ảnh không hiện ra ngoài cho tới khi được duyệt. */
        if (canDuyet) {
          await pool.query(
            `UPDATE submissions SET status = 'pending_review' WHERE id = ?`,
            [result.insertId]
          );
        }

        const values = hopLe.map(({ anh, trangThai }) => {
          if (typeof anh === 'object' && anh?.url) {
            return [result.insertId, String(anh.url), anh.publicId || null, 'cloudinary', 'image/jpeg', true, trangThai];
          }
          return [result.insertId, String(anh), null, 'base64', 'image/jpeg', true, trangThai];
        });
        if (values.length === 0) throw new Error('Không có ảnh nào hợp lệ');
        await pool.query(
          `INSERT INTO submission_images
           (submission_id, image_url, cloudinary_id, storage, mime_type, is_verified, moderation_status)
           VALUES ?`,
          [values]
        );
      } catch (e) {
        console.warn('Không lưu được ảnh đính kèm:', e.message);
      }
    }

    /* 8b) LƯU VIDEO MINH CHỨNG — bỏ qua nếu lỗi, không chặn ý kiến.

       Video đi đường riêng, KHÔNG qua bộ kiểm ảnh vì bộ đó soi chữ ký nhị phân
       của định dạng ảnh. Ở đây kiểm ba điều tối thiểu:
         1. Phải là data URL kiểu video (chặn người ta nhét kiểu tệp khác vào)
         2. Giới hạn kích thước, tránh một video nuốt hết dung lượng database
         3. Đánh dấu chờ duyệt — cán bộ xem rồi mới hiện, vì máy chủ không tự
            kiểm duyệt được nội dung video như với ảnh.

       ⚠️ Video KHÔNG được xoá thông tin bên trong tệp (có thể gồm nơi quay).
       Giao diện đã nói rõ điều này cho người gửi biết trước khi đính kèm. */
    if (typeof body.video === 'string' && body.video) {
      try {
        const cloudName = (process.env.CLOUDINARY_CLOUD_NAME || '').trim();
        /* Video tới theo MỘT trong hai dạng:
             - Đường dẫn kho ảnh: trình duyệt đã tải lên Cloudinary, chỉ gửi link
               (đường đi bình thường, nhẹ, không tốn dung lượng database)
             - data URL base64: chưa cấu hình kho ảnh hoặc tải lên lỗi
               (đường lui, nặng, nên giới hạn chặt) */
        const laLinkKho = cloudName
          && /^https:\/\/res\.cloudinary\.com\//.test(body.video)
          && body.video.includes(`/${cloudName}/`);
        const laBase64 = body.video.startsWith('data:video/');

        if (!laLinkKho && !laBase64) {
          console.warn(`[VIDEO] Bỏ qua video sai định dạng của ${trackingCode}`);
        } else if (laBase64 && body.video.length > 22 * 1024 * 1024) {
          /* Đường lui base64 chỉ cho tới ~16MB tệp thật. Lớn hơn thì phải qua
             kho ảnh, vì nhồi vào database sẽ ăn hết dung lượng chung. */
          console.warn(`[VIDEO] Bỏ qua video base64 quá lớn của ${trackingCode}`);
        } else {
          const kieu = laBase64
            ? ((body.video.match(/^data:(video\/[a-z0-9.+-]+);/i) || [])[1] || 'video/mp4')
            : 'video/mp4';
          await pool.query(
            `INSERT INTO submission_images
             (submission_id, image_url, storage, mime_type, is_verified, moderation_status)
             VALUES (?,?,?,?,?,?)`,
            [result.insertId, body.video, laLinkKho ? 'cloudinary' : 'base64', kieu, false, 'suspicious']
          );
          /* Có video -> đưa ý kiến vào hàng chờ duyệt để cán bộ xem trước. */
          await pool.query(
            `UPDATE submissions SET status = 'pending_review' WHERE id = ? AND status = 'received'`,
            [result.insertId]
          );
        }
      } catch (e) {
        console.warn('Không lưu được video đính kèm:', e.message);
      }
    }

    res.status(201).json({
      trackingCode,
      /* MÃ PIN VÀO PHÒNG CHAT — trả về ĐÚNG MỘT LẦN duy nhất.
         Database chỉ giữ bản băm bcrypt nên không cấp lại được. Màn hình xác
         nhận phải nhắc bà con lưu lại cùng mã tra cứu. */
      chatPin,
      pendingReview: isAnonymous,   // ẩn danh -> đang chờ cán bộ duyệt
      content,
      normalizedContent,
      category,
      contact: isAnonymous ? { fullName: 'Ẩn danh', phone: '' } : { fullName, phone, ...(email ? { email } : {}) },
      createdAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Lỗi gửi ý kiến:', err);
    res.status(500).json({ error: 'Lỗi máy chủ khi gửi ý kiến.' });
  }
});

/* ==========================================================================
   KIỂM TRA THIẾT BỊ CÓ ĐANG BỊ KHOÁ KHÔNG

   Giao diện gọi khi bà con mở trang Gửi ý kiến. Bị khoá thì hiện màn hình
   thông báo ngay, không để bà con điền hết năm bước rồi mới báo.

   ⚠️ CHỈ trả về CÓ/KHÔNG và thời gian còn lại. Không nói khoá theo thiết bị
   hay theo địa chỉ mạng, không nói vì hồ sơ nào — nói ra là chỉ đường cho kẻ
   phá hoại biết cách né.
   ========================================================================== */
router.post('/kiem-tra-khoa', async (req, res) => {
  try {
    const deviceId = layMaThietBi(req);
    const ip = layIpThat(req);
    if (!deviceId && !ip) return res.json({ biKhoa: false });

    const [rows] = await pool.query(
      `SELECT expires_at,
              TIMESTAMPDIFF(MINUTE, NOW(), expires_at) AS con_lai_phut
         FROM blacklists
        WHERE expires_at > NOW()
          AND (   (kind = 'device' AND identifier = ?)
               OR (kind = 'ip'     AND identifier = ?) )
        ORDER BY expires_at DESC
        LIMIT 1`,
      [deviceId || null, ip || null]
    );
    if (rows.length === 0) return res.json({ biKhoa: false });

    const phut = Math.max(1, Number(rows[0].con_lai_phut) || 1);
    res.json({
      biKhoa: true,
      conLaiPhut: phut,
      gio: Math.floor(phut / 60),
      phut: phut % 60,
    });
  } catch (err) {
    /* Bảng chưa tạo hoặc lỗi database -> KHÔNG chặn ai.
       Thà để lọt còn hơn chặn oan toàn bộ bà con vì một lỗi kỹ thuật. */
    console.warn('[kiểm tra khoá]', err.message);
    res.json({ biKhoa: false });
  }
});

export default router;
