/**
 * BUG-026 — MÁY THẬT THIẾU KHOÁ TURNSTILE PHẢI BÁO TO LÚC KHỞI ĐỘNG
 * ============================================================================
 *
 * Chưa khai TURNSTILE_SECRET_KEY thì lib/turnstile.js và lib/cong-vao.js cho
 * mọi yêu cầu qua cổng chống máy tự động — đánh đổi đã ghi ở cong-vao.js, để
 * máy cá nhân chạy được không cần Cloudflare. Nhưng máy chạy thật thiếu khoá
 * thì trước đây KHÔNG có dòng nào báo: thí điểm P48 chạy NODE_ENV=production
 * không khoá, log khởi động im lặng, cổng mở mà không ai biết (mối đe doạ 3).
 *
 * BUG-026 chọn CHỈ BÁO, không từ chối khởi động. BUG-002 (quyết định D5 của
 * người vận hành) đổi lại: Turnstile còn là lớp thay thế cho việc khoá tài
 * khoản cán bộ khi sai mật khẩu, thiếu khoá là máy dò mật khẩu không bị chặn —
 * nên máy thật thiếu khoá thì KHÔNG KHỞI ĐỘNG. Các kỳ vọng dưới đây đã sửa theo
 * (BUG-026: "có cảnh báo" -> BUG-002: "ném lỗi"; development: "im lặng" ->
 * "cảnh báo đỏ"). Kiểm thật qua tiến trình con: turnstile-dong-khi-hong.test.js.
 *
 * Giống BUG-025: không dựa vào NODE_ENV=production (Render không đặt). Chỉ máy
 * khai rõ development mới được chạy không khoá.
 *
 * Ba điểm khởi động (index.js, may-chu-cong-khai.js, may-chu-can-bo.js) đều
 * gắn /api/cong-vao, nên cả ba phải gọi bước kiểm (CLAUDE.md: sửa lớp bảo vệ ở
 * một tệp phải kiểm cả ba).
 */
import { describe, test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const { kiemKhoaTurnstileKhiKhoiDong } = await import('../src/lib/turnstile.js');

let cu;
beforeEach(() => { cu = { NODE_ENV: process.env.NODE_ENV, KHOA: process.env.TURNSTILE_SECRET_KEY }; });
afterEach(() => {
  for (const [k, v] of [['NODE_ENV', cu.NODE_ENV], ['TURNSTILE_SECRET_KEY', cu.KHOA]]) {
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
});

describe('BUG-026 → BUG-002: thiếu khoá Turnstile ở máy thật thì không khởi động', () => {
  for (const [ten, giaTri] of [['production', 'production'], ['không khai (Render)', undefined]]) {
    test(`NODE_ENV ${ten}, không khoá: ném lỗi nêu tên biến cần khai`, () => {
      if (giaTri === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = giaTri;
      delete process.env.TURNSTILE_SECRET_KEY;
      assert.throws(() => kiemKhoaTurnstileKhiKhoiDong(), /TURNSTILE_SECRET_KEY/);
    });
  }

  test('khoá chỉ có khoảng trắng vẫn tính là thiếu', () => {
    process.env.NODE_ENV = 'production';
    process.env.TURNSTILE_SECRET_KEY = '   ';
    assert.throws(() => kiemKhoaTurnstileKhiKhoiDong(), /TURNSTILE_SECRET_KEY/);
  });

  test('đã khai khoá: không cảnh báo', () => {
    process.env.NODE_ENV = 'production';
    process.env.TURNSTILE_SECRET_KEY = '0x4AAAAAAAthuNghiem';
    assert.equal(kiemKhoaTurnstileKhiKhoiDong(), null);
  });

  test('máy cá nhân khai rõ development: vẫn chạy, nhưng có cảnh báo đỏ', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.TURNSTILE_SECRET_KEY;
    const cb = kiemKhoaTurnstileKhiKhoiDong();
    assert.ok(cb, 'development thiếu khoá phải có cảnh báo');
    assert.match(cb, /🔴/u);
    assert.match(cb, /TURNSTILE_SECRET_KEY/);
  });

  for (const tep of ['index.js', 'may-chu-cong-khai.js', 'may-chu-can-bo.js']) {
    test(`${tep} kiểm khoá lúc khởi động`, async () => {
      const ma = await readFile(new URL(`../src/${tep}`, import.meta.url), 'utf8');
      assert.match(ma, /import\s*\{[^}]*\bkiemKhoaTurnstileKhiKhoiDong\b[^}]*\}\s*from\s*'\.\/lib\/turnstile\.js'/, `${tep} chưa nạp kiemKhoaTurnstileKhiKhoiDong`);
      assert.match(ma, /kiemKhoaTurnstileKhiKhoiDong\(\)/, `${tep} chưa gọi kiemKhoaTurnstileKhiKhoiDong()`);
    });
  }
});
