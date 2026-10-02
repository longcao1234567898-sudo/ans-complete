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
 * Không chọn từ chối khởi động: thiếu một lớp chống spam (còn phiếu mở form,
 * giới hạn theo mạng / SĐT / nội dung) mà đóng cả kênh tố giác là đổi một rủi
 * ro nhỏ lấy hậu quả lớn hơn — quyết định đó để người vận hành. Nhưng phải BÁO.
 *
 * Giống BUG-025: không dựa vào NODE_ENV=production (Render không đặt). Chỉ máy
 * khai rõ development/test mới được im lặng.
 *
 * Ba điểm khởi động (index.js, may-chu-cong-khai.js, may-chu-can-bo.js) đều
 * gắn /api/cong-vao, nên cả ba phải in cảnh báo (CLAUDE.md: sửa lớp bảo vệ ở
 * một tệp phải kiểm cả ba).
 */
import { describe, test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const { canhBaoTurnstile } = await import('../src/lib/turnstile.js');

let cu;
beforeEach(() => { cu = { NODE_ENV: process.env.NODE_ENV, KHOA: process.env.TURNSTILE_SECRET_KEY }; });
afterEach(() => {
  for (const [k, v] of [['NODE_ENV', cu.NODE_ENV], ['TURNSTILE_SECRET_KEY', cu.KHOA]]) {
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
});

describe('BUG-026: thiếu khoá Turnstile ở máy thật thì cảnh báo', () => {
  for (const [ten, giaTri] of [['production', 'production'], ['không khai (Render)', undefined]]) {
    test(`NODE_ENV ${ten}, không khoá: có cảnh báo nêu tên biến cần khai`, () => {
      if (giaTri === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = giaTri;
      delete process.env.TURNSTILE_SECRET_KEY;
      const cb = canhBaoTurnstile();
      assert.ok(cb, 'phải có cảnh báo');
      assert.match(cb, /TURNSTILE_SECRET_KEY/);
    });
  }

  test('khoá chỉ có khoảng trắng vẫn tính là thiếu', () => {
    process.env.NODE_ENV = 'production';
    process.env.TURNSTILE_SECRET_KEY = '   ';
    assert.ok(canhBaoTurnstile());
  });

  test('đã khai khoá: không cảnh báo', () => {
    process.env.NODE_ENV = 'production';
    process.env.TURNSTILE_SECRET_KEY = '0x4AAAAAAAthuNghiem';
    assert.equal(canhBaoTurnstile(), null);
  });

  test('máy cá nhân khai rõ development: không cảnh báo', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.TURNSTILE_SECRET_KEY;
    assert.equal(canhBaoTurnstile(), null);
  });

  for (const tep of ['index.js', 'may-chu-cong-khai.js', 'may-chu-can-bo.js']) {
    test(`${tep} in cảnh báo lúc khởi động`, async () => {
      const ma = await readFile(new URL(`../src/${tep}`, import.meta.url), 'utf8');
      assert.match(ma, /import\s*\{[^}]*\bcanhBaoTurnstile\b[^}]*\}\s*from\s*'\.\/lib\/turnstile\.js'/, `${tep} chưa nạp canhBaoTurnstile`);
      assert.match(ma, /canhBaoTurnstile\(\)/, `${tep} chưa gọi canhBaoTurnstile()`);
    });
  }
});
