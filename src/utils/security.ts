/**
 * LÁ CHẮN AN TOÀN NỘI DUNG — kiểm tra văn bản và hình ảnh người dân gửi lên
 * nhằm chặn các kiểu tấn công phổ biến vào web:
 *
 * VĂN BẢN:
 *  - Quét mẫu tấn công: thẻ <script>/<iframe>, thuộc tính sự kiện HTML (onerror=...),
 *    giao thức javascript:, mẫu SQL injection, template injection...
 *  - Làm sạch: loại ký tự điều khiển, ký tự tàng hình (zero-width) hay dùng để
 *    nguỵ trang mã độc, giới hạn độ dài.
 *
 * HÌNH ẢNH:
 *  - Đọc "chữ ký nhị phân" (magic bytes) ở đầu tệp để xác minh tệp THẬT SỰ là ảnh —
 *    chặn tệp .exe/.html đổi đuôi thành .jpg.
 *  - Từ chối SVG (định dạng ảnh có thể chứa mã JavaScript thực thi).
 *  - Chặn "bom giải nén" (ảnh khai báo kích thước khổng lồ làm treo trình duyệt).
 *  - Kết hợp với bước TÁI MÃ HOÁ qua canvas (trong compressImageFile): ảnh được vẽ lại
 *    hoàn toàn thành JPEG mới → mọi mã độc ẩn trong metadata/EXIF hay đính kèm
 *    sau đuôi tệp đều bị loại bỏ.
 *
 * Lưu ý: đây là tuyến phòng thủ phía trình duyệt. Khi hệ thống có backend thật,
 * các kiểm tra này BẮT BUỘC phải được thực hiện lại ở phía máy chủ.
 */

import { stripDiacritics } from './helpers';

/** Độ dài tối đa của nội dung ý kiến */
export const CONTENT_MAX_LENGTH = 2000;

/** Các mẫu tấn công cần chặn trong văn bản */
const SUSPICIOUS_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /<\s*script/i, label: 'thẻ script' },
  { pattern: /<\s*(iframe|object|embed|svg|link|meta|form|img)\b/i, label: 'thẻ HTML nhúng' },
  { pattern: /javascript\s*:/i, label: 'giao thức javascript:' },
  { pattern: /\bon(error|load|click|mouseover|focus|submit)\s*=/i, label: 'thuộc tính sự kiện HTML' },
  { pattern: /data:\s*text\/html/i, label: 'data URI dạng HTML' },
  { pattern: /(document|window)\s*\.\s*(cookie|location|write)/i, label: 'mã JavaScript' },
  { pattern: /\beval\s*\(|\bnew\s+Function\s*\(/i, label: 'hàm thực thi mã' },
  { pattern: /\bunion\b[\s\S]{0,60}\bselect\b|\bdrop\s+table\b|('|")\s*or\s+1\s*=\s*1/i, label: 'mẫu tấn công SQL' },
  { pattern: /\{\{[\s\S]{0,80}\}\}|\$\{[\s\S]{0,80}\}/, label: 'mẫu template injection' },
];

/** Kết quả quét văn bản */
export interface TextScanResult {
  safe: boolean;
  reasons: string[];
}

/** Quét văn bản tìm mẫu tấn công — trả về danh sách lý do nếu phát hiện */
export function scanTextForThreats(text: string): TextScanResult {
  const reasons: string[] = [];
  for (const { pattern, label } of SUSPICIOUS_PATTERNS) {
    if (pattern.test(text)) reasons.push(label);
  }
  return { safe: reasons.length === 0, reasons };
}

/**
 * Làm sạch văn bản: bỏ ký tự điều khiển, ký tự tàng hình/đảo chiều (hay dùng để
 * nguỵ trang nội dung độc hại), gọn khoảng trắng thừa, giới hạn độ dài.
 */
export function sanitizeText(text: string, maxLength = CONTENT_MAX_LENGTH): string {
  return text
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '') // ký tự điều khiển
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060\uFEFF]/g, '') // zero-width, bidi override
    .replace(/[ \t]{4,}/g, '   ')
    .trim()
    .slice(0, maxLength);
}

/** Kết quả kiểm tra tệp ảnh */
export type ImageCheckResult = { ok: true } | { ok: false; reason: string };

/**
 * Xác minh tệp THẬT SỰ là ảnh bằng chữ ký nhị phân đầu tệp (magic bytes).
 * Chấp nhận: JPEG, PNG, GIF, WebP, BMP. Từ chối SVG và mọi tệp giả mạo đuôi ảnh.
 */
export async function validateImageFile(file: File): Promise<ImageCheckResult> {
  // 1) Chặn SVG ngay từ đầu (SVG có thể chứa <script> thực thi)
  if (file.type === 'image/svg+xml' || /\.svgz?$/i.test(file.name)) {
    return { ok: false, reason: 'Không nhận ảnh SVG vì định dạng này có thể chứa mã thực thi.' };
  }

  // 2) Đọc 16 byte đầu và so với chữ ký của từng định dạng ảnh
  let head: Uint8Array;
  try {
    head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  } catch {
    return { ok: false, reason: 'Không đọc được tệp để kiểm tra an toàn.' };
  }

  const ascii = (from: number, to: number) => String.fromCharCode(...head.slice(from, to));
  const isJpeg = head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
  const isPng =
    head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47 &&
    head[4] === 0x0d && head[5] === 0x0a && head[6] === 0x1a && head[7] === 0x0a;
  const isGif = ascii(0, 4) === 'GIF8';
  const isWebp = ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP';
  const isBmp = head[0] === 0x42 && head[1] === 0x4d;

  if (!(isJpeg || isPng || isGif || isWebp || isBmp)) {
    return {
      ok: false,
      reason: 'Nội dung tệp không phải định dạng ảnh hợp lệ — nghi ngờ tệp giả mạo đuôi ảnh.',
    };
  }

  return { ok: true };
}

