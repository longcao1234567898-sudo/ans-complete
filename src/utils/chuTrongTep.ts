/**
 * CHỮ TRONG TỆP ĐÍNH KÈM — nhãn hiển thị và tô từ khoá (P52, ADR-005).
 * Hàm thuần, không phụ thuộc React — kiểm được bằng node --test.
 */

export const NHAN_LOAI_TEP: Record<string, string> = {
  anh: 'Ảnh', pdf: 'PDF', word: 'Word', video: 'Video', khac: 'Tệp',
};

export const NHAN_TRANG_THAI_TRICH: Record<string, string> = {
  chua: 'Chưa trích',
  cho: 'Đang chờ',
  dang_lam: 'Đang đọc…',
  xong: 'Đã trích',
  loi: 'Không trích được',
};

export const TEN_NGON_NGU: Record<string, string> = {
  vie: 'Tiếng Việt',
  eng: 'Tiếng Anh',
  'vie+eng': 'Việt + Anh',
};

/** Một dòng mô tả chữ này lấy ra bằng cách nào — để cán bộ biết tin đến đâu */
export function moTaPhuongPhap(t: { phuongPhap: string | null; soTrang: number | null; doTinCay: number | null; ngonNgu: string | null }): string {
  const nn = t.ngonNgu ? ` · ${TEN_NGON_NGU[t.ngonNgu] ?? t.ngonNgu}` : '';
  const tinCay = t.doTinCay != null ? ` · máy tự đánh giá độ tin cậy ${t.doTinCay}%` : '';
  switch (t.phuongPhap) {
    case 'docx': return 'Đọc thẳng chữ trong tệp Word — đúng từng ký tự';
    case 'doc': return 'Đọc thẳng chữ trong tệp Word đời cũ (.doc) — đúng từng ký tự';
    case 'pdf_chu': return `Đọc lớp chữ của PDF${t.soTrang ? ` (${t.soTrang} trang)` : ''} — đúng từng ký tự`;
    case 'ocr_pdf': return `Nhận dạng chữ (OCR) trang scan của PDF${t.soTrang ? `, ${t.soTrang} trang` : ''}${nn}${tinCay}`;
    case 'ocr_anh': return `Nhận dạng chữ (OCR) trong ảnh${nn}${tinCay}`;
    default: return '';
  }
}

export const laOcr = (phuongPhap: string | null) => phuongPhap === 'ocr_anh' || phuongPhap === 'ocr_pdf';

/** Bỏ dấu một ký tự, giữ đúng MỘT ký tự để vị trí trong chuỗi không lệch */
function boDauMotChu(c: string): string {
  if (c === 'đ' || c === 'Đ') return 'd';
  const b = c.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  /* Ký tự không quy về đúng một đơn vị (biểu tượng cảm xúc...) -> ký tự rỗng không
     bao giờ khớp, để vị trí trong chuỗi phẳng luôn trùng vị trí trong chuỗi gốc */
  return b.length === 1 ? b : '\u0000';
}

/**
 * Tách chữ thành các đoạn để tô từ khoá — KHÔNG DẤU, không phân biệt hoa thường
 * (gõ "huynh van luy" tô được "Huỳnh Văn Lũy"), giống cách máy chủ tìm.
 * Trả mảng { chu, khop }; React vẽ từng đoạn như chữ thường, không chèn HTML.
 */
export function tachDanhDau(text: string, tuKhoa: string): { chu: string; khop: boolean }[] {
  const kyTu = [...String(text ?? '')];
  const tim = [...String(tuKhoa ?? '').trim().replace(/\s+/g, ' ')].map(boDauMotChu).join('');
  if (tim.length < 2 || kyTu.length === 0) return [{ chu: kyTu.join(''), khop: false }];
  const phang = kyTu.map(boDauMotChu).join('');
  const ra: { chu: string; khop: boolean }[] = [];
  let tu = 0;
  for (let i = phang.indexOf(tim); i >= 0; i = phang.indexOf(tim, i + tim.length)) {
    if (i > tu) ra.push({ chu: kyTu.slice(tu, i).join(''), khop: false });
    ra.push({ chu: kyTu.slice(i, i + tim.length).join(''), khop: true });
    tu = i + tim.length;
  }
  if (tu < kyTu.length) ra.push({ chu: kyTu.slice(tu).join(''), khop: false });
  return ra;
}

/** Còn tệp đang chờ / đang đọc -> giao diện tự hỏi lại máy chủ */
export const conDangTrich = (ds: { trangThai: string }[] | undefined) =>
  Boolean(ds?.some((t) => t.trangThai === 'cho' || t.trangThai === 'dang_lam'));
