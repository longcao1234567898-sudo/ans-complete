/**
 * BUG-018 — Một cú "Tin rác" chỉ được tác động ĐÚNG MỘT đơn; tái phạm chỉ đếm
 * cú bấm thật của cán bộ (SEC-DEC-008, M-D).
 *
 * Vì sao: ông P gửi ba đơn có tên trong ngày. Cán bộ C bấm "Tin rác" một lần.
 * Dọn theo lô cuốn hai đơn kia vào thùng rác cùng giây, cùng người xoá; xét tái
 * phạm đếm ba đơn "rác có người xoá" thành ba quyết định liên tiếp -> kênh có tên
 * của P bị chặn ngầm 30 ngày, hai đơn thật tự xoá vĩnh viễn sau 7 ngày. Một cú
 * bấm không phải ba quyết định.
 *
 * Mỗi test ghi mã biến thể D1–D12 trong buglogs/quyet-dinh/SEC-DEC-008.md.
 *
 * Câu SQL của route chạy NGUYÊN VĂN trên node:sqlite (bài học P23), qua HTTP
 * thật. Node < 22 -> BỎ QUA (hiện rõ trong output), không âm thầm xanh.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { readFile } from 'node:fs/promises';
import { datBienMoiTruongHopLe } from './helpers-test.js';

datBienMoiTruongHopLe();

const { pool } = await import('../src/db.js');
const { signAccessToken } = await import('../src/lib/token.js');
const { encrypt } = await import('../src/lib/crypto.js');
const { default: adminRouter } = await import('../src/routes/admin/index.js');

const sqlite = await import('node:sqlite').catch(() => null);
const BO_QUA = sqlite ? false : 'cần node:sqlite (Node ≥ 22) để chạy câu SQL thật của route';

const HANDLER = { id: 4, username: 'cb4', role: 'handler', full_name: 'Cán bộ xử lý' };
const MAY_P   = '3f9c2a71-5b4e-4d8a-9c1f-7e2b6a0d4c95';

/* ------------------------------------------------------------------------ */
/* CSDL thật trong bộ nhớ — cùng lược đồ với tach-khoa-theo-loai-don.test.js */
/* ------------------------------------------------------------------------ */

let db;
const norm = (v) => (v instanceof Date ? v.toISOString().slice(0, 19).replace('T', ' ')
  : typeof v === 'boolean' ? Number(v) : v === undefined ? null : v);

/* Dịch đúng các cú pháp MySQL mà các route khoá/đánh rác dùng — không dịch gì
   khác. Câu nào còn cú pháp lạ thì SQLite ném lỗi, test đỏ, người sửa biết. */
function sangSqlite(sql) {
  const dv = (d) => `${d.toLowerCase()}s`;
  let s = sql.replace(/DATE_(ADD|SUB)\(NOW\(\),\s*INTERVAL\s+(\?|\d+)\s+(HOUR|DAY|YEAR)\)/gi,
    (_m, huong, n, d) => `datetime('now', '${huong.toUpperCase() === 'ADD' ? '+' : '-'}' || ${n} || ' ${dv(d)}')`);
  s = s.replace(/NOW\(\)\s*-\s*INTERVAL\s+(\?|\d+)\s+(HOUR|DAY|MINUTE)/gi,
    (_m, n, d) => `datetime('now', '-' || ${n} || ' ${dv(d)}')`);
  const i = s.search(/ON DUPLICATE KEY UPDATE/i);
  if (i > -1) {
    s = s.slice(0, i) + 'ON CONFLICT(identifier, kind, loai_don) DO UPDATE SET'
      + s.slice(i + 'ON DUPLICATE KEY UPDATE'.length).replace(/VALUES\((\w+)\)/g, 'excluded.$1');
  }
  return s;
}

