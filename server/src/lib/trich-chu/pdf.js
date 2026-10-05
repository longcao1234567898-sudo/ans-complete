/**
 * ĐỌC CHỮ TRONG PDF (P52). CHỈ chạy trong tiến trình con.
 * ============================================================================
 *
 * Trang có LỚP CHỮ (PDF xuất từ Word): lấy thẳng lớp chữ — đúng từng ký tự,
 * nhanh. Trang KHÔNG có chữ mà có ảnh (PDF scan, chụp bằng ứng dụng quét):
 * lấy ảnh trang ra rồi OCR. PDF lẫn cả hai thì trang nào cần mới OCR trang đó.
 *
 * ⚠️ PDF LÀ ĐỊNH DẠNG CHẠY ĐƯỢC MÃ. pdf.js đặt:
 *    isEvalSupported: false   — không dựng hàm từ dữ liệu phông (đường khai
 *                               thác CVE-2024-4367 của pdf.js đời cũ);
 *    disableFontFace, useSystemFonts: false — không nạp phông nào;
 *    maxImageSize             — không giải mã ảnh khổng lồ.
 * Không bao giờ chạy JavaScript, mở liên kết, tệp nhúng trong PDF: pdf.js chỉ
 * được hỏi chữ và ảnh của trang.
 */
import { chuanHoa, coVeTcvn3 } from '../chuan-hoa-van-ban.js';
import { sangBmp } from './anh.js';
import { ocr } from './ocr.js';

/** Số trang tối đa đọc lớp chữ / OCR (OCR chậm: vài giây mỗi trang) */
export const TRANG_TOI_DA = 200;
/* 30 trang OCR (P52 là 10 — ND-052): đơn, biên bản người dân scan hiếm khi dài
   hơn. Mỗi trang ~2 giây trên máy thử; máy yếu chậm hơn vài lần — hết giờ của
   tiến trình con (index.js) nới theo */
export const TRANG_OCR_TOI_DA = 30;
/** Trang ít hơn chừng này ký tự mà có ảnh -> coi là trang scan */
const CHU_TOI_THIEU_MOT_TRANG = 25;

let pdfjs = null;
async function napPdfjs() {
  pdfjs ??= await import('pdfjs-dist/legacy/build/pdf.mjs');
  return pdfjs;
}

async function anhLonNhat(trang, lib) {
  const ops = await trang.getOperatorList();
  let tot = null;
  for (let k = 0; k < ops.fnArray.length; k += 1) {
    if (ops.fnArray[k] !== lib.OPS.paintImageXObject) continue;
    const anh = await new Promise((xong) => trang.objs.get(ops.argsArray[k][0], xong));
    if (!anh?.data || !anh.width || !anh.height || ![1, 2, 3].includes(anh.kind)) continue;
    if (anh.width * anh.height < 200 * 200) continue; // logo, con dấu nhỏ
    if (!tot || anh.width * anh.height > tot.width * tot.height) tot = anh;
  }
  return tot;
}

export async function docPdf(buf, { ocrBat = true, ngonNgu = null } = {}) {
  const lib = await napPdfjs();
  const nhiemVu = lib.getDocument({
    data: new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength),
    isEvalSupported: false,
    disableFontFace: true,
    useSystemFonts: false,
    isOffscreenCanvasSupported: false,
    maxImageSize: 25_000_000,
    verbosity: 0,
    stopAtErrors: false,
  });
  try {
    let tl;
    try {
      tl = await nhiemVu.promise;
    } catch (e) {
      if (e?.name === 'PasswordException') throw new Error('PDF có mật khẩu — tải về mở bằng mật khẩu.');
      throw new Error('Tệp PDF hỏng, không đọc được.');
    }
    const soTrang = Math.min(tl.numPages, TRANG_TOI_DA);
    const cacTrang = [];
    let soTrangOcr = 0;
    let boQuaScan = 0;
    let tongTinCay = 0;
    let ngonNguDung = null;
    let thuTiengAnh = false;
    for (let i = 1; i <= soTrang; i += 1) {
      const trang = await tl.getPage(i);
      const tc = await trang.getTextContent();
      let chu = tc.items.map((it) => (it.str ?? '') + (it.hasEOL ? '\n' : '')).join('');
      if (chu.replace(/\s/g, '').length < CHU_TOI_THIEU_MOT_TRANG) {
        const anh = await anhLonNhat(trang, lib);
        if (anh && ocrBat && soTrangOcr < TRANG_OCR_TOI_DA) {
          const kq = await ocr(sangBmp(anh), { ngonNgu });
          chu = kq.noiDung;
          soTrangOcr += 1;
          tongTinCay += kq.doTinCay;
          ngonNguDung = kq.ngonNgu;
          thuTiengAnh ||= kq.thuTiengAnh;
        } else if (anh) {
          boQuaScan += 1;
        }
      }
      cacTrang.push(chu);
      trang.cleanup();
    }
    const tho = cacTrang.length > 1
      ? cacTrang.map((c, i) => `— Trang ${i + 1} —\n${c}`).join('\n\n')
      : (cacTrang[0] ?? '');
    const noiDung = chuanHoa(tho, { doanTcvn3: true });
    if (!noiDung.replace(/— Trang \d+ —/g, '').trim()) {
      if (boQuaScan > 0) throw new Error('PDF scan cần OCR mà OCR đang tắt trên máy chủ (TRICH_CHU_OCR=tat).');
      throw new Error('PDF không có chữ nào đọc được.');
    }
    const ghiChu = [];
    if (tl.numPages > TRANG_TOI_DA) ghiChu.push(`Chỉ đọc ${TRANG_TOI_DA}/${tl.numPages} trang đầu.`);
    if (boQuaScan > 0) ghiChu.push(`${boQuaScan} trang scan chưa đọc (${ocrBat ? `chỉ OCR ${TRANG_OCR_TOI_DA} trang đầu` : 'OCR đang tắt'}).`);
    return {
      noiDung,
      phuongPhap: soTrangOcr > 0 ? 'ocr_pdf' : 'pdf_chu',
      soTrang: tl.numPages,
      doTinCay: soTrangOcr > 0 ? Math.round(tongTinCay / soTrangOcr) : null,
      ngonNgu: ngonNguDung,
      thuTiengAnh,
      daChuyenTcvn3: coVeTcvn3(tho),
      ghiChu: ghiChu.join(' ') || null,
    };
  } finally {
    await nhiemVu.destroy();
  }
}
