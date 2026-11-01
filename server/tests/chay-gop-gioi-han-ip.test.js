/**
 * BẢN CHẠY GỘP (index.js) CŨNG ÁP GIỚI HẠN IP CHO PHẦN CÁN BỘ (ND-086)
 *
 * Người vận hành: máy chủ cán bộ và công dân đang nằm chung (chi phí), tách sau bàn
 * giao. Bản gộp gắn /api/admin mà KHÔNG qua chanTheoIp như may-chu-can-bo.js -> khai
 * ADMIN_ALLOWED_IPS vẫn không có tác dụng, đăng nhập cán bộ mở cho mọi IP. Chỉ chặn
 * phần cán bộ (/api/auth là đăng nhập cán bộ, /api/admin); phần công dân phải mở.
 * Luật CLAUDE.md: sửa lớp bảo vệ ở một biến thể phải kiểm cả ba.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const ma = (f) => readFile(new URL(`../src/${f}`, import.meta.url), 'utf8');

test('index.js: /api/auth và /api/admin đi qua chanTheoIp', async () => {
  const s = await ma('index.js');
  assert.match(s, /app\.use\('\/api\/auth',\s*chanTheoIp\(layIpThat\),\s*authRouter\)/);
  assert.match(s, /app\.use\('\/api\/admin',\s*chanTheoIp\(layIpThat\),\s*adminRouter\)/);
});

test('index.js: phần công dân KHÔNG bị chặn IP', async () => {
  const s = await ma('index.js');
  for (const d of ['submissions', 'tracking', 'chat', 'news', 'cong-vao']) {
    assert.doesNotMatch(s, new RegExp(`app\\.use\\('/api/${d}',\\s*chanTheoIp`), `/api/${d} phải mở cho người dân`);
  }
});

test('may-chu-can-bo.js vẫn chặn IP cho mọi route (không thụt lùi)', async () => {
  assert.match(await ma('may-chu-can-bo.js'), /app\.use\(chanTheoIp\(layIpThat\)\);/);
});
