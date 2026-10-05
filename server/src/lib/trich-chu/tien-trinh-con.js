/**
 * TIẾN TRÌNH CON TRÍCH CHỮ (P52, ADR-005) — chỉ được index.js cùng thư mục fork.
 * ============================================================================
 *
 * Mọi việc đọc tệp người ngoài gửi vào (giải nén Word, phân tích PDF, OCR) chạy
 * ở đây, KHÔNG ở tiến trình máy chủ chính:
 *   · Môi trường do tiến trình cha truyền vào KHÔNG có JWT_SECRET, ENCRYPTION_KEY,
 *     HASH_PEPPER, mật khẩu CSDL, proxy. Không có kết nối CSDL. Nhận byte, trả chữ.
 *   · Tự đặt oom_score_adj = 1000: máy hết bộ nhớ thì nhân Linux giết tiến trình
 *     này TRƯỚC, kênh tiếp nhận tin của người dân vẫn sống.
 *   · Treo hay quá giờ thì tiến trình cha giết hẳn và dựng lại cái mới.
 * KHÔNG phải hộp cát an ninh đầy đủ (cùng người dùng hệ điều hành với máy chủ) —
 * là thêm một lớp, không thay việc giữ thư viện đọc tệp luôn mới (ADR-005).
 */
import { writeFileSync } from 'node:fs';
import { docDocx } from './docx.js';
import { docPdf } from './pdf.js';
import { ocr } from './ocr.js';
import { kichThuocAnh, quaLon } from './anh.js';
import { chuanHoa } from '../chuan-hoa-van-ban.js';

try { writeFileSync('/proc/self/oom_score_adj', '1000'); } catch { /* không phải Linux — bỏ qua */ }

const MIME_DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const MIME_ANH = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/bmp']);

const thanhBuffer = (x) => (Buffer.isBuffer(x) ? x : Buffer.from(x.buffer, x.byteOffset, x.byteLength));

async function xuLy({ mime, duLieu, ngonNgu, ocrBat }) {
  const buf = thanhBuffer(duLieu);
  if (mime === MIME_DOCX) return docDocx(buf);
  if (mime === 'application/pdf') return docPdf(buf, { ocrBat, ngonNgu });
  if (MIME_ANH.has(mime)) {
    if (!ocrBat) throw new Error('OCR đang tắt trên máy chủ (TRICH_CHU_OCR=tat).');
    const kt = kichThuocAnh(buf);
    if (!kt) throw new Error('Không nhận ra định dạng ảnh — chưa hỗ trợ đọc chữ ảnh này.');
    if (quaLon(kt)) throw new Error(`Ảnh quá lớn để đọc chữ (${kt.rong} × ${kt.cao} điểm).`);
    const kq = await ocr(buf, { ngonNgu });
    return { ...kq, noiDung: chuanHoa(kq.noiDung), phuongPhap: 'ocr_anh', soTrang: 1, doTinCay: Math.round(kq.doTinCay) };
  }
  if (mime === 'application/msword') throw new Error('Word đời cũ (.doc) chưa hỗ trợ trích chữ — tải về mở bằng Word.');
  throw new Error('Loại tệp này chưa hỗ trợ trích chữ.');
}

process.on('message', async (tin) => {
  if (!tin || typeof tin !== 'object') return;
  if (tin.loai === 'moi-truong') {
    /* Cho kiểm thử xác nhận không có khoá bí mật — chỉ trả TÊN biến, không trả giá trị */
    process.send({ id: tin.id, ok: true, ketQua: Object.fromEntries(Object.keys(process.env).map((k) => [k, true])) });
    return;
  }
  try {
    process.send({ id: tin.id, ok: true, ketQua: await xuLy(tin) });
  } catch (e) {
    process.send({ id: tin.id, ok: false, loi: String(e?.message || e).slice(0, 300) });
  }
});
process.on('disconnect', () => process.exit(0));
process.on('uncaughtException', () => process.exit(1));
process.on('unhandledRejection', () => process.exit(1));
