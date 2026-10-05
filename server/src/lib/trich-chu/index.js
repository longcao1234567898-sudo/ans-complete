/**
 * TRÍCH CHỮ TỆP ĐÍNH KÈM — phía máy chủ chính (P52, ADR-005)
 * ============================================================================
 *
 * Gửi từng tệp sang tiến trình con (tien-trinh-con.js) và chờ chữ trả về.
 *   · MỘT việc một lúc: OCR ăn hết một lõi CPU và cả trăm MB bộ nhớ; chạy song
 *     song trên máy chủ nhỏ là kéo chậm cả việc nhận tin của người dân.
 *   · Quá giờ -> giết tiến trình con, lượt sau dựng cái mới.
 *   · Rảnh 3 phút -> tắt tiến trình con, trả lại bộ nhớ của mô hình OCR.
 *   · TRICH_CHU_OCR=tat: không OCR ảnh / PDF scan (máy chủ quá yếu); Word và PDF
 *     có lớp chữ vẫn đọc vì rất nhẹ.
 * Tiến trình con nhận môi trường TỐI THIỂU — không khoá bí mật nào đi theo.
 */
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const NGON_NGU_OCR = ['vie', 'eng', 'vie+eng'];
/** PDF scan 10 trang trên máy chủ yếu có thể mất vài phút */
export const HET_GIO_MS = 180_000;
const NGHI_SAU_MS = 3 * 60_000;
const DUONG_CON = fileURLToPath(new URL('./tien-trinh-con.js', import.meta.url));

export const ocrDangBat = () => (process.env.TRICH_CHU_OCR ?? '').trim().toLowerCase() !== 'tat';

let con = null;
let soThuTu = 0;
let hangCho = Promise.resolve();
let henNghi = null;
const dangCho = new Map();

function moiTruongCon() {
  /* Liệt kê CÁI ĐƯỢC ĐI (allow-list), không lọc cái cấm: thêm khoá mới vào
     .env sau này cũng không tự lọt sang tiến trình đọc tệp lạ */
  const env = { NODE_ENV: process.env.NODE_ENV || 'production' };
  if (process.env.TMPDIR) env.TMPDIR = process.env.TMPDIR;
  return env;
}

function layCon() {
  if (con) return con;
  const c = fork(DUONG_CON, [], {
    env: moiTruongCon(),
    execArgv: ['--max-old-space-size=384'],
    serialization: 'advanced',
    stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
  });
  c.on('message', (tin) => {
    const cho = dangCho.get(tin?.id);
    if (cho) { dangCho.delete(tin.id); cho(tin); }
  });
  c.on('exit', () => {
    if (con === c) con = null;
    for (const [id, cho] of dangCho) {
      if (cho.con === c) { dangCho.delete(id); cho({ ok: false, loi: 'Tiến trình trích chữ dừng đột ngột (có thể hết bộ nhớ).' }); }
    }
  });
  c.on('error', () => {});
  con = c;
  return c;
}

export function dungTienTrinhCon() {
  clearTimeout(henNghi);
  if (con) { const c = con; con = null; c.kill('SIGKILL'); }
}

function goiCon(tin, hetGioMs) {
  return new Promise((xong, hong) => {
    const c = layCon();
    const id = ++soThuTu;
    const dongHo = setTimeout(() => {
      dangCho.delete(id);
      if (con === c) con = null;
      c.kill('SIGKILL');
      hong(new Error('Trích chữ quá thời gian cho phép — tệp quá nặng hoặc quá nhiều trang.'));
    }, hetGioMs);
    const cho = (kq) => { clearTimeout(dongHo); if (kq.ok) xong(kq.ketQua); else hong(new Error(kq.loi)); };
    cho.con = c;
    dangCho.set(id, cho);
    c.send({ ...tin, id });
  });
}

function xepHang(viec) {
  const lan = hangCho.then(viec);
  hangCho = lan.catch(() => {});
  lan.finally(() => {
    clearTimeout(henNghi);
    henNghi = setTimeout(dungTienTrinhCon, NGHI_SAU_MS);
    henNghi.unref?.();
  }).catch(() => {});
  return lan;
}

/**
 * Trích chữ một tệp. Trả { noiDung, phuongPhap, soTrang, doTinCay, ngonNgu,
 * thuTiengAnh, daChuyenTcvn3, ghiChu } — hoặc ném lỗi có lời giải thích cho cán bộ.
 */
export function trichChu({ mime, duLieu, ngonNgu = null }, { hetGioMs = HET_GIO_MS } = {}) {
  if (ngonNgu !== null && !NGON_NGU_OCR.includes(ngonNgu)) {
    return Promise.reject(new Error('Chọn ngôn ngữ OCR không hợp lệ (chỉ vie, eng, vie+eng).'));
  }
  return xepHang(() => goiCon({ loai: 'trich', mime: String(mime), duLieu, ngonNgu, ocrBat: ocrDangBat() }, hetGioMs));
}

/** Cho kiểm thử: tên các biến môi trường tiến trình con nhìn thấy */
export const xemMoiTruongCon = () => xepHang(() => goiCon({ loai: 'moi-truong' }, 15_000));
