/**
 * XÁC MINH SỐ ĐIỆN THOẠI BẰNG MÃ GỬI QUA ZALO / SMS (P86)
 * ============================================================================
 *
 * VÌ SAO: tin có danh tính hiện cho điền số của bất kỳ ai. SIM ở Việt Nam đăng
 * ký chính chủ — người nhận được mã gửi về số đó mới đúng là người cầm số. Tin
 * có vé xác minh mang nhãn "Đã xác minh số điện thoại" cho cán bộ (P89). Không
 * xác minh vẫn gửi được ý kiến — nhãn chỉ giúp cán bộ biết số là thật.
 *
 * KHÔNG BAO GIỜ áp cho tin ẩn danh: số điện thoại + giờ nhận mã nằm ở nhà mạng
 * và nhà cung cấp tin nhắn — dấu vết ngoài tầm kiểm soát của hệ thống.
 *
 * Luồng:
 *   GET  /api/xac-minh-sdt/trang-thai            -> { bat, kenh: ['zalo', ...] }
 *   POST /api/xac-minh-sdt/gui-ma   { soDienThoai, phieuMoForm, veVaoCua, deviceId, kenh? }
 *        kenh: người dân tự chọn ("Không nhận được Zalo? Gửi qua SMS") — chỉ nhận
 *        kênh ĐANG MỞ trong KENH_XAC_MINH_SDT; SMS chưa mở thì không gửi được SMS
 *        -> { phien }: mã phiên gắn với ĐÚNG lần gửi này — bước xác nhận bắt buộc có
 *   POST /api/xac-minh-sdt/xac-nhan { soDienThoai, ma, phien } -> { veSdt } (sống 30 phút)
 *
 * MỖI MÃ GỬI ĐI LÀ TIỀN THẬT — 7 lớp chặn, kiểm ở máy chủ:
 *   1. Cổng "không phải người máy" (Turnstile, lib/cong-vao.js) trước khi gửi
 *   2. Phiếu mở form đã đủ 15 giây (đang điền ý kiến thật, không gọi thẳng API);
 *      mỗi phiếu / mỗi vé vào cửa xin tối đa 3 mã. Máy thật thiếu Turnstile -> TẮT
 *   3. Theo máy: 3 mã/giờ cho mỗi mã thiết bị (bắt buộc gửi kèm — bỏ trống không
 *      né được). Theo số: 1 mã/60 giây, 3 mã/giờ, 5 mã/ngày
 *   4. Theo mạng: 10 mã/giờ/IP (đã băm)
 *   5. Chỉ số di động Việt Nam 10 số — không bao giờ gửi ra số quốc tế
 *   6. Trần tin cả hệ thống mỗi ngày (XAC_MINH_TRAN_NGAY, mặc định 500).
 *      Chạm trần: NGỪNG GỬI MÃ, KHÔNG ngừng nhận ý kiến
 *   7. (Ngoài mã) gói trả trước ở nhà cung cấp — xem tài liệu triển khai
 * Mọi bộ đếm atomic (lib/dem-gioi-han.js). Lượt bị từ chối ở lớp sau vẫn đã tính
 * ở lớp trước — đếm dư, không đếm thiếu; lớp theo SỐ đứng sau cùng để lượt bị chặn
 * không khoá oan số của người khác.
 */
import { Router } from 'express';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { pool } from '../db.js';
import { layIpThat, khoaIp } from '../lib/helpers.js';
import { hashIdentifier } from '../lib/crypto.js';
import { normalizePhone, getPhoneError } from '../lib/security.js';
import { quaCongVao } from '../lib/cong-vao.js';
import { danhGiaThoiGianDien } from '../lib/phieu-mo-form.js';
import { bamPin, kiemPin } from '../lib/bam-pin.js';
import { giuLuot } from '../lib/dem-gioi-han.js';
import { cauHinhKenh, guiQuaKenh, NOI_DUNG_MA } from '../lib/kenh-gui-ma.js';
import '../lib/kenh/esms.js';
import { layMaThietBi } from '../lib/chan-spam.js';
import { JWT_SECRET } from '../lib/token.js';

