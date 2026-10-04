/**
 * CHUẨN HOÁ VĂN BẢN TRÍCH TỪ TỆP ĐÍNH KÈM (P52, ADR-005)
 * ============================================================================
 *
 * Chữ lấy ra từ Word, PDF, ảnh đến từ đủ nguồn: bàn phím Unikey kiểu dựng sẵn
 * hay tổ hợp, phông .VnTime đời cũ, máy quét, OCR. Không chuẩn hoá thì cùng một
 * chữ "Nguyễn" có ba cách lưu, cán bộ gõ tìm không ra.
 *
 *   1. Unicode NFC — chữ tổ hợp (e + dấu mũ + dấu ngã) gộp về chữ dựng sẵn.
 *   2. Phông TCVN3 (.VnTime, .VnArial...) — văn bản hành chính cũ lưu chữ Việt
 *      thành ký tự Latin-1 ("Céng hßa x· héi"). Chuyển về Unicode. Bảng mã lấy
 *      từ iconv TCVN5712-1 (glibc), không chép tay.
 *   3. Khoảng trắng lạ, ký tự điều khiển, dòng trống thừa.
 *   4. Bản KHÔNG DẤU để tìm kiếm: gõ "hoa binh" ra cả "Hoà Bình", "Hòa Bình".
 *
 * Chưa làm: phông VNI (chữ Việt mã hai byte) — ghi ở NO-KY-THUAT ND-052.
 */

/** Trần độ dài chữ lưu cho một tệp — đủ cho vài trăm trang đơn từ */
export const DO_DAI_TOI_DA = 200_000;

/* Bảng TCVN3: byte A1–AF, B5–FC, FE, FF (B0–B4 là dấu rời, FD là "ý" trùng Latin-1) */
const TCVN3_NGUON = [
  ...Array.from({ length: 0xaf - 0xa1 + 1 }, (_, i) => 0xa1 + i),
  ...Array.from({ length: 0xfc - 0xb5 + 1 }, (_, i) => 0xb5 + i),
  0xfe, 0xff,
].map((b) => String.fromCharCode(b)).join('');
const TCVN3_DICH = 'ĂÂÊÔƠƯĐăâêôơưđẰàảãáạẲằẳẵắẴẮẦẨẪẤỀặầẩẫấậèỂẻẽéẹềểễếệìỉỄẾỒĩíịòỔỏõóọồổỗốộờởỡớợùỖủũúụừửữứựỳỷỹỵỐ';
const BANG_TCVN3 = new Map([...TCVN3_NGUON].map((c, i) => [c, TCVN3_DICH[i]]));
/* Trình đọc PDF hay đổi µ (micro, B5 = "à") thành μ (Hy Lạp) */
BANG_TCVN3.set('μ', 'à');

/** Chữ Latin-1 cũng là chữ Việt hợp lệ — có mặt không chứng tỏ là TCVN3 */
const LATIN1_TIENG_VIET = new Set('ÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚÝàáâãèéêìíòóôõùúý');
/** Dấu hiệu TCVN3: ký tự của bảng mà văn bản tiếng Việt Unicode không dùng */
const DAU_TCVN3 = new Set([...BANG_TCVN3.keys()].filter((c) => !LATIN1_TIENG_VIET.has(c)));
/** Chữ CHỈ tiếng Việt Unicode mới có — có mặt là dòng đã là Unicode */
const CHU_VIET_UNICODE = /[ăđơưĂĐƠƯẠ-ỹ]/;

/**
 * Chuyển chữ gõ phông TCVN3 sang Unicode.
 * `inHoa`: phông chữ hoa (.VnTimeH, .VnArialH) — byte là chữ thường, hình là chữ hoa.
 */
export function tcvn3SangUnicode(s, { inHoa = false } = {}) {
  let ra = '';
  for (const c of String(s)) ra += BANG_TCVN3.get(c) ?? c;
  return inHoa ? ra.toUpperCase() : ra;
}

const laChuAscii = (c) => /[A-Za-z]/.test(c ?? '');

/** Số dấu hiệu TCVN3 nằm sát chữ cái ASCII — "hßa", "x·" — không tính "5 × 3" */
function demDauSatChu(dong) {
  const k = [...dong];
  let n = 0;
  for (let i = 0; i < k.length; i += 1) {
    if (DAU_TCVN3.has(k[i]) && (laChuAscii(k[i - 1]) || laChuAscii(k[i + 1]))) n += 1;
  }
  return n;
}

function chuyenDong(dong) {
  const ascii = dong.match(/[A-Za-z]/g) || [];
  const toanHoa = ascii.length >= 3 && ascii.every((c) => c === c.toUpperCase());
  return tcvn3SangUnicode(dong, { inHoa: toanHoa });
}

/**
 * Văn bản không biết phông (lớp chữ PDF): đoán từng dòng có phải TCVN3 không.
 *   · Cả văn bản không có chữ Việt Unicode nào mà có nhiều dấu hiệu TCVN3 sát chữ
 *     -> cả văn bản là TCVN3, chuyển hết.
 *   · Còn lại: chuyển dòng nào không có chữ Việt Unicode và có từ 2 dấu hiệu
 *     TCVN3 sát chữ cái trở lên. Dòng "5 × 3 · 2" không bị đụng.
 * Dòng có toàn chữ ASCII viết hoa -> in hoa cả dòng (gõ bằng phông chữ hoa).
 */
export function suaTcvn3TheoDong(text) {
  const dong = String(text).split('\n');
  const caBai = !CHU_VIET_UNICODE.test(text) && demDauSatChu(text) >= 10;
  return dong.map((d) => {
    if (CHU_VIET_UNICODE.test(d)) return d;
    if (caBai || demDauSatChu(d) >= 2) return chuyenDong(d);
    return d;
  }).join('\n');
}

/** Có dòng nào sẽ bị suaTcvn3TheoDong chuyển không */
export const coVeTcvn3 = (text) => suaTcvn3TheoDong(text) !== String(text);

/**
 * Chuẩn hoá chữ trích được. `doanTcvn3`: bật đoán TCVN3 theo dòng (lớp chữ PDF);
 * Word thì đã chuyển theo phông từng đoạn từ trước nên không cần đoán.
 */
export function chuanHoa(text, { doanTcvn3 = false } = {}) {
  let s = String(text ?? '').replace(/\r\n?/g, '\n');
  /* Đoán TCVN3 TRƯỚC khi bỏ gạch mềm: trong TCVN3, gạch mềm (AD) là chữ "ư" */
  if (doanTcvn3) s = suaTcvn3TheoDong(s);
  s = s.normalize('NFC')
    .replace(/[​-‍⁠﻿­]/g, '')
    .replace(/[  -   　]/g, ' ')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g, '');
  s = s.split('\n').map((d) => d.replace(/[ \t]+/g, ' ').trim()).join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return s.length > DO_DAI_TOI_DA ? s.slice(0, DO_DAI_TOI_DA) : s;
}

/** Dạng để TÌM: không dấu, chữ thường, đ -> d, một khoảng trắng */
export function dangTim(text) {
  return String(text ?? '').normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}