function dungCsdl() {
  db = new sqlite.DatabaseSync(':memory:');
  db.function('NOW', () => norm(new Date()));
  db.function('LEFT', (s, n) => (s == null ? null : String(s).slice(0, n)));
  for (const q of [
    `CREATE TABLE categories (id INT PRIMARY KEY, code TEXT, name TEXT, sla_days INT)`,
    `CREATE TABLE staff (id INT PRIMARY KEY, full_name TEXT, is_active INT DEFAULT 1)`,
    `CREATE TABLE submissions (
       id INTEGER PRIMARY KEY, tracking_code TEXT, original_content TEXT, ai_processed_content TEXT,
       category_id INT, status TEXT, urgency TEXT, security_level TEXT DEFAULT 'thuong',
       is_anonymous INT, is_flagged INT DEFAULT 0, flag_reason TEXT,
       sender_name TEXT, sender_phone TEXT, sender_phone_hash TEXT, sender_email TEXT,
       ip_address TEXT, user_agent TEXT, content_hash TEXT,
       created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')),
       deadline_at TEXT, resolved_at TEXT,
       assigned_to INT, resolved_by INT, reviewed_by INT, reviewed_at TEXT,
       rejection_reason TEXT, resolution_note TEXT, ward_id INT,
       deleted_at TEXT, deleted_by INT, incident_group_id INT, device_id TEXT, is_spam INT DEFAULT 0)`,
    `CREATE TABLE status_history (submission_id INT, old_status TEXT, new_status TEXT, note TEXT,
       changed_at TEXT DEFAULT (datetime('now')), changed_by INT)`,
    `CREATE TABLE staff_activity_logs (staff_id INT, action TEXT, target_type TEXT, target_id TEXT, details TEXT, ip_address TEXT)`,
    /* Lược đồ SAU database/nang_cap_v19.sql: cột loai_don, khoá duy nhất có loai_don */
    `CREATE TABLE blacklists (id INTEGER PRIMARY KEY, identifier TEXT, kind TEXT,
       loai_don TEXT NOT NULL DEFAULT 'khong_ro', reason TEXT, created_by INT,
       created_at TEXT DEFAULT CURRENT_TIMESTAMP, expires_at TEXT, UNIQUE (identifier, kind, loai_don))`,
    `CREATE VIEW vw_blacklist_active AS
       SELECT b.id, b.identifier, b.kind, b.reason, b.created_at, b.expires_at,
              st.full_name AS nguoi_khoa,
              CAST((julianday(b.expires_at) - julianday('now')) * 1440 AS INT) AS con_lai_phut
         FROM blacklists b LEFT JOIN staff st ON st.id = b.created_by
        WHERE b.expires_at > NOW() ORDER BY b.created_at DESC`,
    `INSERT INTO categories VALUES (1, 'to_giac', 'Tố giác', 15)`,
    `INSERT INTO staff (id, full_name) VALUES (4, 'Cán bộ xử lý')`,
  ]) db.exec(q);

  pool.query = async (sql, p = []) => {
    const st = db.prepare(sangSqlite(String(sql)));
    if (/^\s*(\/\*[\s\S]*?\*\/\s*)*SELECT/i.test(String(sql))) {
      return [st.all(...p.map(norm)).map((r) => ({ ...r })), []];
    }
    const r = st.run(...p.map(norm));
    return [{ affectedRows: Number(r.changes), insertId: Number(r.lastInsertRowid) }, []];
  };
}

const luc = (phutTruoc) => norm(new Date(Date.now() - phutTruoc * 60000));

/** an: 1 ẩn danh · 0 có tên. Mặc định: đơn có tên mới tiếp nhận, chưa ai đụng, gửi 2 giờ trước */
function themDon(id, { an = 0, may = MAY_P, status = 'received', spam = 0, tao = luc(120), ip = 'ip-da-bam' } = {}) {
  db.prepare(`INSERT INTO submissions (id, tracking_code, original_content, category_id, status, urgency,
      is_anonymous, sender_name, created_at, updated_at, deadline_at, assigned_to, device_id, ip_address,
      is_spam, deleted_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    id, `MA${id}`, `Nội dung đơn ${id}`, 1, status, 'normal',
    an, an === 0 ? encrypt('Phạm Văn Phúc') : null, tao, tao, '2026-12-01 00:00:00', null, may, ip, spam, null);
}
/* Đúng hàng mà routes/submissions.js ghi khi đơn bị chặn ngầm lúc nhận */
const themDonChanNgam = (id, o = {}) => themDon(id, { tao: luc(1), ...o, status: 'spam', spam: 1 });

async function canBo(method, duong, body) {
  const app = express();
  app.use(express.json());
  app.use('/api/admin', adminRouter);
  const server = app.listen(0);
  try {
    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}/api/admin${duong}`, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${signAccessToken(HANDLER)}` },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* để trống */ }
    return { status: res.status, body: json, text };
  } finally {
    server.close();
  }
}

/** Số giờ còn lại của khoá máy loại `loai`; 0 nếu không có khoá đang hiệu lực */
const gioKhoa = (loai) => db.prepare(
  `SELECT (julianday(expires_at) - julianday('now')) * 24 AS gio FROM blacklists
    WHERE kind = 'device' AND identifier = ? AND loai_don = ? AND expires_at > NOW()`).get(MAY_P, loai)?.gio ?? 0;
/* Trải ra object thường: node:sqlite trả object không prototype, deepEqual chặt sẽ báo khác dù cùng giá trị */
const hang = (id) => ({ ...db.prepare('SELECT status, deleted_at, deleted_by, is_spam, rejection_reason FROM submissions WHERE id = ?').get(id) });

/** Hai đơn kia phải y nguyên như lúc chèn: không vào thùng rác, không mang dấu cán bộ nào */
function khongBiDung(ids, statusGoc) {
  for (const id of ids) {
    assert.deepEqual(hang(id), { status: statusGoc, deleted_at: null, deleted_by: null, is_spam: 0, rejection_reason: null },
      `đơn #${id} cùng máy bị cuốn theo cú bấm trên đơn khác`);
  }
}

