/**
 * ND-059 — index.html KHÔNG CÓ SCRIPT VIẾT THẲNG
 *
 * CSP (vercel.json, public/_headers) không cho 'unsafe-inline' trong script-src —
 * cố ý, để chặn mã chèn. Script viết thẳng trong index.html vì vậy bị trình duyệt
 * chặn im lặng: đoạn "3 giây chưa sẵn sàng thì cứ hiện trang" chưa từng chạy, chỉ
 * để lại một lỗi đỏ trong Console. Cách sửa là tách ra tệp riêng như
 * public/theme-init.js — không nới CSP.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';

const doc = (p) => readFile(new URL(`../../${p}`, import.meta.url), 'utf8');
const boChuThichHtml = (s) => s.replace(/<!--[\s\S]*?-->/g, '');

test('index.html không có thẻ <script> chạy mã viết thẳng (chỉ cho src= hoặc JSON-LD)', async () => {
  const html = boChuThichHtml(await doc('index.html'));
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const thuocTinh = m[1];
    if (/\bsrc\s*=/.test(thuocTinh)) {
      assert.equal(m[2].trim(), '', 'thẻ có src= không được kèm mã bên trong');
      continue;
    }
    assert.match(thuocTinh, /type\s*=\s*"application\/ld\+json"/,
      `script viết thẳng bị CSP chặn — tách ra tệp riêng trong public/: ${m[2].trim().slice(0, 60)}`);
  }
});

test('CSP vẫn không cho unsafe-inline trong script-src (không "sửa" bằng cách nới CSP)', async () => {
  const vercel = JSON.parse(await doc('vercel.json'));
  const csp = vercel.headers.flatMap((h) => h.headers).filter((h) => h.key === 'Content-Security-Policy').map((h) => h.value);
  const headers = (await doc('public/_headers')).split('\n').filter((d) => /^\s*Content-Security-Policy:/.test(d));
  assert.ok(csp.length > 0 && headers.length > 0, 'mất CSP');
  for (const v of [...csp, ...headers]) {
    for (const chiThi of v.split(';').filter((c) => /^\s*script-src/.test(c))) {
      assert.doesNotMatch(chiThi, /'unsafe-inline'|'sha256-/, `script-src bị nới: ${chiThi.trim()}`);
    }
  }
});

test('lối thoát "3 giây chưa sẵn sàng thì cứ hiện" vẫn còn, ở tệp riêng được nạp', async () => {
  const html = boChuThichHtml(await doc('index.html'));
  const tep = [...html.matchAll(/<script\b[^>]*\bsrc="\/([^"]+\.js)"/g)].map((m) => m[1]);
  let thay = false;
  for (const t of tep) {
    await access(new URL(`../../public/${t}`, import.meta.url));
    if (/classList\.add\(\s*'san-sang'\s*\)/.test(await doc(`public/${t}`))) thay = true;
  }
  assert.ok(thay, 'không tệp script nào nạp từ index.html gắn lớp san-sang — mất lối thoát khi ứng dụng lỗi');
});
