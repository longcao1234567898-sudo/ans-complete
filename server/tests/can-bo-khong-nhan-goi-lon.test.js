/**
 * MÁY CHỦ CÁN BỘ KHÔNG NHẬN GÓI LỚN (phát hiện phụ của RETEST BUG-048 lần 2)
 *
 * Danh sách đường được đọc 32 MB (POST /api/submissions, /api/chat/bo-sung) áp ở mức app trong
 * nen-tang.js, nên may-chu-can-bo.js — không gắn hai route đó — vẫn đọc trọn gói lớn rồi mới trả
 * 404. Máy chủ cán bộ không có đường nào cần quá 1 MB.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { datBienMoiTruongHopLe } from './helpers-test.js';

datBienMoiTruongHopLe();
const nt = await import('../src/nen-tang.js');
const boChuThich = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('ganDocThan với danh sách đường gói lớn RỖNG: gói 2 MB tới /api/submissions nhận 413', async () => {
  const app = nt.taoApp({ ten: 'can-bo' });
  nt.ganDocThan(app, { duongGoiLon: [] });
  app.post('/api/submissions', (_req, res) => res.json({ ok: true }));
  const sv = await new Promise((ok) => { const s = app.listen(0, '127.0.0.1', () => ok(s)); });
  try {
    const r = await fetch(`http://127.0.0.1:${sv.address().port}/api/submissions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ x: 'a'.repeat(2 * 1024 * 1024) }),
    });
    assert.equal(r.status, 413, `máy chủ không cần gói lớn vẫn đọc 2 MB (ra ${r.status})`);
  } finally { sv.closeAllConnections(); sv.close(); }
});

test('may-chu-can-bo.js khai danh sách đường gói lớn rỗng; hai máy chủ còn lại giữ mặc định', async () => {
  const doc = async (f) => boChuThich(await readFile(new URL(`../src/${f}`, import.meta.url), 'utf8'));
  assert.match(await doc('may-chu-can-bo.js'), /ganDocThan\(app,\s*\{\s*duongGoiLon:\s*\[\]\s*\}\)/);
  assert.match(await doc('may-chu-cong-khai.js'), /ganDocThan\(app\);/);
  assert.match(await doc('index.js'), /ganDocThan\(app\);/);
});

/* Phát hiện phụ C của RETEST BUG-048 lần 3: danh sách đường truyền vào ganDocThan phải viết thường,
   không "/" cuối thì mới khớp — bẫy cho người gọi sau. Chuẩn hoá ngay khi nhận. */
test('danh sách đường gói lớn viết hoa / có "/" cuối vẫn khớp như mặc định', async () => {
  const app = nt.taoApp({ ten: 'thu' });
  nt.ganDocThan(app, { duongGoiLon: ['/API/Submissions/'] });
  app.post('/api/submissions', (_req, res) => res.json({ ok: true }));
  const sv = await new Promise((ok) => { const s = app.listen(0, '127.0.0.1', () => ok(s)); });
  try {
    const r = await fetch(`http://127.0.0.1:${sv.address().port}/api/submissions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ x: 'a'.repeat(2 * 1024 * 1024) }),
    });
    assert.equal(r.status, 200, `đường khai '/API/Submissions/' không khớp (ra ${r.status})`);
  } finally { sv.closeAllConnections(); sv.close(); }
});