/* ======================================================================== */

test('D1 — mark-spam một đơn có tên: hai đơn có tên khác cùng máy trong 24 giờ giữ nguyên, khoá 24 giờ, không tái phạm', { skip: BO_QUA }, async () => {
  dungCsdl();
  themDon(1, { tao: luc(300) });
  themDon(2, { tao: luc(200) });
  themDon(3, { tao: luc(100) });
  const r = await canBo('POST', '/submissions/1/mark-spam', { reason: 'bịa' });
  assert.equal(r.status, 200, r.text);
  assert.equal(hang(1).status, 'spam');
  assert.ok(hang(1).deleted_at, 'đơn được bấm phải vào thùng rác');
  khongBiDung([2, 3], 'received');
  assert.notEqual(r.body.taiPham, true, 'một cú bấm bị đếm thành ba lần tái phạm');
  const gio = gioKhoa('co_ten');
  assert.ok(gio > 23 && gio <= 24.1, `khoá ${gio.toFixed(1)} giờ — phải đúng 24 giờ`);
  assert.equal('soDonDaDon' in r.body, false, 'phản hồi còn trường soDonDaDon của dọn theo lô');
});

test('D2 — review=spam một đơn có tên ở hàng chờ: các đơn cùng máy trong hàng chờ giữ nguyên, không tái phạm', { skip: BO_QUA }, async () => {
  dungCsdl();
  themDon(1, { status: 'pending_review', tao: luc(300) });
  themDon(2, { status: 'pending_review', tao: luc(200) });
  themDon(3, { status: 'pending_review', tao: luc(100) });
  const r = await canBo('POST', '/submissions/1/review', { action: 'spam' });
  assert.equal(r.status, 200, r.text);
  khongBiDung([2, 3], 'pending_review');
  assert.notEqual(r.body.taiPham, true);
  assert.ok(gioKhoa('co_ten') <= 24.1, `khoá ${gioKhoa('co_ten').toFixed(1)} giờ`);
  assert.equal('soDonDaDon' in r.body, false);
});

test('D2 — review=spam một đơn ẩn danh ở hàng chờ: các đơn ẩn danh cùng máy giữ nguyên, không tái phạm', { skip: BO_QUA }, async () => {
  dungCsdl();
  themDon(1, { an: 1, status: 'pending_review', tao: luc(300) });
  themDon(2, { an: 1, status: 'pending_review', tao: luc(200) });
  themDon(3, { an: 1, status: 'pending_review', tao: luc(100) });
  const r = await canBo('POST', '/submissions/1/review', { action: 'spam' });
  assert.equal(r.status, 200, r.text);
  khongBiDung([2, 3], 'pending_review');
  assert.notEqual(r.body.taiPham, true);
  assert.ok(gioKhoa('an_danh') <= 24.1, `khoá ${gioKhoa('an_danh').toFixed(1)} giờ`);
});

test('D2 — mark-spam một đơn ẩn danh: các đơn ẩn danh cùng máy giữ nguyên, không tái phạm', { skip: BO_QUA }, async () => {
  dungCsdl();
  themDon(1, { an: 1, status: 'pending_review', tao: luc(300) });
  themDon(2, { an: 1, status: 'pending_review', tao: luc(200) });
  themDon(3, { an: 1, status: 'received', tao: luc(100) });
  const r = await canBo('POST', '/submissions/1/mark-spam', {});
  assert.equal(r.status, 200, r.text);
  khongBiDung([2], 'pending_review');
  khongBiDung([3], 'received');
  assert.notEqual(r.body.taiPham, true);
});

