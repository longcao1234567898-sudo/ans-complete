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
 *      Phông VNI (VNI-Times, VNI-Helve...) — chữ Việt thành HAI ký tự Latin-1,
 *      chữ gốc + ký tự dấu ("Coäng hoøa xaõ hoäi"). Chuyển về Unicode (ND-052).
 *   3. Khoảng trắng lạ, ký tự điều khiển, dòng trống thừa.
 *   4. Bản KHÔNG DẤU để tìm kiếm: gõ "hoa binh" ra cả "Hoà Bình", "Hòa Bình".
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

/* ===== VNI =====
   Chữ gốc + một ký tự dấu: năm dấu thanh (ù sắc, ø huyền, û hỏi, õ ngã, ï nặng);
   mũ â/ê/ô (â, rồi á à å ã ä = mũ + dấu); trăng ă (ê, rồi é è ú ü ë = trăng +
   dấu); ơ = ô, ư = ö (+ dấu thanh); đ = ñ; i có dấu là một ký tự (í ì æ ó ò);
   ỵ = î. Bảng DỰNG THEO QUY TẮC đó, không chép tay từng ô — rồi đối chiếu với một
   bảng độc lập trong test (tests/fixtures/bang-vni-doi-chieu.json): khớp 130/134,
   bốn ô lệch (ỷ ỹ Ỷ Ỹ) bảng kia tự mâu thuẫn (trùng mã của "ì" và của dấu "ặ"). */
const TO_HOP_THANH = ['\u0301', '\u0300', '\u0309', '\u0303', '\u0323'];
const VNI_THANH = 'ùøûõï';
const VNI_MU = 'áàåãä';
const VNI_TRANG = 'éèúüë';
const VNI_I = 'íìæóò';
const BANG_VNI = (() => {
  const m = new Map();
  const nfc = (s) => s.normalize('NFC');
  for (const v of 'aeouy') {
    for (let t = 0; t < 5; t += 1) {
      if (v === 'y' && t === 4) m.set('î', 'ỵ');
      else m.set(v + VNI_THANH[t], nfc(v + TO_HOP_THANH[t]));
    }
  }
  for (let t = 0; t < 5; t += 1) m.set(VNI_I[t], nfc('i' + TO_HOP_THANH[t]));
  for (const v of 'aeo') {
    m.set(`${v}â`, nfc(`${v}\u0302`));
    for (let t = 0; t < 5; t += 1) m.set(v + VNI_MU[t], nfc(`${v}\u0302${TO_HOP_THANH[t]}`));
  }
  m.set('aê', 'ă');
  for (let t = 0; t < 5; t += 1) m.set(`a${VNI_TRANG[t]}`, nfc(`a\u0306${TO_HOP_THANH[t]}`));
  for (const [goc, chu] of [['ô', 'o'], ['ö', 'u']]) {
    m.set(goc, nfc(`${chu}\u031b`));
    for (let t = 0; t < 5; t += 1) m.set(goc + VNI_THANH[t], nfc(`${chu}\u031b${TO_HOP_THANH[t]}`));
  }
  m.set('ñ', 'đ');
  /* Chữ hoa: cả cặp hoa ("AÙ"), và chữ gốc hoa + dấu thường ("Aù") — hoa thường của
     kết quả theo chữ gốc */
  for (const [k, v] of [...m]) {
    m.set(k.toUpperCase(), v.toUpperCase());
    if (k.length === 2) m.set(k[0].toUpperCase() + k[1], v.toUpperCase());
  }
  return m;
})();

/** Chuyển chữ gõ phông VNI sang Unicode — ghép hai ký tự trước, rồi một ký tự */
export function vniSangUnicode(s) {
  const k = [...String(s)];
  let ra = '';
  for (let i = 0; i < k.length; i += 1) {
    const cap = BANG_VNI.get(k[i] + (k[i + 1] ?? ''));
    if (cap && k[i + 1] !== undefined) { ra += cap; i += 1; continue; }
    ra += BANG_VNI.get(k[i]) ?? k[i];
  }
  return ra;
}

/** Ký tự Latin-1 mà chữ Việt Unicode không bao giờ dùng — chỉ phông cũ mới có */
const DAU_VNI_MANH = new Set('øûïäåëüæîñöØÛÏÄÅËÜÆÎÑÖ');
/** Byte A1–BF: TCVN3 dùng rất nhiều (á à ả ã ạ ê ô ơ ư đ ă â), VNI không dùng */
const CHI_TCVN3 = /[\u00a1-\u00bf]/;
const DAU_THANH_VNI = new Set([...VNI_THANH, ...VNI_THANH.toUpperCase()]);
const DAU_MU_VNI = new Set([...`â${VNI_MU}`, ...`â${VNI_MU}`.toUpperCase()]);
const DAU_TRANG_VNI = new Set([...`ê${VNI_TRANG}`, ...`ê${VNI_TRANG}`.toUpperCase()]);

