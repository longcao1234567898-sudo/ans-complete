/**
 * H1 — Phân quyền vai trò trên các thao tác nhạy cảm nhất.
 *
 * Trước bản vá, MỌI cán bộ `handler` đều:
 *   - xem được danh tính đầy đủ của mọi người tố giác qua POST /:id/reveal
 *   - xuất được 2000 dòng nội dung tin báo qua GET /reports/details
 *   - xem được toàn bộ số liệu địa bàn qua /reports/summary và /reports/map
 *
 * Route /reveal CÓ ghi nhật ký — nhưng nhật ký là phát hiện SAU, không phải
 * ngăn chặn. Và logs.js chỉ cho admin/manager xem nhật ký, nên handler biết rõ
 * hành vi của mình không ai ngoài cấp trên nhìn thấy.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { authorize } from '../src/middleware/authorize.js';
import { resGia } from './helpers-test.js';

function chay(staff) {
  const res = resGia();
  let daGoiNext = false;
  authorize('admin', 'manager')({ staff }, res, () => { daGoiNext = true; });
  return { res, daGoiNext };
}

test('handler -> 403 và KHÔNG gọi next', () => {
  const { res, daGoiNext } = chay({ id: 5, role: 'handler' });
  assert.equal(res.statusCode, 403);
  assert.equal(daGoiNext, false, 'next() bị gọi nghĩa là handler vẫn chạm được tới dữ liệu');
});

test('manager -> cho qua', () => {
  const { res, daGoiNext } = chay({ id: 2, role: 'manager' });
  assert.equal(daGoiNext, true);
  assert.equal(res.statusCode, null);
});

test('admin -> cho qua', () => {
  const { daGoiNext } = chay({ id: 1, role: 'admin' });
  assert.equal(daGoiNext, true);
});

test('không có req.staff -> 401, KHÔNG gọi next', () => {
  const { res, daGoiNext } = chay(undefined);
  assert.equal(res.statusCode, 401);
  assert.equal(daGoiNext, false);
});

test('vai trò lạ (ví dụ tài khoản bị sửa role) -> 403', () => {
  const { res, daGoiNext } = chay({ id: 9, role: 'khach' });
  assert.equal(res.statusCode, 403);
  assert.equal(daGoiNext, false);
});

/* ===== Khoá việc GẮN middleware vào đúng route ===== */

test("POST /:id/reveal có gắn authorize('admin','manager')", async () => {
  const nguon = await readFile(new URL('../src/routes/admin/submissions.js', import.meta.url), 'utf8');
  assert.match(
    nguon,
    /router\.post\(\s*'\/:id\/reveal'\s*,\s*authorize\(\s*'admin'\s*,\s*'manager'\s*\)/,
    'Xem danh tính người tố giác không được để handler gọi'
  );
});

test("router reports gắn authorize('admin','manager') ở tầng router", async () => {
  const nguon = await readFile(new URL('../src/routes/admin/reports.js', import.meta.url), 'utf8');
  assert.match(
    nguon,
    /router\.use\(\s*authorize\(\s*'admin'\s*,\s*'manager'\s*\)\s*\)/,
    'Chốt ở tầng router để endpoint báo cáo thêm mới sau này cũng được bảo vệ'
  );
});

test('các authorize sẵn có KHÔNG bị xoá mất khi dọn requireAuth trùng lặp', async () => {
  const kiemTra = [
    ['../src/routes/admin/submissions.js', /'\/:id\/assign',\s*authorize\('admin', 'manager'\)/],
    ['../src/routes/admin/logs.js', /authorize\('admin', 'manager'\)/],
    ['../src/routes/admin/banned-words.js', /authorize\('admin', 'manager'\)/],
  ];
  for (const [duong, mau] of kiemTra) {
    const nguon = await readFile(new URL(duong, import.meta.url), 'utf8');
    assert.match(nguon, mau, `${duong} mất authorize — dọn nhầm rồi`);
  }
});
