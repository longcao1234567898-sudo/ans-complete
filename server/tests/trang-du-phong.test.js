/**
 * VIỆC 28 (ADR-003) — TRANG DỰ PHÒNG KHI WEB SẬP
 *
 * Trang tĩnh dùng hình nền giao diện chính, có số 113, số trực ban, đường dẫn
 * tới các trang liên quan. Trang KHÔNG được phụ thuộc máy chủ chính (không gọi
 * API, không chạy script) — thì mới còn hiện được khi máy chủ sập. Khi trang
 * web còn chạy mà máy chủ không phản hồi, giao diện tự chuyển sang trang này.
 * Service worker giữ sẵn một bản để người đã từng vào vẫn thấy khi mất mạng
 * hoặc nơi chạy trang web cũng sập.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';

const goc = (p) => new URL(`../../${p}`, import.meta.url);
const html = await readFile(goc('public/du-phong.html'), 'utf8').catch(() => '');
const hangSo = await readFile(goc('src/utils/constants.ts'), 'utf8');
const lay = (truong) => new RegExp(`${truong}:\\s*'([^']+)'`).exec(hangSo)?.[1];

test('trang dự phòng tồn tại', () => {
  assert.ok(html.length > 0, 'thiếu public/du-phong.html');
});

test('có số 113 và số trực ban đúng với hằng số của đơn vị (gọi được bằng một chạm)', () => {
  const hotline = lay('hotline');
  assert.ok(hotline, 'không đọc được UNIT.hotline');
  assert.match(html, /href="tel:113"/);
  assert.ok(html.includes(hotline), `số trực ban trên trang dự phòng lệch với constants.ts (${hotline})`);
  assert.ok(html.includes(`tel:${hotline.replace(/\s/g, '')}`));
  assert.ok(html.includes(lay('shortName')));
});

test('không phụ thuộc máy chủ: không script, không gọi API', () => {
  assert.doesNotMatch(html, /<script/i, 'trang dự phòng không được chạy script (CSP cấm script nội tuyến, và script có thể gọi máy chủ)');
  assert.doesNotMatch(html, /\/api\/|onrender\.com|fetch\(/i);
});

test('dùng hình nền giao diện chính, tệp ảnh có thật', async () => {
  const m = /url\(['"]?(\/media\/[^'")]+)['"]?\)/.exec(html);
  assert.ok(m, 'không thấy hình nền');
  await access(goc(`public${m[1]}`));
});

test('có đường dẫn tới các trang liên quan và nút thử lại trang chính', () => {
  assert.ok(html.includes(lay('websiteUrl')));
  assert.match(html, /href="\/"/);
});

test('service worker giữ sẵn trang dự phòng và dùng khi mất mạng', async () => {
  const sw = await readFile(goc('public/sw.js'), 'utf8');
  assert.match(sw, /'\/du-phong\.html'/);
  assert.match(sw, /addAll\(/);
});

test('giao diện tự chuyển sang trang dự phòng khi máy chủ không phản hồi', async () => {
  const app = await readFile(goc('src/App.tsx'), 'utf8');
  assert.match(app, /<TheoDoiMayChu\s*\/>/);
  const td = await readFile(goc('src/components/common/TheoDoiMayChu.tsx'), 'utf8');
  assert.match(td, /du-phong\.html/);
});
