/**
 * /api/health PHẢI BIẾT KHO DỮ LIỆU CHẾT (ND-084)
 *
 * P96: tắt kho thì tra cứu, tin tức đều 500 nhưng /api/health vẫn "ok":true -> công cụ
 * theo dõi không báo, và giao diện (kiemTraMayChu) không đưa người dân sang trang dự
 * phòng có số 113. Mã trạng thái VẪN 200 (Render dùng đường này để biết tiến trình sống
 * — trả 5xx thì Render khởi động lại mãi, không chữa được kho); trạng thái kho ở "db" và
 * "ok". Hỏi kho có hạn chờ và nhớ ngắn hạn: health là đường công khai, không được thành
 * cách dồn tải lên kho.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { taoKiemKho } from '../src/lib/kiem-kho.js';

const ngu = (ms) => new Promise((ok) => setTimeout(ok, ms));

test('kho trả lời -> true; kho lỗi -> false', async () => {
  assert.equal(await taoKiemKho({ query: async () => [[{ 1: 1 }]] })(), true);
  assert.equal(await taoKiemKho({ query: async () => { throw new Error('ECONNREFUSED'); } })(), false);
});

test('kho treo -> false sau hạn chờ, không treo health', async () => {
  const kiem = taoKiemKho({ query: () => new Promise(() => {}) }, { hanChoMs: 50 });
  const t0 = Date.now();
  assert.equal(await kiem(), false);
  assert.ok(Date.now() - t0 < 1000);
});

test('nhớ kết quả trong khoảng ngắn: nhiều lần gọi health chỉ hỏi kho một lần', async () => {
  let lan = 0;
  const kiem = taoKiemKho({ query: async () => { lan += 1; return [[]]; } }, { nhoMs: 200 });
  await Promise.all([kiem(), kiem(), kiem()]);
  await kiem();
  assert.equal(lan, 1);
  await ngu(250);
  await kiem();
  assert.equal(lan, 2);
});

test('/api/health của máy chủ dùng chung (nen-tang) có trường db; không có kho -> ok:false, mã 200', async () => {
  process.env.DB_HOST = '127.0.0.1'; process.env.DB_PORT = '1';   // cổng không ai nghe
  const { taoApp } = await import('../src/nen-tang.js');
  const app = taoApp({ ten: 'thu' });
  const sv = app.listen(0);
  try {
    const r = await fetch(`http://127.0.0.1:${sv.address().port}/api/health`);
    const j = await r.json();
    assert.equal(r.status, 200);
    assert.equal(j.db, false);
    assert.equal(j.ok, false);
  } finally { sv.close(); }
});