const router = Router();

export const MA_SONG_PHUT = 5;
export const SAI_TOI_DA = 5;
export const VE_SONG = '30m';
const MUC_DICH_VE = 'sdt_xac_minh';
const MUC_DICH_PHIEN = 'sdt_phien_ma';
const TRAN_MAC_DINH = 500;

/** Trần tin/ngày. Sai dạng (chữ, 0, số âm) thì TẮT — không đoán, không bỏ trần. */
export function tranNgay(env = process.env) {
  const tho = String(env.XAC_MINH_TRAN_NGAY ?? '').trim();
  if (!tho) return TRAN_MAC_DINH;
  return /^\d+$/.test(tho) && Number(tho) > 0 ? Number(tho) : null;
}

/** Trạng thái tính năng: bật được không, lý do nếu không */
export function trangThai(env = process.env) {
  const kenh = cauHinhKenh(env);
  if (!kenh.bat) return kenh;
  /* Lớp 1 không được tự mở: cổng vào cho qua hết khi thiếu khoá Turnstile, nên
     máy thật thiếu khoá thì TẮT hẳn gửi mã — không gửi tin tốn tiền cho máy tự động.
     Allow-list: chỉ máy ghi rõ development/test mới chạy không cần Turnstile. */
  if (!['development', 'test'].includes(env.NODE_ENV) && !String(env.TURNSTILE_SECRET_KEY || '').trim()) {
    return { bat: false, danhSach: [], lyDo: 'chưa khai TURNSTILE_SECRET_KEY — không gửi mã khi chưa có chống máy tự động' };
  }
  if (tranNgay(env) === null) return { bat: false, danhSach: [], lyDo: 'XAC_MINH_TRAN_NGAY phải là số nguyên dương — TẮT gửi mã' };
  return kenh;
}

/** Ngày theo giờ Việt Nam — trần tính theo ngày ở phường, không theo UTC */
const ngayVN = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());

const daBaoTran = new Set();

/* BĂM RIÊNG CHO TÍNH NĂNG NÀY. Không dùng chung bản băm với submissions
   (ip_address, sender_phone_hash): dùng chung thì người đọc được CSDL nối
   "IP của một tin ẩn danh" -> bộ đếm gửi mã cùng giờ -> số điện thoại (mô hình
   đe doạ #2). Băm khác miền thì hai bảng không có cột nào trùng nhau. */
const bamRieng = (loai, v) => hashIdentifier(`xac-minh-sdt:${loai}:${v}`);

/** Số di động Việt Nam 10 số hợp lệ -> chuỗi số; không thì null */
function soDiDong(raw) {
  const p = normalizePhone(raw);
  return p.length === 10 && !getPhoneError(p) ? p : null;
}

const LOI_TAT = {
  error: 'Hệ thống tạm thời chưa gửi được mã xác nhận. Bà con vẫn gửi ý kiến bình thường (tin chỉ không có '
    + 'nhãn "đã xác minh số"). Việc khẩn cấp xin gọi ngay 113.',
  code: 'XAC_MINH_TAT',
};

/** Một dòng cho nhật ký lúc khởi động — biết ngay tính năng bật hay tắt, vì sao */
export function moTaXacMinhSdt() {
  const tt = trangThai();
  return tt.bat
    ? `📱 Mã xác minh số điện thoại: BẬT (kênh ${tt.danhSach.join(' → ')}, trần ${tranNgay()} tin/ngày)`
    : `📱 Mã xác minh số điện thoại: TẮT — ${tt.lyDo}`;
}

/* Giao diện cần biết kênh nào mở để hiện nút "Gửi qua SMS" — cấu hình công khai,
   không có gì bí mật */
router.get('/trang-thai', (_req, res) => {
  const tt = trangThai();
  res.json({ bat: tt.bat, kenh: tt.bat ? tt.danhSach : [] });
});