test('D3 — tái phạm thật: cán bộ tự tay đánh rác ba đơn có tên (mark-spam) thì khoá 30 ngày', { skip: BO_QUA }, async () => {
  dungCsdl();
  themDon(1, { tao: luc(300) });
  themDon(2, { tao: luc(200) });
  themDon(3, { tao: luc(100) });
  const kq = [];
  for (const id of [1, 2, 3]) kq.push(await canBo('POST', `/submissions/${id}/mark-spam`, { reason: 'x' }));
  for (const r of kq) assert.equal(r.status, 200, r.text);
  assert.deepEqual(kq.map((r) => r.body.taiPham === true), [false, false, true],
    'chỉ cú bấm thứ ba mới là ba quyết định liên tiếp');
  assert.ok(gioKhoa('co_ten') > 24 * 29, `khoá ${gioKhoa('co_ten').toFixed(1)} giờ — phải 30 ngày`);
});

test('D3 — tái phạm thật qua hàng chờ: ba cú review=spam trên ba đơn có tên, mỗi cú đều làm được và cú thứ ba khoá 30 ngày', { skip: BO_QUA }, async () => {
  dungCsdl();
  themDon(1, { status: 'pending_review', tao: luc(300) });
  themDon(2, { status: 'pending_review', tao: luc(200) });
  themDon(3, { status: 'pending_review', tao: luc(100) });
  const kq = [];
  for (const id of [1, 2, 3]) kq.push(await canBo('POST', `/submissions/${id}/review`, { action: 'spam' }));
  assert.deepEqual(kq.map((r) => r.status), [200, 200, 200],
    'đơn sau bị cuốn khỏi hàng chờ bởi cú bấm trước — cán bộ không còn tự quyết được đơn đó');
  assert.deepEqual(kq.map((r) => r.body.taiPham === true), [false, false, true]);
  assert.ok(gioKhoa('co_ten') > 24 * 29);
});

test('D4 — dữ liệu cũ: hai đơn bị cuốn theo lô trước bản vá (spam, có deleted_by, không có dòng lịch sử rác) không được đếm', { skip: BO_QUA }, async () => {
  dungCsdl();
  /* Đúng hàng mà donDonCungThietBi (trước bản vá) để lại: không ghi status_history */
  for (const [id, phut] of [[11, 300], [12, 200]]) {
    themDon(id, { tao: luc(phut) });
    db.prepare(`UPDATE submissions SET status = 'spam', is_spam = 1, deleted_at = ?, deleted_by = 4,
      rejection_reason = 'Dọn theo lô cùng thiết bị với một hồ sơ bị đánh dấu tin rác' WHERE id = ?`).run(luc(50), id);
  }
  themDon(13, { tao: luc(5) });
  const r = await canBo('POST', '/submissions/13/mark-spam', { reason: 'x' });
  assert.equal(r.status, 200, r.text);
  assert.notEqual(r.body.taiPham, true, 'đơn bị cuốn theo lô từ trước bản vá bị đếm thành quyết định cán bộ');
  assert.ok(gioKhoa('co_ten') <= 24.1, `khoá ${gioKhoa('co_ten').toFixed(1)} giờ`);
});

test('D5 — khôi phục rồi đánh rác lại cùng một đơn chỉ đếm một lần', { skip: BO_QUA }, async () => {
  dungCsdl();
  themDon(1, { tao: luc(300) });
  themDon(2, { tao: luc(200) });
  themDon(3, { tao: luc(100) });
  await canBo('POST', '/submissions/1/mark-spam', { reason: 'x' });
  assert.equal((await canBo('POST', '/trash/1/restore')).status, 200);
  await canBo('POST', '/submissions/1/mark-spam', { reason: 'x' });
  const r2 = await canBo('POST', '/submissions/2/mark-spam', { reason: 'x' });
  assert.notEqual(r2.body.taiPham, true, 'một đơn bị đếm hai lần');
  const r3 = await canBo('POST', '/submissions/3/mark-spam', { reason: 'x' });
  assert.equal(r3.body.taiPham, true, 'ba đơn khác nhau, ba cú bấm thật -> tái phạm');
});

