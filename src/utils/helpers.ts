/**
 * Các hàm tiện ích dùng chung.
 */

/** Ghép class Tailwind có điều kiện */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

/** Sinh mã tra cứu 6 ký tự (bỏ ký tự dễ nhầm lẫn: 0/O, 1/I/L) */
export function generateTrackingCode(length = 6): string {
  const charset = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < length; i++) {
    code += charset[Math.floor(Math.random() * charset.length)];
  }
  return code;
}

/** Định dạng ngày giờ theo chuẩn Việt Nam */
export function formatDate(iso: string, withTime = true): string {
  if (!iso) return '';
  const options: Intl.DateTimeFormatOptions = withTime
    ? { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }
    : { day: '2-digit', month: '2-digit', year: 'numeric' };
  return new Intl.DateTimeFormat('vi-VN', options).format(new Date(iso));
}

/** Giả lập độ trễ mạng (dùng cho mock API) */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Sinh id ngẫu nhiên cho message/phần tử danh sách */
export function randomId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Bỏ dấu tiếng Việt — dùng để so khớp từ khoá với văn bản người dân viết thiếu dấu */
export function stripDiacritics(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

/** Viết hoa chữ cái đầu */
export function capitalize(text: string): string {
  if (!text) return text;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Chuẩn hoá số điện thoại: bỏ khoảng trắng/chấm/gạch, đổi +84 về 0 */
export function normalizePhone(raw: string): string {
  let digits = raw.replace(/[\s.\-()]/g, '');
  if (digits.startsWith('+84')) digits = '0' + digits.slice(3);
  else if (digits.startsWith('84') && digits.length >= 11) digits = '0' + digits.slice(2);
  return digits;
}

/** Đầu số di động đang hoạt động tại Việt Nam (Viettel/Mobi/Vina/VNMB/Gmobile) */
const VN_MOBILE_PREFIX = /^(03[2-9]|05[25689]|070|07[6-9]|08[1-9]|09\d)/;

/** Phát hiện dãy số liên tiếp tăng/giảm dài bất thường (0123456789...) */
function hasSequentialRun(digits: string, minLen: number): boolean {
  let asc = 1;
  let desc = 1;
  for (let i = 1; i < digits.length; i++) {
    const prev = digits.charCodeAt(i - 1);
    const cur = digits.charCodeAt(i);
    asc = cur - prev === 1 ? asc + 1 : 1;
    desc = prev - cur === 1 ? desc + 1 : 1;
    if (asc >= minLen || desc >= minLen) return true;
  }
  return false;
}

/**
 * Kiểm tra số điện thoại Việt Nam nghiêm ngặt, trả về thông báo lỗi cụ thể
 * (chuỗi rỗng = hợp lệ). Chặn số rác kiểu 0000090907:
 * - Đúng độ dài: 10 số (di động) hoặc 11 số bắt đầu 02 (cố định)
 * - Đầu số di động phải TỒN TẠI thật tại Việt Nam
 * - Không chấp nhận chuỗi 5+ chữ số giống hệt nhau liên tiếp
 * - Không chấp nhận dãy liên tiếp tăng/giảm 6+ số (0123456...)
 */
export function getPhoneError(raw: string): string {
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
  if (/(\d)\1{4,}/.test(p)) return 'Số có chuỗi chữ số lặp bất thường, vui lòng kiểm tra lại';
  if (hasSequentialRun(p, 8)) return 'Số theo dãy liên tiếp bất thường, vui lòng kiểm tra lại';
  return '';
}

/** Kiểm tra nhanh số điện thoại hợp lệ */
export function isValidPhone(phone: string): boolean {
  return getPhoneError(phone) === '';
}

/** Kiểm tra định dạng email (chỉ khi có nhập) */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Đọc, KIỂM TRA và nén ảnh phía trình duyệt:
 * - Chặn "bom giải nén": ảnh có kích thước điểm ảnh bất thường (làm treo trình duyệt)
 * - TÁI MÃ HOÁ: vẽ lại toàn bộ ảnh lên canvas rồi xuất JPEG mới — bước này xoá sạch
 *   metadata/EXIF và mọi dữ liệu lạ đính kèm trong tệp gốc (kể cả mã độc ẩn)
 * - Thu nhỏ cạnh dài nhất về maxSize px để lưu gọn
 */
export function compressImageFile(file: File, maxSize = 1024, quality = 0.72): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Không đọc được tệp ảnh'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Tệp không phải ảnh hợp lệ'));
      img.onload = () => {
        // Chặn bom giải nén: từ chối ảnh > 40 triệu điểm ảnh hoặc cạnh > 10.000px
        if (img.width * img.height > 40_000_000 || Math.max(img.width, img.height) > 10_000) {
          return reject(new Error('Ảnh có kích thước bất thường, không thể xử lý an toàn'));
        }
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Trình duyệt không hỗ trợ xử lý ảnh'));
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}
