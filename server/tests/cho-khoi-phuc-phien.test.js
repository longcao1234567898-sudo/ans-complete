/**
 * Tải lại trang cán bộ không bị đẩy về Tổng quan — lỗi thật: AdminLayout chuyển
 * sang /dang-nhap khi phiên còn đang khôi phục, trang đăng nhập lại đẩy về /quan-tri.
 * Quét mã nguồn (không có test trình duyệt trong npm test); đã chạy Playwright khi sửa.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const doc = (duong) => readFile(new URL(`../../src/${duong}`, import.meta.url), 'utf8');

test('trang cán bộ chờ khôi phục phiên rồi mới chuyển sang đăng nhập; đăng nhập xong quay lại đúng trang', async () => {
  const layout = await doc('components/admin/AdminLayout.tsx');
  const iCho = layout.indexOf('if (loading)');
  const iChuyen = layout.indexOf('<Navigate to="/dang-nhap"');
  assert.ok(iCho > 0 && iChuyen > iCho, 'AdminLayout chuyển sang /dang-nhap trước khi phiên khôi phục xong');
  const dn = await doc('pages/admin/AdminLoginPage.tsx');
  assert.match(dn, /<Navigate to=\{veTrang\} replace \/>/);
  assert.ok(!/<Navigate to="\/quan-tri" replace \/>/.test(dn), 'đăng nhập xong vẫn luôn về Tổng quan');
});
