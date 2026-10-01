/**
 * Hướng dẫn cho người dân KHÔNG tự hiện ở khu cán bộ — lỗi thật: máy mới vào
 * lần đầu, lớp hướng dẫn phủ lên trang cán bộ rồi kéo về trang chủ.
 * Quét mã nguồn (không có test trình duyệt trong npm test); đã chạy Playwright khi sửa.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const doc = (duong) => readFile(new URL(`../../src/${duong}`, import.meta.url), 'utf8');

test('hướng dẫn cho người dân không tự hiện ở khu cán bộ', async () => {
  const ma = await doc('components/common/HuongDanBanDau.tsx');
  const m = ma.match(/if \((\/\^\\\/\(quan-tri\|dang-nhap\)[^)]*\)\/)\.test\(window\.location\.pathname\)\) return;/);
  assert.ok(m, 'không thấy điều kiện chặn tự hiện ở /quan-tri, /dang-nhap');
  // eslint-disable-next-line no-eval
  const re = eval(m[1]);
  for (const d of ['/quan-tri', '/quan-tri/diem-den', '/dang-nhap']) assert.ok(re.test(d), d);
  for (const d of ['/', '/tra-cuu', '/quan-tri-vien']) assert.ok(!re.test(d), d);
});
