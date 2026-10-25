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
 * tra cứu của hồ sơ nào; CSDL chỉ giữ băm của mã.
 *
 * Bản 2 (trọng tài P91 tìm 5 lỗi ở bản 1): gửi lại trả ĐÚNG PIN đã cấp (không đặt
 * PIN mới — PIN người dân đã chép không được mất hiệu lực), không ghi gì lên đơn;
 * lệch bất kỳ phần nào (ẩn danh/có tên, nội dung, tệp) thì 409; tệp không nhận
 * được vẫn được báo lại; CSDL rớt giữa chừng không làm kẹt mã.
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
app.use(express.json({ limit: '32mb' }));   // như nen-tang.js
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
const dongCua = (ma) => ({ ...ctl.db.prepare('SELECT * FROM submissions WHERE tracking_code = ?').get(ma) });
const AN_DANH = {
  isAnonymous: true, category: 'to_giac',
  content: 'Khoảng 22 giờ tối qua tại bãi đất trống cuối hẻm 41 khu phố 3 có nhóm khoảng năm người tụ tập trao đổi gói nhỏ nghi là ma tuý, đi xe máy không biển số.',
};

/* Chạy ĐẦU TIÊN: máy chủ chỉ nhớ "đã có cột" sau lần thấy cột đầu tiên */
test('chưa chạy nang_cap_v40.sql: vẫn nhận ý kiến (có hay không có mã lần gửi)', { skip: BO_QUA }, async () => {
  /* SQLite không xoá được cột UNIQUE: dựng lại bảng submissions y như cũ, bỏ hai cột v40 */
  const sql = ctl.db.prepare("SELECT sql FROM sqlite_master WHERE name = 'submissions'").get().sql;
  ctl.db.exec('DROP TABLE submissions');
  ctl.db.exec(sql.replace(/,\s*lan_gui_bam TEXT UNIQUE, lan_gui_dau TEXT/, ''));
  assert.throws(() => ctl.db.prepare('SELECT lan_gui_bam FROM submissions').get());
  assert.equal((await gui({ ...donCoTen(0), maLanGui: crypto.randomUUID() })).status, 201);
  assert.equal((await gui(donCoTen(1))).status, 201);
});

