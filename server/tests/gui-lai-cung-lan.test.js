/**
 * P91 — GỬI LẠI CÙNG MỘT LẦN: không tạo đơn trùng, không mất mã tra cứu
 *
 * Giao diện sẽ tự gửi lại khi mạng chập chờn / có mạng trở lại (P92). Mạng đứt
 * đúng lúc máy chủ đã lưu đơn mà chưa kịp trả lời thì lần gửi lại trước đây bị
 * chặn "nội dung vừa gửi" -> người dân mất mã tra cứu và PIN phòng trao đổi (PIN
 * chỉ trả một lần). Mỗi lần gửi mang mã ngẫu nhiên `maLanGui`; máy chủ nhận ra
 * lần gửi lại và trả lại đúng hồ sơ đó.
 *
 * Không được lộ gì: thiếu mã / mã khác / NỘI DUNG khác thì không bao giờ trả mã
 * tra cứu của hồ sơ nào; bảng chỉ giữ băm của mã.
 */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import crypto from 'node:crypto';
import { datBienMoiTruongHopLe } from './helpers-test.js';
import { BO_QUA, dungCsdl, donCoTen } from './khung-sqlite.js';

datBienMoiTruongHopLe();

const { pool } = await import('../src/db.js');
const { default: submissionsRouter } = await import('../src/routes/submissions.js');
const { kiemPin } = await import('../src/lib/bam-pin.js');

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '2mb' }));
app.use('/api/submissions', submissionsRouter);
const server = app.listen(0);
test.after(() => server.close());

let ctl;
beforeEach(() => {
  if (!BO_QUA) {
    ctl = dungCsdl(pool);
    ctl.dongHo = Math.floor(Date.now() / 1000) * 1000;
  }
});

let soIp = 0;
const ipMoi = () => `10.91.${(++soIp >> 8) & 255}.${soIp & 255}`;
const gui = async (don, ip = ipMoi()) => {
  const r = await fetch(`http://127.0.0.1:${server.address().port}/api/submissions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip },
    body: JSON.stringify(don),
  });
  return { status: r.status, body: await r.json().catch(() => null) };
};
const soDon = () => ctl.db.prepare('SELECT COUNT(*) n FROM submissions').get().n;
const pinCua = (ma) => ctl.db.prepare('SELECT chat_pin_hash h FROM submissions WHERE tracking_code = ?').get(ma).h;
const AN_DANH = {
  isAnonymous: true, category: 'to_giac',
  content: 'Khoảng 22 giờ tối qua tại bãi đất trống cuối hẻm 41 khu phố 3 có nhóm khoảng năm người tụ tập trao đổi gói nhỏ nghi là ma tuý, đi xe máy không biển số.',
};

test('gửi lại ĐÚNG mã lần gửi (mạng đứt lúc chờ trả lời): trả lại mã tra cứu cũ + PIN mới dùng được, KHÔNG thêm đơn', { skip: BO_QUA }, async () => {
  const maLanGui = crypto.randomUUID();
  const don = { ...donCoTen(0), maLanGui };
  const lan1 = await gui(don);
  assert.equal(lan1.status, 201, JSON.stringify(lan1.body));
  /* giả như câu trả lời lần 1 bị mất — gửi lại từ mạng khác (4G đổi IP) */
  const lan2 = await gui(don);
  assert.equal(lan2.status, 200, JSON.stringify(lan2.body));
  assert.equal(lan2.body.trackingCode, lan1.body.trackingCode);
  assert.equal(lan2.body.daNhanTruoc, true);
  assert.match(String(lan2.body.chatPin), /^\d{6}$/);
  assert.equal(await kiemPin(lan2.body.chatPin, pinCua(lan1.body.trackingCode)), true, 'PIN mới không mở được phòng');
  assert.equal(soDon(), 1, 'gửi lại tạo đơn thứ hai');
});

test('không gửi mã lần gửi: như cũ — gửi lại nội dung vừa gửi bị chặn trùng', { skip: BO_QUA }, async () => {
  const don = donCoTen(1);
  assert.equal((await gui(don)).status, 201);
  const lan2 = await gui(don);
  assert.equal(lan2.status, 429);
  assert.equal(lan2.body.trackingCode, undefined);
  assert.equal(soDon(), 1);
});

test('mã lần gửi đúng nhưng NỘI DUNG khác: không trả mã tra cứu của hồ sơ kia, không tạo đơn', { skip: BO_QUA }, async () => {
  const maLanGui = crypto.randomUUID();
  const lan1 = await gui({ ...donCoTen(2), maLanGui });
  assert.equal(lan1.status, 201);
  const khac = await gui({ ...donCoTen(3), maLanGui });
  assert.notEqual(khac.status, 201);
  assert.notEqual(khac.status, 200);
  assert.equal(khac.body?.trackingCode, undefined, 'lộ mã tra cứu hồ sơ khác');
  assert.equal(soDon(), 1);
});

test('mã lần gửi sai dạng (không phải UUID, mảng, số): coi như không có — gửi bình thường, không lỗi', { skip: BO_QUA }, async () => {
  for (const [i, ma] of [['abc'], [['x']], [123], ['zzzzzzzz-zzzz-4zzz-azzz-zzzzzzzzzzzz']].entries()) {
    const r = await gui({ ...donCoTen(4 + i), maLanGui: ma[0] });
    assert.equal(r.status, 201, `#${i} ${JSON.stringify(r.body)}`);
  }
  assert.equal(ctl.db.prepare('SELECT COUNT(*) n FROM lan_gui_y_kien').get().n, 0);
});

