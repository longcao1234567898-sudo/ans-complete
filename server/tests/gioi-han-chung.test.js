/**
 * ND-063 — GIỚI HẠN CHUNG TÁCH "XEM" VÀ "GỬI"
 *
 * Đo tải P68: nhà mạng 4G cho nhiều thuê bao dùng chung một địa chỉ IP (CGNAT).
 * Giới hạn chung 300 yêu cầu/15 phút cho MỖI IP đếm cả lượt xem lẫn lượt gửi:
 * 100 người chung 1 IP cùng mở trang thì 46% bị 429 — dù họ chỉ XEM tin, xem
 * đường ngập. Nay:
 *   · XEM (GET/HEAD/OPTIONS): 1.500 / 15 phút / IP — đủ cho ~300 lượt vào.
 *     Những GET nặng hay nhạy cảm đã có giới hạn riêng (tra cứu mã 30/phút, đọc
 *     giọng nói, phòng trao đổi…) hoặc bộ đệm (dự báo mưa, thống kê).
 *   · GỬI / SỬA / ĐĂNG NHẬP (mọi phương thức khác): GIỮ NGUYÊN 300 / 15 phút / IP
 *     — chống tin rác (mô hình đe doạ #3) không lỏng ra.
 *   · Hai bên đếm RIÊNG: xem nhiều không làm mất lượt gửi, và ngược lại.
 * Ba biến thể máy chủ dùng chung một thư viện — không còn chép tay ba nơi (ND-010).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import { readFile } from 'node:fs/promises';

const doc = (p) => readFile(new URL(`../${p}`, import.meta.url), 'utf8');

async function dungApp() {
  const { gioiHanChung } = await import('../src/lib/gioi-han-chung.js');
  const app = express();
  app.use(...gioiHanChung());
  app.get('/xem', (_q, r) => r.json({ ok: 1 }));
  app.post('/gui', (_q, r) => r.json({ ok: 1 }));
  const may = http.createServer(app);
  await new Promise((ok) => may.listen(0, '127.0.0.1', ok));
  const goc = `http://127.0.0.1:${may.address().port}`;
  const goi = (pp, method = 'GET') => fetch(goc + pp, { method }).then((r) => r.status);
  /* Gọi n lần, mỗi đợt 50 song song; trả số lần mỗi mã */
  const dem = async (n, pp, method) => {
    const ma = {};
    for (let i = 0; i < n; i += 50) {
      const loat = await Promise.all(Array.from({ length: Math.min(50, n - i) }, () => goi(pp, method)));
      for (const m of loat) ma[m] = (ma[m] || 0) + 1;
    }
    return ma;
  };
  return { may, goi, dem };
}

test('XEM: 1.500 lượt / 15 phút / IP — lượt 1.501 mới bị 429 (trước đây lượt 301 đã bị)', async () => {
  const { may, goi, dem } = await dungApp();
  try {
    const ma = await dem(1500, '/xem', 'GET');
    assert.deepEqual(ma, { 200: 1500 }, `1.500 lượt xem phải qua hết: ${JSON.stringify(ma)}`);
    assert.equal(await goi('/xem'), 429);
  } finally { may.close(); }
});

test('GỬI: GIỮ NGUYÊN 300 / 15 phút / IP — lượt 301 bị 429', async () => {
  const { may, goi, dem } = await dungApp();
  try {
    const ma = await dem(300, '/gui', 'POST');
    assert.deepEqual(ma, { 200: 300 });
    assert.equal(await goi('/gui', 'POST'), 429, 'giới hạn gửi không được nới');
  } finally { may.close(); }
});

test('hai bên đếm RIÊNG: gửi hết lượt vẫn xem được; xem hết lượt vẫn gửi được', async () => {
  const { may, goi, dem } = await dungApp();
  try {
    await dem(301, '/gui', 'POST');
    assert.equal(await goi('/xem'), 200, 'hết lượt gửi không được chặn xem');
    await dem(1500, '/xem', 'GET');
    assert.equal(await goi('/xem'), 429);
  } finally { may.close(); }
  const b = await dungApp();
  try {
    await b.dem(1501, '/xem', 'GET');
    assert.equal(await b.goi('/gui', 'POST'), 200, 'xem hết lượt không được ăn vào lượt gửi');
  } finally { b.may.close(); }
});

test('cả ba biến thể máy chủ dùng chung thư viện — không còn giới hạn chung chép tay', async () => {
  for (const tep of ['src/index.js', 'src/nen-tang.js']) {
    const ma = await doc(tep);
    assert.match(ma, /app\.use\(\.\.\.gioiHanChung\(\)\)/, `${tep} phải dùng gioiHanChung()`);
    assert.doesNotMatch(ma, /rateLimit\(\{\s*windowMs:\s*15 \* 60_000,\s*max:\s*300/, `${tep} còn giới hạn chung chép tay`);
  }
  for (const tep of ['src/may-chu-cong-khai.js', 'src/may-chu-can-bo.js']) {
    assert.match(await doc(tep), /nen-tang\.js/, `${tep} phải đi qua nen-tang.js`);
  }
});
