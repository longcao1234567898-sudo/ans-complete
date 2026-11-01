/**
 * HỒ SƠ MẪU DEMO01–04 KHÔNG NẰM LẠI TRÊN MÁY CHẠY THẬT (ND-085)
 *
 * TRON_BO_DATABASE_V5.sql nạp 4 hồ sơ mẫu (tên giả, chữ thường) cho máy thử. Cài mới
 * trên máy thật thì chúng lẫn vào hàng việc, thống kê của cán bộ, và trang Tra cứu
 * còn mời người dân gõ mã DEMO. Cần: tệp xoá có chốt (chỉ xoá đúng hồ sơ mẫu, không
 * bao giờ xoá hồ sơ thật trùng mã), README nhắc chạy, giao diện chỉ gợi ý mã DEMO khi
 * chạy một mình không có máy chủ (dữ liệu mẫu trong mockData).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const doc = (p) => readFile(new URL(`../../${p}`, import.meta.url), 'utf8');

test('có tệp xoá hồ sơ mẫu, chốt theo mã DEMO VÀ tên giả chữ thường (không đụng hồ sơ đã mã hoá)', async () => {
  const s = await doc('database/xoa_ho_so_mau.sql');
  const xoa = s.replace(/^\s*--.*$/gm, '').match(/DELETE\s+FROM\s+submissions\s+WHERE([\s\S]*?);/i);
  assert.ok(xoa, 'phải có DELETE FROM submissions WHERE ...');
  const dk = xoa[1];
  assert.match(dk, /tracking_code\s+IN\s*\(\s*'DEMO01'\s*,\s*'DEMO02'\s*,\s*'DEMO03'\s*,\s*'DEMO04'\s*\)/i);
  assert.match(dk, /sender_name\s+NOT\s+LIKE\s+'enc:%'/i, 'không được xoá hồ sơ có danh tính đã mã hoá');
  assert.match(dk, /sender_name\s+LIKE\s+'% Demo'/i, 'chỉ xoá hồ sơ mang tên giả "... Demo"');
});

test('README nhắc chạy tệp xoá hồ sơ mẫu khi cài máy thật', async () => {
  assert.match(await doc('README.md'), /xoa_ho_so_mau\.sql/);
});

test('trang Tra cứu chỉ gợi ý mã DEMO khi không có máy chủ', async () => {
  const s = await doc('src/pages/TrackingPage.tsx');
  assert.match(s, /!hasBackend\s*&&[\s\S]{0,200}Thử ngay với mã demo/, 'gợi ý mã demo phải nằm sau !hasBackend &&');
});

test('hướng dẫn G6 không ghi cứng số bảng (CLAUDE.md: không chép số vào tài liệu)', async () => {
  const s = await doc('docs/HUONG-DAN-TRIEN-KHAI.md');
  const g6 = s.slice(s.indexOf('### G6.'), s.indexOf('### G7.'));
  assert.doesNotMatch(g6, /\b\d+\s+bảng\b/);
});