router.post('/gui-ma', async (req, res) => {
  const tt = trangThai();
  if (!tt.bat) return res.status(503).json(LOI_TAT);
  const body = req.body || {};
  const ip = layIpThat(req);

  // Lớp 1 — cổng chống máy tự động
  const cong = await quaCongVao(body, ip);
  if (!cong.ok) return res.status(403).json({ error: cong.error, code: cong.code });

  // Lớp 2 — đang điền form thật
  if (danhGiaThoiGianDien(body.phieuMoForm).nghiMay) {
    return res.status(429).json({
      error: 'Bà con điền nội dung ý kiến trước, rồi mới bấm gửi mã xác nhận.',
      code: 'CHUA_DIEN_FORM',
    });
  }

  // Lớp 5 — chỉ số di động Việt Nam
  const so = soDiDong(body.soDienThoai);
  if (!so) return res.status(400).json({ error: 'Chỉ gửi mã được tới số di động Việt Nam 10 số (03, 05, 07, 08, 09).' });

  /* Lớp 3 cần mã máy. Trình duyệt thật luôn có (utils/deviceId.ts); thiếu là gọi
     thẳng API — không cho bỏ trống để né giới hạn theo máy. Chỉ tin có danh tính
     mới xác minh số, nên đọc mã máy ở đây không đụng tin ẩn danh (BUG-014). */
  const maMay = layMaThietBi(req);
  if (!maMay) return res.status(400).json({ error: 'Trình duyệt chưa gửi mã thiết bị. Bà con tải lại trang rồi thử lại.' });

  /* Allow-list: chỉ kênh đang mở. Không nhận kiểu lạ, không tự đổi chữ hoa */
  let danhSachGui = tt.danhSach;
  if (body.kenh !== undefined && body.kenh !== null) {
    if (typeof body.kenh !== 'string' || !tt.danhSach.includes(body.kenh)) {
      return res.status(400).json({ error: 'Kênh gửi mã này chưa mở.', code: 'KENH_CHUA_MO' });
    }
    danhSachGui = [body.kenh];
  }

  try {
    const sdtBam = bamRieng('sdt', so);
    const tran = tranNgay();

    /* Thứ tự: theo mạng và theo phiếu TRƯỚC, theo số SAU — lượt bị chặn ở lớp
       trước không được ăn hạn mức của số. Không thế thì kẻ xấu dùng một mạng đã
       hết lượt bấm 5 lần cho số của người khác là khoá người đó 24 giờ mà không
       tốn tin nào. */
    const loiNhieu = { error: 'Số này đã yêu cầu nhiều mã. Vui lòng thử lại sau, hoặc gửi ý kiến không cần xác minh số.', code: 'QUA_NHIEU_MA' };
    // Lớp 4 — theo mạng
    if (!(await giuLuot(pool, `ip-gio:${bamRieng('ip', khoaIp(req)).slice(0, 32)}`, 10, 3600))) return res.status(429).json(loiNhieu);
    // Lớp 2 — một phiếu mở form / một vé vào cửa chỉ xin được vài mã (phiếu sống 1 ngày, dùng lại được)
    if (!(await giuLuot(pool, `phieu:${bamRieng('phieu', body.phieuMoForm).slice(0, 40)}`, 3, 86400))) return res.status(429).json(loiNhieu);
    if (typeof body.veVaoCua === 'string' && body.veVaoCua
        && !(await giuLuot(pool, `ve:${bamRieng('ve', body.veVaoCua).slice(0, 40)}`, 3, 6 * 3600))) return res.status(429).json(loiNhieu);
    // Lớp 3 — theo máy, TRƯỚC theo số: máy hết lượt không được ăn hạn mức số người khác
    if (!(await giuLuot(pool, `thiet-bi-gio:${bamRieng('tb', maMay).slice(0, 40)}`, 3, 3600))) {
      return res.status(429).json({ error: 'Máy này đã yêu cầu 3 mã trong 1 giờ. Vui lòng thử lại sau, hoặc gửi ý kiến không cần xác minh số.', code: 'QUA_NHIEU_MA' });
    }
    // Lớp 3 — theo số
    const loiCho = { error: 'Bà con vừa yêu cầu mã. Vui lòng chờ 1 phút rồi thử lại.', code: 'CHO_GUI_LAI' };
    if (!(await giuLuot(pool, `sdt-phut:${sdtBam}`, 1, 60))) return res.status(429).json(loiCho);
    if (!(await giuLuot(pool, `sdt-gio:${sdtBam}`, 3, 3600))) return res.status(429).json(loiNhieu);
    if (!(await giuLuot(pool, `sdt-ngay:${sdtBam}`, 5, 86400))) return res.status(429).json(loiNhieu);

    /* Lớp 6 — trần tin cả hệ thống mỗi ngày, trừ cho TỪNG tin có thể bị tính tiền
       (Zalo từ chối rồi sang SMS là hai lượt). Khoá theo ngày VN; cửa sổ dài hơn
       một ngày cho chắc. */
    const ngay = ngayVN();
    const truTran = async () => {
      if (await giuLuot(pool, `tran-ngay:${ngay}`, tran, 26 * 3600)) return true;
      if (!daBaoTran.has(ngay)) {
        daBaoTran.add(ngay);
        console.error(`🔴 [gửi mã] CHẠM TRẦN ${tran} tin hôm ${ngay} — ngừng gửi mã tới hết ngày. Ý kiến vẫn nhận bình thường. Xem có bị phá không.`);
      }
      return false;
    };

    /* Không giữ lịch sử "số nào nhận mã lúc nào" quá một ngày */
    await pool.query('DELETE FROM ma_xac_minh_sdt WHERE tao_luc < NOW() - INTERVAL 1 DAY');

    // Huỷ mã cũ chưa dùng của số này, tạo mã mới
    await pool.query('UPDATE ma_xac_minh_sdt SET da_dung = 1 WHERE sdt_bam = ? AND da_dung = 0', [sdtBam]);
    const ma = String(crypto.randomInt(100000, 1_000_000));
    const [kq] = await pool.query(
      `INSERT INTO ma_xac_minh_sdt (sdt_bam, ma_bam, kenh, het_han, tao_luc) VALUES (?, ?, ?, NOW() + INTERVAL ? MINUTE, NOW())`,
      [sdtBam, await bamPin(ma), danhSachGui[0], MA_SONG_PHUT]
    );

    const gui = await guiQuaKenh(danhSachGui, { soDienThoai: so, noiDung: NOI_DUNG_MA(ma, MA_SONG_PHUT), ma }, truTran);
    if (!gui.ok) {
      await pool.query('UPDATE ma_xac_minh_sdt SET da_dung = 1 WHERE id = ?', [kq.insertId]);
      if (gui.lyDo === 'het_tran') return res.status(503).json(LOI_TAT);
      return res.status(502).json({
        error: 'Chưa gửi được mã tới số này. Bà con kiểm tra lại số, hoặc gửi ý kiến không cần xác minh số.',
      });
    }
    if (gui.kenh !== danhSachGui[0]) {
      await pool.query('UPDATE ma_xac_minh_sdt SET kenh = ? WHERE id = ?', [gui.kenh, kq.insertId]);
    }

    res.json({
      ok: true,
      kenh: gui.kenh,
      hetHanPhut: MA_SONG_PHUT,
      /* BUG-042: chỉ máy vừa xin mã mới cầm phiên — người ngoài không dò được số
         nào đang có mã chờ, không đốt được lượt nhập của người khác */
      phien: jwt.sign({ purpose: MUC_DICH_PHIEN, id: Number(kq.insertId), sdt: sdtBam }, JWT_SECRET, { expiresIn: `${MA_SONG_PHUT + 5}m` }),
      /* Chỉ kênh thử (đã bị chặn ở production trong cauHinhKenh) mới trả mã */
      ...(gui.kenh === 'thu' ? { maThu: ma } : {}),
    });
  } catch (err) {
    if (err.code === 'ER_NO_SUCH_TABLE') {
      console.error('🔴 [gửi mã] thiếu bảng — chạy database/nang_cap_v38.sql');
      return res.status(503).json(LOI_TAT);
    }
    console.error('[gửi mã] lỗi:', err.message);
    res.status(500).json({ error: 'Không gửi được mã. Bà con thử lại sau.' });
  }
});