test('gửi lại ĐÚNG mã lần gửi (mạng đứt lúc chờ trả lời): trả lại mã tra cứu cũ + ĐÚNG PIN đã cấp, KHÔNG thêm đơn', { skip: BO_QUA }, async () => {
  const maLanGui = crypto.randomUUID();
  const don = { ...donCoTen(0), maLanGui };
  const lan1 = await gui(don);
  assert.equal(lan1.status, 201, JSON.stringify(lan1.body));
  /* giả như câu trả lời lần 1 bị mất — gửi lại từ mạng khác (4G đổi IP) */
  const lan2 = await gui(don);
  assert.equal(lan2.status, 200, JSON.stringify(lan2.body));
  assert.equal(lan2.body.trackingCode, lan1.body.trackingCode);
  assert.equal(lan2.body.daNhanTruoc, true);
  assert.equal(lan2.body.chatPin, lan1.body.chatPin, 'gửi lại đổi PIN — PIN người dân đã chép mất hiệu lực');
  assert.equal(await kiemPin(lan1.body.chatPin, pinCua(lan1.body.trackingCode)), true, 'PIN đã cấp không còn mở được phòng');
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
  assert.equal(ctl.db.prepare('SELECT COUNT(*) n FROM submissions WHERE lan_gui_bam IS NOT NULL').get().n, 0);
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
  assert.equal(sau.body.chatPin, thanhCong[0].body.chatPin);
  assert.equal(await kiemPin(thanhCong[0].body.chatPin, pinCua(thanhCong[0].body.trackingCode)), true, 'PIN trong bản 201 hết dùng được');
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

test('tin ẩn danh gửi lại: trả lại mã tra cứu, không mang danh tính; CSDL chỉ giữ băm của mã', { skip: BO_QUA }, async () => {
  const maLanGui = crypto.randomUUID();
  const lan1 = await gui({ ...AN_DANH, maLanGui });
  assert.equal(lan1.status, 201, JSON.stringify(lan1.body));
  const lan2 = await gui({ ...AN_DANH, maLanGui });
  assert.equal(lan2.status, 200);
  assert.equal(lan2.body.trackingCode, lan1.body.trackingCode);
  assert.equal(lan2.body.pendingReview, true);
  assert.equal(lan2.body.contact?.phone ?? '', '');
  const bang = JSON.stringify(dongCua(lan1.body.trackingCode));
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

/* ---- Trọng tài P91 (bản 1) — test đỏ trước khi làm bản 2 ---- */
test('P91-1 — gửi lại không đổi PIN và không ghi gì lên đơn (không đóng giờ hoạt động lên updated_at)', { skip: BO_QUA }, async () => {
  const maLanGui = crypto.randomUUID();
  const don = { ...AN_DANH, maLanGui };
  const lan1 = await gui(don);
  const truoc = dongCua(lan1.body.trackingCode);
  for (let k = 0; k < 3; k++) assert.equal((await gui(don)).status, 200);
  assert.deepEqual(dongCua(lan1.body.trackingCode), truoc, 'gửi lại đã sửa dòng đơn');
});

test('P91-4 — cùng mã mà khác bất kỳ phần nào (có tên -> ẩn danh, thêm chi tiết vào nội dung, thêm tệp): 409, không trả mã tra cứu', { skip: BO_QUA }, async () => {
  const maLanGui = crypto.randomUUID();
  const goc = { ...donCoTen(8), category: 'to_giac', maLanGui };
  const lan1 = await gui(goc);
  assert.equal(lan1.status, 201, JSON.stringify(lan1.body));
  const bienThe = [
    { ...goc, isAnonymous: true, fullName: '', phone: '' },
    { ...goc, content: `${goc.content} Biển số xe 59X1-234.56.`, normalizedContent: goc.content },
    { ...goc, taiLieu: [{ ten: 'a.pdf', duLieu: 'data:application/pdf;base64,JVBERi0=' }] },
  ];
  for (const [i, b] of bienThe.entries()) {
    const r = await gui(b);
    assert.equal(r.status, 409, `#${i} ${JSON.stringify(r.body)}`);
    assert.equal(r.body.trackingCode, undefined, `#${i} trả mã tra cứu cho một bản khác`);
  }
  assert.equal(soDon(), 1);
});

test('P91-4 — tệp không nhận được ở lần đầu vẫn được báo lại khi gửi lại (không báo "đủ cả" sai)', { skip: BO_QUA }, async () => {
  /* Bảng của nang_cap_v35.sql — cùng dạng tests/tep-khong-nhan-bao-ro.test.js */
  ctl.db.exec(`CREATE TABLE tep_khong_nhan (id INTEGER PRIMARY KEY AUTOINCREMENT, submission_id INT NOT NULL,
     bo_sung_id INT NULL, loai TEXT NOT NULL, ly_do TEXT NOT NULL, created_at TEXT DEFAULT (NOW()))`);
  (await import('../src/lib/tep-khong-nhan.js')).quenBangTepKhongNhan();
  const maLanGui = crypto.randomUUID();
  const don = { ...donCoTen(9), maLanGui, images: ['data:image/png;base64,không-phải-ảnh'] };
  const lan1 = await gui(don);
  assert.equal(lan1.status, 201, JSON.stringify(lan1.body));
  assert.ok(lan1.body.tepKhongNhan.length > 0, 'chuẩn bị test: lần đầu phải có tệp bị từ chối');
  const lan2 = await gui(don);
  assert.equal(lan2.status, 200);
  assert.equal(lan2.body.tepKhongNhan.length, lan1.body.tepKhongNhan.length);
});

test('bộ dọn dấu nối xoá băm mã lần gửi quá 24 giờ, không đóng giờ lên đơn, không đụng đơn còn mới', { skip: BO_QUA }, async () => {
  const { donDauNoi } = await import('../src/lib/vong-doi-dau-noi.js');
  const cu = await gui({ ...donCoTen(11), maLanGui: crypto.randomUUID() });
  ctl.troiQua(25 * 60);
  const moi = await gui({ ...donCoTen(12), maLanGui: crypto.randomUUID() });
  const truoc = dongCua(cu.body.trackingCode);
  const kq = await donDauNoi(pool);
  assert.equal(kq.soMaLanGui, 1);
  const sau = dongCua(cu.body.trackingCode);
  assert.equal(sau.lan_gui_bam, null);
  assert.equal(sau.lan_gui_dau, null);
  assert.equal(sau.updated_at, truoc.updated_at);
  assert.notEqual(dongCua(moi.body.trackingCode).lan_gui_bam, null, 'xoá cả mã của đơn còn mới');
});

/* ---- Trọng tài P91 bản 2 — test đỏ trước khi vá ---- */
const { dauVanLanGui } = await import('../src/lib/lan-gui.js');

test('R2-1 — dấu vân không băm từng phần tử: mảng 2 triệu phần tử tính trong chốc lát', () => {
  const t0 = performance.now();
  dauVanLanGui({ maLanGui: crypto.randomUUID(), images: new Array(2_000_000).fill(0), taiLieu: new Array(2_000_000).fill(0) });
  const ms = performance.now() - t0;
  assert.ok(ms < 300, `tính dấu vân mất ${Math.round(ms)} ms — một yêu cầu là treo máy chủ`);
});

test('R2-1 — yêu cầu KHÔNG vé kèm mã lần gửi + mảng khổng lồ bị chặn ở cổng nhanh như khi không kèm mã', { skip: BO_QUA }, async () => {
  process.env.TURNSTILE_SECRET_KEY = 'khoa-thu';
  try {
    const rac = { ...donCoTen(13), images: new Array(1_500_000).fill(0) };
    const doGio = async (b) => { const t0 = performance.now(); const r = await gui(b); return { ms: performance.now() - t0, s: r.status }; };
    const khongMa = await doGio(rac);
    const coMa = await doGio({ ...rac, maLanGui: crypto.randomUUID() });
    assert.equal(khongMa.s, 403);
    assert.equal(coMa.s, 403);
    assert.ok(coMa.ms < khongMa.ms * 2 + 300, `kèm mã: ${Math.round(coMa.ms)} ms, không mã: ${Math.round(khongMa.ms)} ms`);
  } finally {
    delete process.env.TURNSTILE_SECRET_KEY;
  }
});
