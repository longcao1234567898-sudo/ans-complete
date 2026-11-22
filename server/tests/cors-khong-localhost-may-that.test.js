/**
 * MÁY THẬT KHÔNG CHO TRANG Ở localhost GỌI KÈM COOKIE (BUG-053)
 *
 * CORS luôn có http://localhost:3000/4173/5173 trong danh sách cho phép, kèm credentials: true,
 * kể cả khi NODE_ENV=production. Một trang bất kỳ chạy ở localhost trên máy cán bộ (phần mềm
 * cài kèm, tiện ích, công cụ dev) là "nguồn được tin" của máy chủ thật. Allow-list (luật 5):
 * chỉ thêm nguồn dev khi máy khai TƯỜNG MINH development/test — Render không đặt NODE_ENV,
 * nên "không phải production" không đủ (cùng mẫu BUG-025).
 */
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const envCu = process.env.NODE_ENV;
afterEach(() => { if (envCu === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = envCu; });

async function choPhep(nodeEnv, origin) {
  if (nodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = nodeEnv;
  const { taoApp } = await import('../src/nen-tang.js');
  const app = taoApp({ ten: 'thu' });
  app.get('/api/x', (_req, res) => res.json({ ok: true }));
  app.use((_err, _req, res, _next) => res.status(403).end());
  const sv = await new Promise((ok) => { const s = app.listen(0, '127.0.0.1', () => ok(s)); });
  try {
    const r = await fetch(`http://127.0.0.1:${sv.address().port}/api/x`, { headers: { Origin: origin } });
    return r.headers.get('access-control-allow-origin') === origin;
  } finally { sv.close(); }
}

test('production / không khai / khai sai chữ: localhost KHÔNG được cho phép', async () => {
  for (const e of ['production', undefined, 'prod']) {
    for (const o of ['http://localhost:3000', 'http://localhost:5173']) {
      assert.equal(await choPhep(e, o), false, `NODE_ENV=${e}: ${o} vẫn được tin kèm cookie`);
    }
  }
});

test('development / test: localhost vẫn được (máy lập trình chạy giao diện dev)', async () => {
  for (const e of ['development', 'test']) assert.equal(await choPhep(e, 'http://localhost:3000'), true, e);
});

test('nguồn khai trong CORS_ORIGIN vẫn được ở production (đối chứng)', async () => {
  const cu = process.env.CORS_ORIGIN;
  process.env.CORS_ORIGIN = 'https://www.vi-du.vn';
  try { assert.equal(await choPhep('production', 'https://www.vi-du.vn'), true); }
  finally { if (cu === undefined) delete process.env.CORS_ORIGIN; else process.env.CORS_ORIGIN = cu; }
});

test('index.js (bản gộp) cũng chỉ thêm nguồn dev khi khai development/test', async () => {
  const s = (await readFile(new URL('../src/index.js', import.meta.url), 'utf8'))
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(s, /\[\s*\.\.\.devOrigins\s*,/, 'index.js còn ghép devOrigins vô điều kiện');
  assert.match(s, /\['development',\s*'test'\]\.includes\(process\.env\.NODE_ENV/);
});
