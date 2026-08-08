/**
 * Lá chắn an toàn PHÍA MÁY CHỦ — kiểm tra LẠI toàn bộ dữ liệu dù frontend đã kiểm,
 * vì kẻ tấn công có thể gửi thẳng request bỏ qua giao diện (never trust the client).
 * Bộ từ cấm được nạp thêm từ bảng banned_words trong database lúc khởi động.
 */

export function stripDiacritics(text) {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
}

export const CONTENT_MAX_LENGTH = 2000;

const SUSPICIOUS_PATTERNS = [
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

export function scanTextForThreats(text) {
  const reasons = [];
  for (const { pattern, label } of SUSPICIOUS_PATTERNS) {
    if (pattern.test(text)) reasons.push(label);
  }
  return { safe: reasons.length === 0, reasons };
}

export function sanitizeText(text, maxLength = CONTENT_MAX_LENGTH) {
  return String(text ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060\uFEFF]/g, '')
    .replace(/[ \t]{4,}/g, '   ')
    .trim()
    .slice(0, maxLength);
}

/* ---------- Bộ lọc ngôn từ (nạp thêm từ DB) ---------- */
const badPhrases = new Set([
  'đụ', 'đù má', 'đù mẹ', 'địt', 'đjt', 'đéo', 'cặc', 'con cặc', 'lồn', 'cái lồn',
  'buồi', 'dái', 'đĩ', 'con đĩ', 'điếm', 'đm', 'đmm', 'đcm', 'đcmm', 'vãi lồn',
  'óc chó', 'chó đẻ', 'đồ chó', 'thằng chó', 'mẹ mày', 'má mày', 'bố mày',
  'câm mồm', 'khốn nạn', 'mất dạy', 'súc vật', 'đồ súc sinh', 'đồ ngu', 'ngu như bò',
  'fuck', 'fucking', 'shit', 'bitch', 'asshole', 'dick', 'pussy',
]);
const badTokens = new Set([
  'dm', 'dmm', 'dcm', 'dcmm', 'cmm', 'ccmnr', 'vcl', 'vkl', 'clgt',
  'loz', 'djt', 'cak', 'kak', 'cc', 'wtf', 'fck', 'fuk',
]);

/** Nạp thêm từ cấm từ bảng banned_words (gọi lúc server khởi động) */
export async function loadBannedWords(pool) {
  const [rows] = await pool.query(
    "SELECT word, word_type FROM banned_words WHERE is_active = TRUE"
  );
  for (const r of rows) {
    if (r.word_type === 'token') badTokens.add(r.word.toLowerCase());
    else badPhrases.add(r.word.toLowerCase());
  }
  console.log(`🛡️  Đã nạp ${rows.length} từ cấm từ database`);
}

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasBadPhrase(haystack) {
  for (const phrase of badPhrases) {
    if (new RegExp(`(?:^|[^\\p{L}])${escapeRegex(phrase)}(?:[^\\p{L}]|$)`, 'u').test(haystack)) return true;
  }
  return false;
}

export function containsProfanity(text) {
  const lower = String(text ?? '').toLowerCase();
  if (hasBadPhrase(lower)) return true;
  if (hasBadPhrase(lower.replace(/[.\-_*]+/g, ''))) return true;
  const leet = stripDiacritics(lower)
    .replace(/0/g, 'o').replace(/1/g, 'i').replace(/3/g, 'e')
    .replace(/4/g, 'a').replace(/5/g, 's').replace(/7/g, 't')
    .replace(/@/g, 'a').replace(/\$/g, 's');
  return leet.split(/[^a-z]+/).some((t) => badTokens.has(t));
}

/* ---------- Số điện thoại Việt Nam ---------- */
export function normalizePhone(raw) {
  let digits = String(raw ?? '').replace(/[\s.\-()]/g, '');
  if (digits.startsWith('+84')) digits = '0' + digits.slice(3);
  else if (digits.startsWith('84') && digits.length >= 11) digits = '0' + digits.slice(2);
  return digits;
}

const VN_MOBILE_PREFIX = /^(03[2-9]|05[25689]|070|07[6-9]|08[1-9]|09\d)/;

function hasSequentialRun(digits, minLen) {
  let asc = 1, desc = 1;
  for (let i = 1; i < digits.length; i++) {
    const prev = digits.charCodeAt(i - 1), cur = digits.charCodeAt(i);
    asc = cur - prev === 1 ? asc + 1 : 1;
    desc = prev - cur === 1 ? desc + 1 : 1;
    if (asc >= minLen || desc >= minLen) return true;
  }
  return false;
}

export function getPhoneError(raw) {
  const p = normalizePhone(raw);
  if (!p) return 'Vui lòng nhập số điện thoại';
  if (!/^\d+$/.test(p)) return 'Số điện thoại chỉ được chứa chữ số';
  if (p.length === 11) {
    if (!p.startsWith('02')) return 'Số 11 chữ số phải là số cố định bắt đầu bằng 02';
  } else if (p.length === 10) {
    if (!VN_MOBILE_PREFIX.test(p)) return 'Đầu số di động không tồn tại tại Việt Nam';
  } else {
    return 'Số điện thoại phải có 10 số (di động) hoặc 11 số (cố định 02xx)';
  }
  if (/(\d)\1{4,}/.test(p)) return 'Số có chuỗi chữ số lặp bất thường';
  if (hasSequentialRun(p, 8)) return 'Số theo dãy liên tiếp bất thường';
  return '';
}