test('D6 — đánh rác tay đơn bị chặn ngầm không được đếm tái phạm', { skip: BO_QUA }, async () => {
  dungCsdl();
  themDon(1, { tao: luc(300) });
  await canBo('POST', '/submissions/1/mark-spam', { reason: 'x' });
  themDonChanNgam(11, { tao: luc(200) });
  themDonChanNgam(12, { tao: luc(100) });
  assert.equal((await canBo('POST', '/submissions/11/mark-spam', { reason: 'x' })).status, 200);
  assert.equal((await canBo('POST', '/submissions/12/mark-spam', { reason: 'x' })).status, 200);
  themDon(13, { tao: luc(5) });
  const r = await canBo('POST', '/submissions/13/mark-spam', { reason: 'x' });
  assert.notEqual(r.body.taiPham, true, 'đơn chặn ngầm bị đếm thành quyết định cán bộ');
  assert.ok(gioKhoa('co_ten') <= 24.1);
});

test('D7 — trộn loại: 2 ẩn danh + 1 có tên cùng máy, mỗi đơn một cú bấm, không khoá 30 ngày loại nào', { skip: BO_QUA }, async () => {
  dungCsdl();
  themDon(11, { an: 1, status: 'pending_review', tao: luc(180) });
  themDon(12, { an: 1, status: 'pending_review', tao: luc(120) });
  themDon(13, { tao: luc(60) });
  assert.equal((await canBo('POST', '/submissions/11/review', { action: 'spam' })).status, 200);
  assert.equal((await canBo('POST', '/submissions/12/review', { action: 'spam' })).status, 200);
  const r = await canBo('POST', '/submissions/13/mark-spam', { reason: 'x' });
  assert.notEqual(r.body.taiPham, true);
  const dai = db.prepare(`SELECT COUNT(*) AS n FROM blacklists WHERE expires_at > datetime('now', '+2 days')`).get().n;
  assert.equal(dai, 0, 'đếm tái phạm trộn hai loại đơn');
});

/* D8 — Cán bộ không được phân biệt "P có một đơn" với "P có ba đơn cùng máy"
   qua bất cứ thứ gì cú bấm để lại: phản hồi, thùng rác, danh sách khoá, nhật ký. */
async function bamVaChup(duong, body, soDonCungMay, status) {
  dungCsdl();
  themDon(1, { status, tao: luc(300) });
  for (let i = 2; i <= soDonCungMay; i++) themDon(i, { status, tao: luc(300 - i * 50) });
  const r = await canBo('POST', duong, body);
  assert.equal(r.status, 200, r.text);
  const dsKhoa = await canBo('GET', '/chat/blacklist');
  assert.equal(dsKhoa.status, 200, dsKhoa.text);
  return {
    phanHoi: r.body,
    thungRac: db.prepare(`SELECT id, status, deleted_by, rejection_reason, is_spam
                            FROM submissions WHERE deleted_at IS NOT NULL ORDER BY id`).all().map((x) => ({ ...x })),
    danhSachKhoa: dsKhoa.body.map(({ kind, reason, nguoi_khoa }) => ({ kind, reason, nguoi_khoa })),
    nhatKy: db.prepare('SELECT staff_id, action, target_type, target_id, details FROM staff_activity_logs').all().map((x) => ({ ...x })),
    lichSu: db.prepare('SELECT submission_id, old_status, new_status, note, changed_by FROM status_history ORDER BY rowid').all().map((x) => ({ ...x })),
  };
}

for (const [ten, duong, body, status] of [
  ['mark-spam', '/submissions/1/mark-spam', { reason: 'bịa' }, 'received'],
  ['review=spam', '/submissions/1/review', { action: 'spam' }, 'pending_review'],
]) {
  test(`D8 — ${ten}: P có 1 đơn hay 3 đơn cùng máy thì mọi thứ cán bộ đọc được sau cú bấm y hệt nhau`, { skip: BO_QUA }, async () => {
    const motDon = await bamVaChup(duong, body, 1, status);
    const baDon = await bamVaChup(duong, body, 3, status);
    assert.deepEqual(baDon.phanHoi, motDon.phanHoi, 'phản hồi cho cán bộ lộ số đơn cùng máy');
    assert.deepEqual(baDon.thungRac, motDon.thungRac, 'thùng rác lộ các đơn cùng máy');
    assert.deepEqual(baDon.danhSachKhoa, motDon.danhSachKhoa, 'danh sách khoá khác nhau');
    assert.deepEqual(baDon.nhatKy, motDon.nhatKy, 'nhật ký khác nhau');
    assert.deepEqual(baDon.lichSu, motDon.lichSu, 'lịch sử trạng thái khác nhau');
  });
}