/**
 * Chấm điểm một đoạn: VNI có dấu LUÔN đi sau nguyên âm ("oø"), không bao giờ sau
 * phụ âm; TCVN3 thì ký tự có dấu đứng thẳng sau phụ âm ("Céng") và dùng nhiều byte
 * A1–BF. Văn bản Unicode thật ("Hoà Bình") có "oà" nhưng không có dấu hiệu mạnh.
 */
function diemVni(s) {
  const k = [...s];
  let cap = 0; let sauPhuAm = 0; let manh = 0; let chiTcvn3 = 0;
  for (let i = 0; i < k.length; i += 1) {
    const c = k[i]; const truoc = k[i - 1] ?? '';
    if (DAU_VNI_MANH.has(c)) manh += 1;
    if (CHI_TCVN3.test(c) && (laChuAscii(truoc) || laChuAscii(k[i + 1]))) chiTcvn3 += 1;
    const laDau = DAU_THANH_VNI.has(c) || DAU_MU_VNI.has(c) || DAU_TRANG_VNI.has(c);
    if (!laDau) continue;
    if ((DAU_MU_VNI.has(c) && /[aeoAEO]/.test(truoc))
      || (DAU_TRANG_VNI.has(c) && /[aA]/.test(truoc))
      || (DAU_THANH_VNI.has(c) && /[aeouyAEOUYôöÔÖ]/.test(truoc))) cap += 1;
    else if (/[b-df-hj-np-tv-zB-DF-HJ-NP-TV-Z]/.test(truoc)) sauPhuAm += 1;
  }
  return { cap, sauPhuAm, manh, chiTcvn3 };
}

/** Đoạn này gõ phông cũ nào: 'vni' | 'tcvn3' | null. `nguong`: số dấu hiệu tối thiểu */
function loaiMaCu(s, nguong) {
  const d = diemVni(s);
  if (d.cap >= nguong && d.manh >= Math.ceil(nguong / 3)
      && d.sauPhuAm * 4 <= d.cap && d.chiTcvn3 * 4 <= d.cap) return 'vni';
  if (demDauSatChu(s) >= nguong) return 'tcvn3';
  return null;
}

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
 * Văn bản không biết phông (lớp chữ PDF, Word .doc): đoán từng dòng có phải phông
 * cũ (TCVN3 hay VNI) không.
 *   · Các dòng không có chữ Việt Unicode, gộp lại, có nhiều dấu hiệu -> chúng là
 *     phông đó, chuyển hết.
 *   · Còn lại: chuyển dòng nào không có chữ Việt Unicode và có từ 2 dấu hiệu sát
 *     chữ cái trở lên. Dòng "5 × 3 · 2", "Hoà Bình" không bị đụng.
 * TCVN3: dòng có toàn chữ ASCII viết hoa -> in hoa cả dòng (gõ bằng phông chữ hoa).
 */
export function suaMaCuTheoDong(text) {
  const dong = String(text).split('\n');
  /* "Cả bài" tính trên các dòng KHÔNG có chữ Việt Unicode: văn bản trộn (tiêu đề
     Unicode, thân gõ VNI) thì dòng ngắn của phần phông cũ ("Xin chaøo", tên
     người) vẫn được chuyển theo cả phần, không phải tự đủ 2 dấu hiệu */
  const dongCu = dong.filter((d) => !CHU_VIET_UNICODE.test(d)).join('\n');
  let caBai = loaiMaCu(dongCu, 10);
  /* TCVN3 giữ luật P52 (chỉ khi cả văn bản không có chữ Việt Unicode): bảng TCVN3
     phủ gần hết Latin-1 nên dòng Unicode "Giá 5 × 3 · 2" cũng bị đổi nếu chuyển
     theo phần. VNI chỉ đổi khi ghép đúng cặp nguyên âm + dấu — dòng đó không sao */
  if (caBai === 'tcvn3' && CHU_VIET_UNICODE.test(text)) caBai = null;
  return dong.map((d) => {
    if (CHU_VIET_UNICODE.test(d)) return d;
    const loai = caBai ?? loaiMaCu(d, 2);
    if (loai === 'vni') return vniSangUnicode(d);
    if (loai === 'tcvn3') return chuyenDong(d);
    return d;
  }).join('\n');
}
/** Tên cũ (P52) — nay đoán cả VNI */
export const suaTcvn3TheoDong = suaMaCuTheoDong;

/** Có dòng nào sẽ bị suaMaCuTheoDong chuyển không */
export const coVeMaCu = (text) => suaMaCuTheoDong(text) !== String(text);
export const coVeTcvn3 = coVeMaCu;

/**
 * Chuẩn hoá chữ trích được. `doanTcvn3`: bật đoán phông cũ TCVN3 / VNI theo dòng (lớp chữ PDF, .doc);
 * Word thì đã chuyển theo phông từng đoạn từ trước nên không cần đoán.
 */
export function chuanHoa(text, { doanTcvn3 = false } = {}) {
  let s = String(text ?? '').replace(/\r\n?/g, '\n');
  /* Đoán phông cũ TRƯỚC khi bỏ gạch mềm: trong TCVN3, gạch mềm (AD) là chữ "ư" */
  if (doanTcvn3) s = suaMaCuTheoDong(s);
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
