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

/* RETEST P104 (phiên độc lập): Express khớp đường dẫn KHÔNG phân biệt hoa thường — /API/ADMIN vẫn
   vào adminRouter, nên lớp chặn phải khớp đúng như Express khớp, không tự so chuỗi. Chạy thật qua
   HTTP để đi cùng đường với yêu cầu thật (không dựng req giả). */
test('chanTheoIpPhanCanBo chặn mọi cách viết đường dẫn mà Express vẫn đưa vào phần cán bộ', async () => {
  const express = (await import('express')).default;
  const { chanTheoIpPhanCanBo } = await import('../src/nen-tang.js');
  const cu = process.env.ADMIN_ALLOWED_IPS;
  process.env.ADMIN_ALLOWED_IPS = '10.9.9.9';
  const app = express();
  app.use(chanTheoIpPhanCanBo(() => '1.2.3.4'));
  const vao = express.Router();
  vao.all('*', (req, res) => res.send('vao'));
  app.use('/api/auth', vao);
  app.use('/api/admin', vao);
  app.use('/api/submissions', vao);
  const sv = await new Promise((ok) => { const s = app.listen(0, '127.0.0.1', () => ok(s)); });
  const goi = async (u) => (await fetch(`http://127.0.0.1:${sv.address().port}${u}`)).status;
  try {
    for (const u of ['/api/auth/login', '/api/admin', '/api/admin/submissions', '/API/ADMIN/submissions',
      '/Api/Auth/login', '/api/AUTH/refresh', '/api/admin/', '/api/Admin']) {
      const ma = await goi(u);
      assert.ok(ma !== 200, `${u} vào được phần cán bộ (mã ${ma}) dù IP ngoài danh sách`);
    }
    for (const u of ['/api/submissions', '/API/SUBMISSIONS', '/api/administrator', '/api/authx']) {
      assert.equal(await goi(u), u === '/api/administrator' || u === '/api/authx' ? 404 : 200, `${u}: phần công dân không được bị chặn IP`);
    }
  } finally {
    sv.close();
    if (cu === undefined) delete process.env.ADMIN_ALLOWED_IPS; else process.env.ADMIN_ALLOWED_IPS = cu;
  }
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
