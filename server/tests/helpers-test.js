/**
 * Tiện ích dùng chung cho bộ test — KHÔNG phải file test (đặt tên không có
 * đuôi `.test.js` để `node --test tests/` bỏ qua).
 *
 * Bộ test KHÔNG được cần MySQL đang chạy: mọi hàm chạm database đều nhận pool
 * qua tham số, nên chỉ cần một pool giả trả dữ liệu dựng sẵn.
 */

/** Khoá hợp lệ để nạp được lib/token.js và lib/crypto.js trong test */
export const TEST_JWT_SECRET = 'test-jwt-secret-du-32-ky-tu-0123456789';
export const TEST_PEPPER = 'test-pepper-du-32-ky-tu-abcdefghijklmn';
export const TEST_ENCRYPTION_KEY = 'a'.repeat(64);

/** Đặt sẵn biến môi trường TRƯỚC khi import module cần chúng */
export function datBienMoiTruongHopLe() {
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = TEST_JWT_SECRET;
  process.env.HASH_PEPPER = TEST_PEPPER;
  process.env.ENCRYPTION_KEY = TEST_ENCRYPTION_KEY;
}

/**
 * `res` giả của Express — ghi lại status và body thay vì gửi đi đâu cả.
 * Dùng để test middleware mà không cần dựng server thật.
 */
export function resGia() {
  const res = {
    statusCode: null,
    body: null,
    status(code) { res.statusCode = code; return res; },
    json(payload) { res.body = payload; return res; },
  };
  return res;
}

/** Pool MySQL giả: `query()` trả đúng thứ đã dựng sẵn, và ghi lại mọi lời gọi */
export function poolGia(ketQua = [[]]) {
  const cacLoiGoi = [];
  return {
    cacLoiGoi,
    async query(sql, params) {
      cacLoiGoi.push({ sql, params });
      return typeof ketQua === 'function' ? ketQua(sql, params) : ketQua;
    },
  };
}

/**
 * Nạp một module với biến môi trường tuỳ chỉnh.
 * Thêm truy vấn ngẫu nhiên vào URL để ESM không dùng lại bản đã cache —
 * cần thiết khi test cùng một module với hai cấu hình khác nhau.
 *
 * ⚠️ CỐ Ý KHÔNG khôi phục biến môi trường sau khi import: lib/crypto.js đọc
 * HASH_PEPPER LƯỜI (lần băm đầu tiên mới đọc, không phải lúc nạp module). Khôi
 * phục ngay sau import thì tới lúc gọi hashIdentifier() biến đã bị đổi lại rồi
 * -> test đo nhầm cấu hình. Mỗi lời gọi napLai phải truyền ĐỦ biến nó cần.
 */
export async function napLai(duongDan, bienMoiTruong = {}) {
  for (const [k, v] of Object.entries(bienMoiTruong)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  return import(`${duongDan}?t=${Math.random()}`);
}
