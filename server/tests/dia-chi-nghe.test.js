/**
 * MÁY CHỦ CHỈ NGHE CỔNG NỘI BỘ KHI ĐỨNG SAU NGINX (ND-083)
 *
 * `trust proxy 1`: máy chủ tin chặng ngay trước nó là proxy. Nghe 0.0.0.0 mà cổng lọt ra
 * ngoài (quên tường lửa B4 / Security Group) thì người ngoài gọi THẲNG cổng, tự đặt
 * X-Forwarded-For = IP được phép -> lọt ADMIN_ALLOWED_IPS (đã thử P96: 403 -> 401).
 * HOST=127.0.0.1 (B7) -> cổng không bao giờ nhận kết nối từ ngoài máy, dù tường lửa sai.
 * Để trống giữ như cũ (Render bắt buộc nghe mọi địa chỉ). Ghi sai -> TỪ CHỐI khởi động.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { diaChiNghe } from '../src/nen-tang.js';

const voi = (gt, fn) => {
  const cu = process.env.HOST;
  if (gt === undefined) delete process.env.HOST; else process.env.HOST = gt;
  try { return fn(); } finally { if (cu === undefined) delete process.env.HOST; else process.env.HOST = cu; }
};

test('để trống: không chọn địa chỉ (giữ như cũ cho Render)', () => {
  assert.equal(voi(undefined, diaChiNghe), undefined);
  assert.equal(voi('', diaChiNghe), undefined);
});

test('địa chỉ nội bộ hợp lệ được nhận', () => {
  for (const d of ['127.0.0.1', '::1', 'localhost', '10.0.0.5']) assert.equal(voi(d, diaChiNghe), d);
});

test('giá trị lạ: từ chối khởi động (fail-safe, allow-list)', () => {
  for (const d of ['127.0.0.1;rm', 'http://127.0.0.1', '0.0.0.0 ', 'abc def', '999.1.1.1']) {
    assert.throws(() => voi(d, diaChiNghe), /HOST/, `phải từ chối "${d}"`);
  }
});

test('ba biến thể khởi động đều nghe theo diaChiNghe()', async () => {
  for (const f of ['index.js', 'may-chu-cong-khai.js', 'may-chu-can-bo.js']) {
    const s = await readFile(new URL(`../src/${f}`, import.meta.url), 'utf8');
    assert.match(s, /app\.listen\(PORT,\s*diaChiNghe\(\),/, `${f} phải gọi app.listen(PORT, diaChiNghe(), ...)`);
  }
});

test('mẫu .env B7 đặt HOST=127.0.0.1 cho cả hai máy chủ', async () => {
  const s = await readFile(new URL('../../docs/HUONG-DAN-TRIEN-KHAI.md', import.meta.url), 'utf8');
  const b7 = s.slice(s.indexOf('### B7.'), s.indexOf('### B8.'));
  const ds = [...b7.matchAll(/```ini\n([\s\S]*?)```/g)].map((m) => m[1]);
  assert.equal(ds.length, 2);
  for (const k of ds) assert.match(k, /^HOST=127\.0\.0\.1$/m);
});
