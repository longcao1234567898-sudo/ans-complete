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

test('index.js: gắn chanTheoIpPhanCanBo TRƯỚC /api/auth và /api/admin', async () => {
  const s = await ma('index.js');
  const chan = s.indexOf('app.use(chanTheoIpPhanCanBo(layIpThat));');
  assert.ok(chan > 0, 'index.js phải gắn app.use(chanTheoIpPhanCanBo(layIpThat))');
  assert.ok(chan < s.indexOf("app.use('/api/auth', authRouter);"), 'phải gắn trước /api/auth');
  assert.ok(chan < s.indexOf("app.use('/api/admin', adminRouter);"), 'phải gắn trước /api/admin');
});

test('chanTheoIpPhanCanBo chỉ chặn đường của cán bộ', async () => {
  const { chanTheoIpPhanCanBo } = await import('../src/nen-tang.js');
  const cu = process.env.ADMIN_ALLOWED_IPS;
  process.env.ADMIN_ALLOWED_IPS = '10.9.9.9';
  try {
    const mw = chanTheoIpPhanCanBo(() => '1.2.3.4');
    const chay = (path) => { let ma = 0; let qua = false; mw({ path }, { status: (m) => { ma = m; return { json: () => {} }; } }, () => { qua = true; }); return qua ? 'qua' : ma; };
    assert.equal(chay('/api/auth/login'), 403);
    assert.equal(chay('/api/admin/submissions'), 403);
    assert.equal(chay('/api/admin'), 403);
    assert.equal(chay('/api/submissions'), 'qua');
    assert.equal(chay('/api/tracking/ABC123'), 'qua');
    assert.equal(chay('/api/administrator'), 'qua');
  } finally { if (cu === undefined) delete process.env.ADMIN_ALLOWED_IPS; else process.env.ADMIN_ALLOWED_IPS = cu; }
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
