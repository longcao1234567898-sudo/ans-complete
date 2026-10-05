/**
 * ND-053 — PHÔNG CHỮ TỰ LƯU, KHÔNG GỌI GOOGLE FONTS
 *
 * Trước đây mọi trang (kể cả trang gửi tố giác) tải Be Vietnam Pro từ
 * fonts.googleapis.com / fonts.gstatic.com: Google biết IP và giờ người mở trang
 * tố giác — đúng loại dấu vết hệ thống tránh ở chỗ khác (P51 cho máy chủ gọi
 * Open-Meteo giùm vì lý do này). Phông nay đi cùng bản dựng (gói @fontsource,
 * giấy phép OFL), và CSP không còn mở cửa cho hai máy đó (allow-list, luật 5).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const doc = (p) => readFile(new URL(`../../${p}`, import.meta.url), 'utf8');
const MAY_GOOGLE = /fonts\.(googleapis|gstatic)\.com/;

test('index.html không tải gì từ Google Fonts', async () => {
  assert.doesNotMatch(await doc('index.html'), MAY_GOOGLE);
});

test('CSP ở vercel.json và public/_headers không còn cho Google Fonts', async () => {
  const vercel = JSON.parse(await doc('vercel.json'));
  const csp = vercel.headers.flatMap((h) => h.headers).filter((h) => h.key === 'Content-Security-Policy').map((h) => h.value);
  assert.ok(csp.length > 0, 'vercel.json mất CSP');
  for (const v of csp) assert.doesNotMatch(v, MAY_GOOGLE);
  const headers = (await doc('public/_headers')).split('\n').filter((d) => /^\s*Content-Security-Policy:/.test(d));
  assert.ok(headers.length > 0, '_headers mất CSP');
  for (const d of headers) assert.doesNotMatch(d, MAY_GOOGLE);
  for (const v of [...csp, ...headers]) assert.match(v, /font-src 'self'/, 'font-src phải còn self');
});

test('phông Be Vietnam Pro đi cùng bản dựng: đủ 5 độ đậm trang đang dùng', async () => {
  const main = await doc('src/main.tsx');
  for (const w of [400, 500, 600, 700, 800]) {
    assert.match(main, new RegExp(`import '@fontsource/be-vietnam-pro/${w}\\.css';`), `thiếu độ đậm ${w}`);
  }
  const pkg = JSON.parse(await doc('package.json'));
  assert.match(pkg.dependencies?.['@fontsource/be-vietnam-pro'] ?? '', /^\d+\.\d+\.\d+$/,
    'gói phông phải ghim đúng phiên bản');
});