/* Giả lập CSDL chưa chạy va_loi_duyet_tin_an_danh.sql: ENUM status_history thiếu 'spam' */
const hongLichSuSpam = () => db.exec(`CREATE TRIGGER enum_cu BEFORE INSERT ON status_history
  WHEN NEW.new_status = 'spam' OR NEW.old_status = 'spam' BEGIN SELECT RAISE(ABORT, 'Data truncated for column new_status'); END`);

test('D9 — không ghi được dòng lịch sử rác: ba cú bấm không để lại bằng chứng cú bấm thì không được đẩy lên 30 ngày', { skip: BO_QUA }, async () => {
  dungCsdl();
  hongLichSuSpam();
  themDon(1, { tao: luc(300) });
  themDon(2, { tao: luc(200) });
  themDon(3, { tao: luc(100) });
  const kq = [];
  for (const id of [1, 2, 3]) kq.push(await canBo('POST', `/submissions/${id}/mark-spam`, { reason: 'x' }));
  for (const r of kq) assert.equal(r.status, 200, r.text);
  assert.ok(kq.every((r) => r.body.taiPham !== true),
    'không có dòng lịch sử nào chứng minh là cú bấm của cán bộ mà vẫn đếm tái phạm');
  assert.ok(gioKhoa('co_ten') <= 24.1, `khoá ${gioKhoa('co_ten').toFixed(1)} giờ`);
});

test('D9 — không ghi được dấu "không tính tái phạm" cho đơn chặn ngầm thì từ chối đánh rác (SEC-DEC-006 đánh đổi 6)', { skip: BO_QUA }, async () => {
  dungCsdl();
  hongLichSuSpam();
  themDonChanNgam(11);
  const r = await canBo('POST', '/submissions/11/mark-spam', { reason: 'x' });
  assert.notEqual(r.status, 200);
  assert.equal(hang(11).deleted_at, null, 'đơn vào thùng rác dù thao tác báo lỗi');
});

for (const [ten, duong, body, status] of [
  ['mark-spam', '/submissions/1/mark-spam', { reason: 'x' }, 'received'],
  ['review=spam', '/submissions/1/review', { action: 'spam' }, 'pending_review'],
]) {
  test(`D10 — ${ten} đơn đã mất cả mã máy lẫn IP (quá 30 ngày): không khoá gì, không báo đã khoá, không lỗi`, { skip: BO_QUA }, async () => {
    dungCsdl();
    themDon(1, { status, may: null, ip: null });
    const r = await canBo('POST', duong, body);
    assert.equal(r.status, 200, r.text);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM blacklists').get().n, 0, 'tạo dòng khoá không có định danh');
    assert.notEqual(r.body.daKhoaThietBi, true);
    assert.notEqual(r.body.taiPham, true);
    const loi = String(r.body.ghiChu ?? r.body.message);
    assert.doesNotMatch(loi, /khoá thiết bị này|khoá theo địa chỉ|khoá 30 ngày/, `báo đã khoá: "${loi}"`);
  });
}

test('D11 — không còn mã nào gọi dọn theo lô hay đếm tái phạm theo deleted_by', async () => {
  const lib = await readFile(new URL('../src/lib/chan-spam.js', import.meta.url), 'utf8');
  const route = await readFile(new URL('../src/routes/admin/submissions.js', import.meta.url), 'utf8');
  assert.doesNotMatch(lib, /donDonCungThietBi/, 'lib/chan-spam.js còn hàm dọn theo lô');
  assert.doesNotMatch(route, /donDonCungThietBi|soDonDaDon/, 'route còn gọi dọn theo lô');
  const dau = lib.indexOf('export async function xetKhoaTaiPham');
  /* Bỏ chú thích: kiểm câu SQL chạy thật, không kiểm lời giải thích vì sao không dùng deleted_by */
  const than = lib.slice(dau, lib.indexOf('\n}\n', dau)).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.doesNotMatch(than, /deleted_by/, 'xét tái phạm còn đếm theo deleted_by — dấu mà mọi đường xoá đều để lại');
  assert.match(than, /status_history/, 'xét tái phạm phải đếm theo dòng lịch sử cán bộ ghi trên chính đơn');
});
