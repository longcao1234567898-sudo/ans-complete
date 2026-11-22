/**
 * ĐỌC THÂN YÊU CẦU SAU KHI CHẶN, VÀ CHỈ ĐỌC LỚN Ở ĐÚNG HAI ĐƯỜNG CẦN (BUG-048)
 *
 * Trước: express.json({ limit: '32mb' }) gắn cho MỌI đường, đứng TRƯỚC giới hạn lượt chung
 * và trước chặn IP cán bộ. Mọi yêu cầu — kể cả từ IP đã bị 429, IP ngoài dải cơ quan — đều
 * được đọc trọn tới 32 MB và JSON.parse vào bộ nhớ rồi mới bị từ chối. Vài chục yêu cầu song
 * song là đủ làm máy 4 GB tràn bộ nhớ: kênh tiếp nhận tố giác ngừng (mô hình đe doạ 3).
 *
 * Sau: giới hạn lượt và chặn IP chạy trước khi đọc thân; 32 MB chỉ cho POST /api/submissions
 * và POST /api/chat/bo-sung (hai đường nhận ảnh, tài liệu); mọi đường khác 1 MB.
 * Luật CLAUDE.md: sửa lớp bảo vệ ở một biến thể khởi động phải kiểm cả ba.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const ma = (f) => readFile(new URL(`../src/${f}`, import.meta.url), 'utf8');
const boChuThich = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

async function chay(app, fn) {
  const sv = await new Promise((ok) => { const s = app.listen(0, '127.0.0.1', () => ok(s)); });
  try { return await fn(`http://127.0.0.1:${sv.address().port}`); } finally { sv.close(); }
}

const goiJson = (url, than) => fetch(url, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: than,
});

/* ~2 MB JSON hợp lệ: lớn hơn giới hạn thường, nhỏ hơn 32 MB */
const THAN_2MB = JSON.stringify({ x: 'a'.repeat(2 * 1024 * 1024) });

async function dungApp({ chanIp } = {}) {
  const nt = await import('../src/nen-tang.js');
  const app = nt.taoApp({ ten: 'thu' });
  if (chanIp) app.use(nt.chanTheoIp(() => '1.2.3.4'));
  if (typeof nt.ganDocThan === 'function') nt.ganDocThan(app);
  const tra = (req, res) => res.json({ co: !!req.body?.x });
  app.post('/api/submissions', tra);
  app.post('/api/chat/bo-sung', tra);
  app.post('/api/news/x', tra);
  app.post('/api/admin/x', tra);
  app.post('/api/submissions/kiem-tra-khoa', tra);
  return app;
}

test('gói 2 MB: chỉ POST /api/submissions và /api/chat/bo-sung nhận, đường khác 413', async () => {
  const app = await dungApp();
  await chay(app, async (goc) => {
    for (const d of ['/api/submissions', '/api/chat/bo-sung']) {
      const r = await goiJson(goc + d, THAN_2MB);
      assert.equal(r.status, 200, `${d} phải nhận gói 2 MB (ảnh, tài liệu)`);
    }
    for (const d of ['/api/news/x', '/api/admin/x', '/api/submissions/kiem-tra-khoa']) {
      const r = await goiJson(goc + d, THAN_2MB);
      assert.equal(r.status, 413, `${d} không cần gói lớn — phải từ chối 413, đang ${r.status}`);
    }
  });
});

test('máy chủ cán bộ: IP ngoài dải bị chặn 403 TRƯỚC khi máy chủ đọc thân yêu cầu', async () => {
  const cu = process.env.ADMIN_ALLOWED_IPS;
  process.env.ADMIN_ALLOWED_IPS = '10.9.9.9';
  try {
    const app = await dungApp({ chanIp: true });
    await chay(app, async (goc) => {
      /* Thân hỏng: đọc trước thì ra 400 (lỗi JSON), chặn trước thì ra 403 */
      const r = await goiJson(goc + '/api/admin/x', '{hong');
      assert.equal(r.status, 403, `phải chặn IP trước khi đọc thân, đang ${r.status}`);
    });
  } finally {
    if (cu === undefined) delete process.env.ADMIN_ALLOWED_IPS; else process.env.ADMIN_ALLOWED_IPS = cu;
  }
});

test('taoApp không tự đọc thân; giới hạn lượt chung nằm trong taoApp (chạy trước ganDocThan)', async () => {
  const s = boChuThich(await ma('nen-tang.js'));
  const than = s.slice(s.indexOf('export function taoApp'), s.indexOf('export function ganDuoi'));
  assert.doesNotMatch(than, /express\.json\(/, 'taoApp còn đọc thân — sẽ chạy trước chặn IP');
  assert.match(than, /gioiHanChung\(\)/);
});

test('cả ba biến thể khởi động: đọc thân SAU chặn IP và TRƯỚC mọi route', async () => {
  const cb = boChuThich(await ma('may-chu-can-bo.js'));
  const iChan = cb.indexOf('app.use(chanTheoIp(layIpThat));');
  const iDoc = cb.indexOf('ganDocThan(app);');
  assert.ok(iChan > 0 && iDoc > iChan, 'may-chu-can-bo.js: phải gọi ganDocThan(app) sau chanTheoIp');
  assert.ok(iDoc < cb.indexOf("app.use('/api/auth'"), 'may-chu-can-bo.js: ganDocThan phải trước route');

  const ck = boChuThich(await ma('may-chu-cong-khai.js'));
  const iDocCk = ck.indexOf('ganDocThan(app);');
  assert.ok(iDocCk > 0 && iDocCk < ck.indexOf("app.use('/api/"), 'may-chu-cong-khai.js: ganDocThan phải trước route');

  const gop = boChuThich(await ma('index.js'));
  assert.doesNotMatch(gop, /express\.json\(/, 'index.js còn tự đọc thân trước giới hạn lượt');
  const iChanGop = gop.indexOf('app.use(chanTheoIpPhanCanBo(layIpThat));');
  const iDocGop = gop.indexOf('ganDocThan(app);');
  assert.ok(iChanGop > 0 && iDocGop > iChanGop, 'index.js: ganDocThan phải sau chanTheoIpPhanCanBo');
  assert.ok(iDocGop < gop.indexOf("app.use('/api/auth'"), 'index.js: ganDocThan phải trước route');
  assert.ok(gop.indexOf('gioiHanChung()') < iDocGop, 'index.js: giới hạn lượt phải trước đọc thân');
});

test('gói quá lớn vẫn được báo lỗi dễ hiểu (413 kèm lời nhắn), không thành "lỗi mạng"', async () => {
  const app = await dungApp();
  await chay(app, async (goc) => {
    const r = await goiJson(goc + '/api/news/x', THAN_2MB);
    assert.equal(r.status, 413);
    assert.match((await r.json()).error, /quá lớn/);
  });
});