/* ================================================================== */
/* BỘ LỌC NGÔN TỪ THÔ TỤC / XÚC PHẠM                                   */
/* Danh sách có thể bổ sung thêm từ tại đây khi phát hiện biến thể mới */
/* ================================================================== */

/** Cụm từ thô tục/xúc phạm — so khớp trên văn bản gốc (có dấu) theo ranh giới từ */
const BAD_PHRASES: string[] = [
  'đụ', 'đù má', 'đù mẹ', 'địt', 'đjt', 'đéo', 'cặc', 'con cặc', 'lồn', 'cái lồn',
  'buồi', 'dái', 'đĩ', 'con đĩ', 'điếm', 'đm', 'đmm', 'đcm', 'đcmm', 'vãi lồn',
  'óc chó', 'chó đẻ', 'đồ chó', 'thằng chó', 'mẹ mày', 'má mày', 'bố mày',
  'câm mồm', 'khốn nạn', 'mất dạy', 'súc vật', 'đồ súc sinh', 'đồ ngu', 'ngu như bò',
  'fuck', 'fucking', 'shit', 'bitch', 'asshole', 'dick', 'pussy',
];

/** Từ viết tắt thô tục — so khớp theo TOKEN sau khi bỏ dấu + giải mã leetspeak */
const BAD_TOKENS = new Set([
  'dm', 'dmm', 'dcm', 'dcmm', 'cmm', 'ccmnr', 'vcl', 'vkl', 'clgt',
  'loz', 'djt', 'cak', 'kak', 'cc', 'wtf', 'fck', 'fuk',
]);

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Kiểm tra cụm từ theo ranh giới từ (hỗ trợ chữ có dấu tiếng Việt) */
function hasBadPhrase(haystack: string): boolean {
  return BAD_PHRASES.some((phrase) =>
    new RegExp(`(?:^|[^\\p{L}])${escapeRegex(phrase)}(?:[^\\p{L}]|$)`, 'u').test(haystack)
  );
}

/**
 * Phát hiện ngôn từ thô tục/xúc phạm, kể cả khi cố né bằng cách:
 * - Viết tắt (đm, vcl...), viết thiếu dấu
 * - Leetspeak thay chữ bằng số (l0z, d1t...)
 * - Chèn dấu chấm/gạch giữa các chữ (đ.m, c-c)
 */
export function containsProfanity(text: string): boolean {
  const lower = text.toLowerCase();

  // 1) Khớp cụm từ trên văn bản gốc + bản đã gỡ ký tự chèn giữa (đ.m -> đm)
  if (hasBadPhrase(lower)) return true;
  const unmasked = lower.replace(/[.\-_*]+/g, '');
  if (hasBadPhrase(unmasked)) return true;

  // 2) Khớp token viết tắt trên bản bỏ dấu + giải leetspeak
  const leet = stripDiacritics(lower)
    .replace(/0/g, 'o')
    .replace(/1/g, 'i')
    .replace(/3/g, 'e')
    .replace(/4/g, 'a')
    .replace(/5/g, 's')
    .replace(/7/g, 't')
    .replace(/@/g, 'a')
    .replace(/\$/g, 's');
  const tokens = leet.split(/[^a-z]+/);
  return tokens.some((t) => BAD_TOKENS.has(t));
}


/* ============================================================
   NHẬN DIỆN NỘI DUNG TỐ GIÁC (bản frontend — khớp với backend)
   ============================================================
   Dùng để quyết định KHÔNG gửi ảnh bằng chứng sang AI bên ngoài.
   Ảnh tố giác có thể chứa mặt người, biển số, hiện trường —
   là dữ liệu nhạy cảm nhất, không được để lọt ra bên thứ ba.
*/
const boDau = (t: string) =>
  t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();

const TO_GIAC_KEYWORDS = [
  'trom cap', 'trom xe', 'an trom', 'an cap', 'cuop', 'cuop giat',
  'ma tuy', 'nghien', 'chich hut', 'hut chich', 'choi da', 'bay lac', 'tang tru',
  'danh bac', 'da ga', 'so de', 'ghi de', 'ca do', 'xoc dia',
  'cho vay nang lai', 'tin dung den', 'doi no thue', 'xiet no',
  'lua dao', 'chiem doat', 'da cap',
  'danh nhau', 'chem', 'dam chem', 'hanh hung', 'gay thuong tich', 'con do',
  'mai dam', 'gai goi', 'chua chap',
  'buon lau', 'hang cam', 'hang gia', 'thuoc la lau',
  'sung', 'vu khi', 'hung khi', 'dao kiem', 'vat lieu no', 'phao no',
  'vuot bien', 'dua nguoi trai phep', 'buon nguoi', 'bat coc',
  'giet', 'hiep dam', 'xam hai', 'dam o',
  'to giac', 'to cao toi pham', 'trinh bao', 'bao an',
];

/** Nội dung có dấu hiệu tố giác tội phạm? */
export function isToGiacText(content: string): boolean {
  const t = ' ' + boDau(String(content || '')) + ' ';
  return TO_GIAC_KEYWORDS.some((kw) => t.includes(kw));
}
