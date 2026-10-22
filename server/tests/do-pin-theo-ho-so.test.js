/**
 * BUG-040 — THỬ MÃ PIN PHÒNG TRAO ĐỔI PHẢI BỊ GIỚI HẠN THEO HỒ SƠ, KHÔNG CHỈ THEO IP
 *
 * Kẻ đã biết mã tra cứu (nhìn thấy trên phiếu, ảnh chụp màn hình, người nhà) dò
 * PIN 6 số từ nhiều IP: giới hạn 5 lần/15 phút cho MỖI IP thì 1.000 IP thuê là
 * ~20.000 lần/giờ. Vào được phòng là đọc câu hỏi nghiệp vụ của cán bộ và mạo
 * danh người tố giác. Bật IPv6 thì mỗi máy có hàng tỷ địa chỉ — giới hạn theo
 * IP coi như không có.
 *
 * Mỗi lượt gọi ở đây đến từ một IP khác (qua `trust proxy` như sau Nginx), nên
 * giới hạn theo IP không bao giờ chạm — chỉ giới hạn theo hồ sơ mới chặn được.
 *
 * Biến thể (Bug Log): (a) nhiều IP cùng nhắm một mã · (b) IPv6 — đổi địa chỉ
 * mỗi lần · (c) khoá không được thành cách khoá hẳn người thật: có hạn, tra cứu
 * tiến độ vẫn chạy, cán bộ thấy cảnh báo · (d) đếm atomic — gửi dồn song song
 * không lọt quá ngưỡng.
 */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { datBienMoiTruongHopLe } from './helpers-test.js';
import { BO_QUA, dungCsdl, goi, donCoTen, PHO } from './khung-sqlite.js';

datBienMoiTruongHopLe();

const { pool } = await import('../src/db.js');
const { default: submissionsRouter } = await import('../src/routes/submissions.js');
const { default: chatRouter } = await import('../src/routes/chat.js');
const { default: trackingRouter } = await import('../src/routes/tracking.js');
const { default: adminRouter } = await import('../src/routes/admin/index.js');
const { signAccessToken } = await import('../src/lib/token.js');

let ctl;
beforeEach(() => { if (!BO_QUA) ctl = dungCsdl(pool); });

/* Một app chung cho cả file (bộ đếm theo IP của express-rate-limit nằm trong
   router, dùng chung giữa các test — mỗi lượt gọi mang một IP chưa dùng). */
const app = express();
app.set('trust proxy', 1);
app.use(express.json());
app.use('/api/chat', chatRouter);
app.use('/api/tracking', trackingRouter);
const server = app.listen(0);
const cong = () => server.address().port;
let soIp = 0;
const ipMoi = (v6 = false) => {
  soIp++;
  return v6 ? `2001:db8:${(soIp >> 16).toString(16)}:${(soIp & 0xffff).toString(16)}::1` : `10.${(soIp >> 16) & 255}.${(soIp >> 8) & 255}.${soIp & 255}`;
};

async function moPhong(code, pin, ip = ipMoi()) {
  const r = await fetch(`http://127.0.0.1:${cong()}/api/chat/open`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip },
    body: JSON.stringify({ code, pin }),
  });
  return { status: r.status, body: await r.json().catch(() => null) };
}
const pinSai = (pin, k) => String(((Number(pin) - 100000 + 1 + k) % 900000) + 100000);

async function taoHoSo(i = 0) {
  const r = await goi({ duongGoc: '/api/submissions', router: submissionsRouter, method: 'POST', duong: '/', body: donCoTen(i) });
  assert.equal(r.status, 201, r.text.slice(0, 200));
  return { code: r.body.trackingCode, pin: String(r.body.chatPin) };
}

test.after(() => server.close());

test('(a) 40 IP khác nhau cùng dò một mã: sau ngưỡng thì bị chặn, kể cả lượt sau mang đúng PIN', { skip: BO_QUA }, async () => {
  const { code, pin } = await taoHoSo(0);
  const ma = [];
  for (let k = 0; k < 40; k++) ma.push((await moPhong(code, pinSai(pin, k))).status);
  const kiemPin = ma.filter((m) => m === 401).length;
  assert.ok(kiemPin <= 10, `${kiemPin}/40 lần sai được đem đi kiểm PIN — không có giới hạn theo hồ sơ (${ma.join(',')})`);
  assert.ok(ma.slice(-5).every((m) => m === 429), `cuối loạt phải bị chặn 429: ${ma.slice(-5)}`);
  const dung = await moPhong(code, pin);
  assert.equal(dung.status, 429, 'đang khoá thì đúng PIN cũng không vào — nếu không, kẻ dò chỉ cần thử tiếp');
});