/** Mã phiên hợp lệ cho số này -> id dòng mã; không thì null. Không đụng CSDL */
function idTuPhien(phien, sdtBam) {
  if (typeof phien !== 'string' || !phien) return null;
  try {
    const p = jwt.verify(phien, JWT_SECRET, { algorithms: ['HS256'] });
    return p.purpose === MUC_DICH_PHIEN && p.sdt === sdtBam && Number.isSafeInteger(p.id) ? p.id : null;
  } catch {
    return null;
  }
}

router.post('/xac-nhan', async (req, res) => {
  const so = soDiDong(req.body?.soDienThoai);
  const ma = String(req.body?.ma ?? '').trim();
  if (!so) return res.status(400).json({ error: 'Số điện thoại không hợp lệ.' });
  if (!/^\d{6}$/.test(ma)) return res.status(400).json({ error: 'Mã xác nhận gồm 6 chữ số.' });
  const loiSai = { error: 'Mã xác nhận không đúng hoặc đã hết hạn. Bà con bấm gửi lại mã.' };
  try {
    const sdtBam = bamRieng('sdt', so);
    /* BUG-042: KHÔNG có phiên của chính lần gửi này thì trả lời ngay, cùng một câu,
       không tra CSDL, không chạy scrypt — trước đây số có mã chờ trả chậm hơn hẳn
       (lộ "số này đang gửi ý kiến") và 5 lượt sai của người ngoài huỷ mã người thật */
    const idPhien = idTuPhien(req.body?.phien, sdtBam);
    if (!idPhien) return res.status(400).json(loiSai);
    const [rows] = await pool.query(
      `SELECT id, ma_bam FROM ma_xac_minh_sdt
        WHERE id = ? AND sdt_bam = ? AND da_dung = 0 AND het_han > NOW()`,
      [idPhien, sdtBam]
    );
    if (rows.length === 0) return res.status(400).json(loiSai);
    const { id, ma_bam: maBam } = rows[0];

    /* Giành lượt thử TRƯỚC khi so mã — gửi dồn cũng chỉ SAI_TOI_DA lượt được so */
    const [luot] = await pool.query(
      'UPDATE ma_xac_minh_sdt SET so_lan_sai = so_lan_sai + 1 WHERE id = ? AND da_dung = 0 AND so_lan_sai < ?',
      [id, SAI_TOI_DA]
    );
    if (luot.affectedRows !== 1) {
      return res.status(429).json({ error: 'Nhập sai quá nhiều lần, mã đã bị huỷ. Bà con bấm gửi lại mã.' });
    }
    if (!(await kiemPin(ma, maBam))) return res.status(400).json(loiSai);

    /* Dùng một lần: chỉ một yêu cầu đổi được da_dung 0 -> 1 */
    const [dung] = await pool.query('UPDATE ma_xac_minh_sdt SET da_dung = 1 WHERE id = ? AND da_dung = 0', [id]);
    if (dung.affectedRows !== 1) return res.status(400).json(loiSai);

    const veSdt = jwt.sign({ purpose: MUC_DICH_VE, sdt: sdtBam }, JWT_SECRET, { expiresIn: VE_SONG });
    res.json({ ok: true, veSdt });
  } catch (err) {
    if (err.code === 'ER_NO_SUCH_TABLE') return res.status(503).json(LOI_TAT);
    console.error('[xác nhận mã] lỗi:', err.message);
    res.status(500).json({ error: 'Không kiểm được mã. Bà con thử lại sau.' });
  }
});

/**
 * Vé xác minh có đúng là của số điện thoại này không. Dùng ở bước gửi ý kiến
 * (phiên sau) để gắn nhãn "đã xác minh số". Sai, hết hạn, khác số -> false.
 */
export function veSdtHopLe(ve, soDienThoai) {
  if (typeof ve !== 'string' || !ve) return false;
  const so = soDiDong(soDienThoai);
  if (!so) return false;
  try {
    const p = jwt.verify(ve, JWT_SECRET, { algorithms: ['HS256'] });
    return p.purpose === MUC_DICH_VE && p.sdt === bamRieng('sdt', so);
  } catch {
    return false;
  }
}

export default router;
