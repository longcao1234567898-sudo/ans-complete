/**
 * MỤC B7 CỦA HƯỚNG DẪN TRIỂN KHAI — tệp cấu hình hai máy chủ (BUG-044)
 *
 * Người cài chép NGUYÊN hai khối mẫu `cong-khai.env` và `can-bo.env`. Máy chủ cán bộ
 * cũng đòi vé "không phải người máy" khi đăng nhập (P90) — thiếu TURNSTILE_SECRET_KEY
 * thì cổng vé cho mọi yêu cầu qua (chỉ in cảnh báo, BUG-026), tức dò mật khẩu cán bộ
 * không còn lớp chống máy tự động mà trang đăng nhập vẫn hiện ô xác minh.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const doc = (ten) => readFile(new URL(`../../docs/${ten}`, import.meta.url), 'utf8');

/** Các khối ```ini của mục B7, đã bỏ chú thích */
async function khoiB7() {
  const s = await doc('HUONG-DAN-TRIEN-KHAI.md');
  const b7 = s.slice(s.indexOf('### B7.'), s.indexOf('### B8.'));
  const ds = [...b7.matchAll(/```ini\n([\s\S]*?)```/g)].map((m) => m[1].split('\n').filter((d) => !/^\s*#/.test(d)).join('\n'));
  assert.equal(ds.length, 2, 'mục B7 phải có đúng hai khối ```ini (cong-khai.env, can-bo.env)');
  return { congKhai: ds[0], canBo: ds[1] };
}
const coBien = (khoi, ten) => new RegExp(`^${ten}=`, 'm').test(khoi);

test('can-bo.env có TURNSTILE_SECRET_KEY (đăng nhập cán bộ đòi vé — BUG-044)', async () => {
  const { canBo } = await khoiB7();
  assert.ok(coBien(canBo, 'ADMIN_PORT'), 'khối thứ hai phải là can-bo.env');
  assert.ok(coBien(canBo, 'TURNSTILE_SECRET_KEY'), 'can-bo.env thiếu TURNSTILE_SECRET_KEY');
});

test('cả hai tệp có ba khoá bắt buộc và khoá Turnstile', async () => {
  const k = await khoiB7();
  for (const [ten, khoi] of Object.entries(k)) {
    for (const bien of ['JWT_SECRET', 'ENCRYPTION_KEY', 'HASH_PEPPER', 'TURNSTILE_SECRET_KEY']) {
      assert.ok(coBien(khoi, bien), `${ten} thiếu ${bien}`);
    }
  }
});

test('sổ tay chặng 8 dặn chép khoá Turnstile vào CẢ HAI tệp', async () => {
  const s = await doc('SO-TAY-TRIEN-KHAI.md');
  const c8 = s.slice(s.indexOf('## Chặng 8'), s.indexOf('## Chặng 9'));
  assert.match(c8, /TURNSTILE_SECRET_KEY[^\n]*(cả hai|hai tệp)/i, 'chặng 8 phải nói rõ TURNSTILE_SECRET_KEY ở cả hai tệp');
});