test('(b) IPv6: đổi địa chỉ mỗi lần cũng không qua được ngưỡng của hồ sơ', { skip: BO_QUA }, async () => {
  const { code, pin } = await taoHoSo(1);
  let kiemPin = 0;
  for (let k = 0; k < 25; k++) if ((await moPhong(code, pinSai(pin, k), ipMoi(true))).status === 401) kiemPin++;
  assert.ok(kiemPin <= 10, `${kiemPin}/25 lần sai từ IPv6 được đem đi kiểm PIN`);
});

test('(c) khoá có hạn: tra cứu tiến độ vẫn chạy, 24 giờ sau người thật vào lại được', { skip: BO_QUA }, async () => {
  const { code, pin } = await taoHoSo(2);
  for (let k = 0; k < 12; k++) await moPhong(code, pinSai(pin, k));
  const khoa = await moPhong(code, pin);
  assert.equal(khoa.status, 429);
  assert.match(khoa.body?.error ?? '', /tra cứu/i, 'phải chỉ bà con vẫn tra cứu tiến độ được');
  const tc = await fetch(`http://127.0.0.1:${cong()}/api/tracking/${code}`, { headers: { 'X-Forwarded-For': ipMoi() } });
  assert.equal(tc.status, 200, 'khoá phòng trao đổi không được khoá luôn tra cứu tiến độ');
  ctl.troiQua(24 * 60 + 1);
  assert.equal((await moPhong(code, pin)).status, 200, 'hết hạn khoá mà người thật vẫn không vào được');
});

test('(c) mở đúng PIN nhiều lần trong ngày không tự khoá người thật', { skip: BO_QUA }, async () => {
  const { code, pin } = await taoHoSo(3);
  for (let k = 0; k < 15; k++) assert.equal((await moPhong(code, pin)).status, 200, `lần mở đúng thứ ${k + 1}`);
  assert.equal((await moPhong(code, pinSai(pin, 0))).status, 401, 'chỉ lần SAI mới bị đếm');
});

test('(c) khoá theo từng hồ sơ: hồ sơ khác không bị vạ lây', { skip: BO_QUA }, async () => {
  const a = await taoHoSo(4);
  const b = await taoHoSo(5);
  for (let k = 0; k < 12; k++) await moPhong(a.code, pinSai(a.pin, k));
  assert.equal((await moPhong(b.code, b.pin)).status, 200);
});

test('(c) cán bộ thấy cảnh báo hồ sơ đang bị dò PIN', { skip: BO_QUA }, async () => {
  const { code, pin } = await taoHoSo(6);
  for (let k = 0; k < 12; k++) await moPhong(code, pinSai(pin, k));
  const [[hs]] = await pool.query('SELECT id FROM submissions WHERE tracking_code = ?', [code]);
  const r = await goi({ duongGoc: '/api/admin', router: adminRouter, staff: PHO, signAccessToken, method: 'GET', duong: `/chat/${hs.id}/messages` });
  assert.equal(r.status, 200, r.text.slice(0, 200));
  assert.equal(r.body?.doPin?.biKhoa, true, `thiếu cảnh báo dò PIN: ${JSON.stringify(r.body?.doPin)}`);
});

test('(d) 40 lượt sai gửi DỒN CÙNG LÚC từ 40 IP: không quá ngưỡng lượt được kiểm PIN', { skip: BO_QUA }, async () => {
  const { code, pin } = await taoHoSo(7);
  const ma = await Promise.all(Array.from({ length: 40 }, (_, k) => moPhong(code, pinSai(pin, k)).then((r) => r.status)));
  const kiemPin = ma.filter((m) => m === 401).length;
  assert.ok(kiemPin <= 10, `${kiemPin}/40 lượt gửi dồn lọt vào kiểm PIN — đếm không atomic`);
});

test('fail-safe: thiếu bảng đếm (chưa chạy nâng cấp) thì KHÔNG mở phòng', { skip: BO_QUA }, async () => {
  const { code, pin } = await taoHoSo(8);
  ctl.db.exec('DROP TABLE IF EXISTS khoa_mo_phong');
  const r = await moPhong(code, pin);
  assert.equal(r.status, 503, `không đếm được lần thử mà vẫn mở phòng: ${r.status}`);
});