test('gửi DỒN 6 lần cùng mã cùng lúc (trang + gửi ngầm cùng chạy): đúng MỘT đơn; lần sau lấy lại được mã tra cứu', { skip: BO_QUA }, async () => {
  const maLanGui = crypto.randomUUID();
  const don = { ...donCoTen(5), maLanGui };
  const kq = await Promise.all(Array.from({ length: 6 }, () => gui(don)));
  assert.equal(soDon(), 1, kq.map((r) => r.status).join(','));
  const thanhCong = kq.filter((r) => r.status === 201);
  assert.equal(thanhCong.length, 1, kq.map((r) => r.status).join(','));
  const sau = await gui(don);
  assert.equal(sau.status, 200);
  assert.equal(sau.body.trackingCode, thanhCong[0].body.trackingCode);
});

test('lần đầu hỏng giữa chừng (lỗi CSDL khi lưu): gửi lại cùng mã thì lưu được, không kẹt', { skip: BO_QUA }, async () => {
  const maLanGui = crypto.randomUUID();
  const don = { ...donCoTen(6), maLanGui };
  ctl.db.exec("CREATE TRIGGER hong BEFORE INSERT ON submissions BEGIN SELECT RAISE(ABORT, 'lỗi giả'); END");
  assert.equal((await gui(don)).status, 500);
  ctl.db.exec('DROP TRIGGER hong');
  const lan2 = await gui(don);
  assert.equal(lan2.status, 201, JSON.stringify(lan2.body));
  assert.equal(soDon(), 1);
});

test('tin ẩn danh gửi lại: trả lại mã tra cứu, không mang danh tính; bảng chỉ giữ băm của mã', { skip: BO_QUA }, async () => {
  const maLanGui = crypto.randomUUID();
  const lan1 = await gui({ ...AN_DANH, maLanGui });
  assert.equal(lan1.status, 201, JSON.stringify(lan1.body));
  const lan2 = await gui({ ...AN_DANH, maLanGui });
  assert.equal(lan2.status, 200);
  assert.equal(lan2.body.trackingCode, lan1.body.trackingCode);
  assert.equal(lan2.body.pendingReview, true);
  assert.equal(lan2.body.contact?.phone ?? '', '');
  const bang = JSON.stringify(ctl.db.prepare('SELECT * FROM lan_gui_y_kien').all());
  assert.ok(!bang.includes(maLanGui), 'lưu mã lần gửi thô');
});

test('quá 24 giờ thì không nhận ra nữa: gửi lại là đơn mới bình thường (không kẹt)', { skip: BO_QUA }, async () => {
  const maLanGui = crypto.randomUUID();
  assert.equal((await gui({ ...donCoTen(7), maLanGui })).status, 201);
  ctl.troiQua(25 * 60);
  const r = await gui({ ...donCoTen(7), maLanGui });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.daNhanTruoc, undefined);
});

test('chưa chạy nang_cap_v40.sql: vẫn nhận ý kiến (có hay không có mã lần gửi)', { skip: BO_QUA }, async () => {
  ctl.db.exec('DROP TABLE lan_gui_y_kien');
  assert.equal((await gui({ ...donCoTen(0), maLanGui: crypto.randomUUID() })).status, 201);
  assert.equal((await gui(donCoTen(1))).status, 201);
});
