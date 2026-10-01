/**
 * BUG-015 — Khoá do một đơn CÓ TÊN gây ra không được chặn đơn ẨN DANH của cùng
 * máy (và ngược lại); một đơn không được dùng đi dùng lại để gia hạn khoá.
 *
 * Vì sao: khoá quy về một máy. Đánh rác một đơn có tên của ông P là khoá máy
 * của P; tố giác ẩn danh P gửi sau đó bị chặn ngầm, nằm ở danh sách nghi rác,
 * tạo SAU giờ khoá — ít máy bị khoá thì đơn đó gần như chắc chắn là của P.
 * Chiều ngược lại cũng vậy: đơn ẩn danh bị rác -> đơn có tên sau đó bị chặn.
 * Thêm nữa, khôi phục rồi đánh rác lại CÙNG một đơn là làm mới khoá 24 giờ, lặp
 * mãi; đánh rác tay các đơn máy đã tự chặn ngầm là đẩy lên khoá 30 ngày.
 *
 * Mỗi test ghi mã biến thể RETEST (R1–R14) trong buglogs/bugs/BUG-015.md.
 *
 * Câu SQL của route chạy NGUYÊN VĂN trên node:sqlite (bài học P23). Bảng
 * blacklists dựng theo lược đồ SAU database/nang_cap_v19.sql. Node < 22 -> BỎ QUA
 * (hiện rõ trong output), không âm thầm xanh.
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
const chanSpam = await import('../src/lib/chan-spam.js');
const { xetTruocKhiNhan, kiemTraBiKhoa, khoaIpThuCong, xetKhoaIp } = chanSpam;
const { default: adminRouter } = await import('../src/routes/admin/index.js');
const { default: submissionsRouter } = await import('../src/routes/submissions.js');
const { default: khieuNaiRouter } = await import('../src/routes/khieu-nai.js');

const sqlite = await import('node:sqlite').catch(() => null);
const BO_QUA = sqlite ? false : 'cần node:sqlite (Node ≥ 22) để chạy câu SQL thật của route';

const HANDLER = { id: 4, username: 'cb4', role: 'handler', full_name: 'Cán bộ xử lý' };
const MAY_P   = '3f9c2a71-5b4e-4d8a-9c1f-7e2b6a0d4c95';
/* fetch tới 127.0.0.1 -> req.ip của route công khai */
const IP_THO  = '127.0.0.1';

/* ------------------------------------------------------------------------ */
/* CSDL thật trong bộ nhớ                                                    */
/* ------------------------------------------------------------------------ */

let db;
const norm = (v) => (v instanceof Date ? v.toISOString().slice(0, 19).replace('T', ' ')
  : typeof v === 'boolean' ? Number(v) : v === undefined ? null : v);

/* Dịch đúng các cú pháp MySQL mà các route khoá/nhận đơn dùng — không dịch gì
   khác. Câu nào còn cú pháp lạ thì SQLite ném lỗi, test đỏ, người sửa biết. */
function sangSqlite(sql) {
  const dv = (d) => `${d.toLowerCase()}s`;
  let s = sql.replace(/DATE_(ADD|SUB)\(NOW\(\),\s*INTERVAL\s+(\?|\d+)\s+(HOUR|DAY|YEAR)\)/gi,
    (_m, huong, n, d) => `datetime('now', '${huong.toUpperCase() === 'ADD' ? '+' : '-'}' || ${n} || ' ${dv(d)}')`);
  s = s.replace(/NOW\(\)\s*-\s*INTERVAL\s+(\?|\d+)\s+(HOUR|DAY|MINUTE)/gi,
    (_m, n, d) => `datetime('now', '-' || ${n} || ' ${dv(d)}')`);
  s = s.replace(/TIMESTAMPDIFF\(MINUTE,\s*NOW\(\),\s*expires_at\)/gi,
    `CAST((julianday(expires_at) - julianday('now')) * 1440 AS INT)`);
  const i = s.search(/ON DUPLICATE KEY UPDATE/i);
  if (i > -1) {
    s = s.slice(0, i) + 'ON CONFLICT(identifier, kind, loai_don) DO UPDATE SET'
      + s.slice(i + 'ON DUPLICATE KEY UPDATE'.length).replace(/VALUES\((\w+)\)/g, 'excluded.$1');
  }
  return s;
}

/* mysql2 bung tham số mảng thành danh sách cho `IN (?)` — làm y như vậy */
function bungMang(sql, p) {
  const ra = [];
  let k = 0;
  const cau = sql.replace(/\?/g, () => {
    const v = p[k++];
    if (Array.isArray(v)) { ra.push(...v); return v.map(() => '?').join(','); }
    ra.push(v); return '?';
  });
  return [cau, ra];
}

function dungCsdl() {
  db = new sqlite.DatabaseSync(':memory:');
  db.function('NOW', () => norm(new Date()));
  db.function('LEFT', (s, n) => (s == null ? null : String(s).slice(0, n)));
  for (const q of [
    `CREATE TABLE categories (id INT PRIMARY KEY, code TEXT, name TEXT, sla_days INT)`,
    `CREATE TABLE staff (id INT PRIMARY KEY, full_name TEXT, is_active INT DEFAULT 1)`,
    `CREATE TABLE wards (id INT PRIMARY KEY, name TEXT)`,
    `CREATE TABLE report_messages (submission_id INT, sender_type TEXT, read_by_staff INT)`,
    `CREATE TABLE submissions (
       id INTEGER PRIMARY KEY, tracking_code TEXT, original_content TEXT, ai_processed_content TEXT,
       category_id INT, ai_suggested_category_id INT, status TEXT, urgency TEXT, security_level TEXT DEFAULT 'thuong',
       is_anonymous INT, is_flagged INT DEFAULT 0, flag_reason TEXT, is_verified_otp INT,
       sender_name TEXT, sender_phone TEXT, sender_phone_hash TEXT, sender_email TEXT,
       ip_address TEXT, user_agent TEXT, content_hash TEXT,
       created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')),
       deadline_at TEXT, resolved_at TEXT,
       assigned_to INT, resolved_by INT, reviewed_by INT, reviewed_at TEXT,
       rejection_reason TEXT, resolution_note TEXT, ward_id INT, chat_pin_hash TEXT,
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
    `CREATE TABLE unlock_appeals (
       id INTEGER PRIMARY KEY, identifier TEXT, kind TEXT, content TEXT, status TEXT DEFAULT 'cho_xu_ly',
       created_at TEXT DEFAULT (datetime('now')), handled_at TEXT, handled_by INT, handler_note TEXT,
       device_id TEXT, ip_address TEXT)`,
    `INSERT INTO categories VALUES (1, 'to_giac', 'Tố giác', 15), (3, 'phan_anh', 'Phản ánh', 15)`,
    `INSERT INTO staff (id, full_name) VALUES (2, 'Lãnh đạo'), (4, 'Cán bộ xử lý')`,
  ]) db.exec(q);

  pool.query = async (sql, p = []) => {
    const [cau, thamSo] = bungMang(sangSqlite(String(sql)), p);
    const st = db.prepare(cau);
    if (/^\s*(\/\*[\s\S]*?\*\/\s*)*SELECT/i.test(String(sql))) {
      return [st.all(...thamSo.map(norm)).map((r) => ({ ...r })), []];
    }
    const r = st.run(...thamSo.map(norm));
    return [{ affectedRows: Number(r.changes), insertId: Number(r.lastInsertRowid) }, []];
  };
}

const luc = (phutTruoc) => norm(new Date(Date.now() - phutTruoc * 60000));

/** an: 1 ẩn danh · 0 có tên · null không rõ (cột cho phép NULL) */
function themDon(id, { an = 0, may = MAY_P, status = 'processing', spam = 0, tao = luc(120), assigned = null, ip = 'ip-da-bam' } = {}) {
  db.prepare(`INSERT INTO submissions (id, tracking_code, original_content, category_id, status, urgency,
      is_anonymous, sender_name, created_at, updated_at, deadline_at, assigned_to, device_id, ip_address,
      is_spam, deleted_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    id, `MA${id}`, `Nội dung đơn ${id}`, 1, status, 'normal',
    an, an === 0 ? encrypt('Phạm Văn Phúc') : null, tao, tao, '2026-12-01 00:00:00', assigned, may, ip, spam, null);
}
/* Đúng hàng mà routes/submissions.js ghi khi chanNgam = true */
const themDonChanNgam = (id, o = {}) => themDon(id, { tao: luc(1), ...o, status: 'spam', spam: 1 });

async function goi(duongGoc, router, staff, method, duong, body) {
  const app = express();
  app.use(express.json());
  app.use(duongGoc, router);
  const server = app.listen(0);
  try {
    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}${duongGoc}${duong}`, {
      method,
      headers: { 'Content-Type': 'application/json',
                 ...(staff ? { Authorization: `Bearer ${signAccessToken(staff)}` } : {}) },
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
const canBo    = (m, d, b) => goi('/api/admin', adminRouter, HANDLER, m, d, b);
const congKhai = (m, d, b) => goi('/api/submissions', submissionsRouter, null, m, d, b);
const khieuNai = (m, d, b) => goi('/api/khieu-nai', khieuNaiRouter, null, m, d, b);

/* Hai đơn gửi thật qua POST /api/submissions */
const DON_AN_DANH = {
  isAnonymous: true, category: 'to_giac', deviceId: MAY_P,
  content: 'Tối ngày 20 tháng 9, khoảng 22 giờ, tại bến sông thôn Đông có nhóm người dùng hai tàu hút cát trái phép, chở đi bằng xe tải không biển số.',
};
const DON_CO_TEN = {
  isAnonymous: false, category: 'phan_anh', deviceId: MAY_P,
  fullName: 'Phạm Văn Phúc', phone: '0916284735',
  content: 'Đèn đường ở ngõ 5 thôn Đông bị hỏng đã hai tuần, buổi tối đi lại rất nguy hiểm cho người già và trẻ nhỏ.',
};

async function guiDon(body) {
  const r = await congKhai('POST', '/', body);
  assert.equal(r.status, 201, `POST /api/submissions không nhận đơn: ${r.status} ${r.text.slice(0, 300)}`);
  return db.prepare('SELECT id, status, is_spam FROM submissions WHERE tracking_code = ?').get(r.body.trackingCode);
}

/* Khoá máy đang hiệu lực của đúng một loại. Không có thì ném lỗi nói rõ — để
   test đỏ vì lý do đọc được, không đỏ vì TypeError. */
function khoaCon(loai) {
  const k = db.prepare(
    `SELECT (julianday(expires_at) - julianday('now')) * 24 AS gio FROM blacklists
      WHERE kind = 'device' AND identifier = ? AND loai_don = ? AND expires_at > NOW()`).get(MAY_P, loai);
  assert.ok(k, `không có khoá máy loại ${loai} đang hiệu lực`);
  return k;
}
const nhan = (anDanh, may = MAY_P) => xetTruocKhiNhan(pool, { body: { deviceId: may, isAnonymous: anDanh }, ip: IP_THO });

/* ======================================================================== */

test('R1/R11 — đánh rác đơn CÓ TÊN, tố giác ẨN DANH gửi sau đó qua route thật vào hàng chờ bình thường, không vào nghi rác', { skip: BO_QUA }, async () => {
  dungCsdl();
  themDon(1, { an: 0 });
  const r = await canBo('POST', '/submissions/1/mark-spam', { reason: 'nội dung không đúng' });
  assert.equal(r.status, 200);

  const don = await guiDon(DON_AN_DANH);
  assert.equal(don.is_spam, 0, 'tố giác ẩn danh bị chặn ngầm vì máy bị khoá qua một đơn có tên');
  assert.equal(don.status, 'pending_review');

  /* Có sort và kiểm status: không sort thì câu SQL dùng FIELD(), SQLite không có,
     route trả 500 — kiểm "không có trong danh sách" trên 500 là đúng vô điều kiện */
  const ds = await canBo('GET', '/submissions?nghiRac=1&sort=moi_nhat');
  assert.equal(ds.status, 200, `danh sách nghi rác lỗi: ${ds.text.slice(0, 200)}`);
  assert.ok(!(ds.body?.data || []).some((x) => x.id === don.id), 'tố giác ẩn danh hiện trong danh sách nghi rác');
});

test('R13 — không hồi quy chống spam: máy bị khoá loại có tên gửi tiếp đơn có tên vẫn bị chặn ngầm (route thật)', { skip: BO_QUA }, async () => {
  dungCsdl();
  themDon(1, { an: 0 });
  await canBo('POST', '/submissions/1/mark-spam', { reason: 'x' });
  const don = await guiDon(DON_CO_TEN);
  assert.equal(don.is_spam, 1);
  assert.equal(don.status, 'spam');
});

test('R2 — chiều ngược: review=spam đơn ẨN DANH, đơn CÓ TÊN gửi sau đó qua route thật không bị chặn', { skip: BO_QUA }, async () => {
  dungCsdl();
  themDon(2, { an: 1, status: 'pending_review' });
  const r = await canBo('POST', '/submissions/2/review', { action: 'spam' });
  assert.equal(r.status, 200);
  const don = await guiDon(DON_CO_TEN);
  assert.equal(don.is_spam, 0, 'đơn có tên bị chặn ngầm vì máy bị khoá qua một đơn ẩn danh');
  assert.equal(don.status, 'received');
});

/* SEC-DEC-008 #3 (M-B) lật khẳng định: đây chính là kịch bản chị Hoa — đơn ẩn
   danh không còn gây khoá, nên tố giác sau không bị chặn ngầm */
test('R13 — chiều ngược: review=spam tố giác ẩn danh, tố giác ẩn danh tiếp theo cùng máy KHÔNG bị chặn ngầm, 0 dòng khoá (route thật)', { skip: BO_QUA }, async () => {
  dungCsdl();
  themDon(2, { an: 1, status: 'pending_review' });
  await canBo('POST', '/submissions/2/review', { action: 'spam' });
  const don = await guiDon(DON_AN_DANH);
  assert.equal(don.is_spam, 0, 'tố giác ẩn danh bị chặn ngầm vì tố giác trước cùng máy bị rác');
  assert.equal(don.status, 'pending_review');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM blacklists').get().n, 0);
});

test('R3 — khoá tái phạm 30 ngày sinh từ đơn có tên không chặn đơn ẩn danh', { skip: BO_QUA }, async () => {
  dungCsdl();
  themDon(1, { an: 0, tao: luc(180) });
  themDon(2, { an: 0, tao: luc(120) });
  themDon(3, { an: 0, tao: luc(60) });
  for (const id of [1, 2, 3]) await canBo('POST', `/submissions/${id}/mark-spam`, { reason: 'x' });
  assert.ok(khoaCon('co_ten')?.gio > 24 * 29, 'ba lần đánh rác đơn có tên phải khoá 30 ngày loại có tên');
  assert.equal((await nhan(true)).chanNgam, false, 'khoá tái phạm từ đơn có tên chặn cả đơn ẩn danh');
  assert.equal((await nhan(false)).chanNgam, true);
});

/* SEC-DEC-008 #4 (G1): không còn khoá IP. Ba test R4 dưới đây thay cho ba test
   khẳng định khoá IP có tác dụng với đúng loại — tính chất chúng canh (khoá do
   đơn có tên gây ra không chặn đơn ẩn danh cùng IP) nay khẳng định chặt hơn:
   không chặn loại nào. Đủ biến thể ở tests/bo-khoa-ip.test.js. */
test('R4 — dòng khoá IP loại có tên còn sót không chặn đơn nào cùng IP; khoaIpThuCong không còn', { skip: BO_QUA }, async () => {
  dungCsdl();
  assert.equal(khoaIpThuCong, undefined, 'khoaIpThuCong vẫn được export');
  /* Dữ liệu mã cũ để lại — dạng thô, đúng dạng mà nhánh kiểm cũ so */
  db.prepare(`INSERT INTO blacklists (identifier, kind, loai_don, reason, created_by, expires_at)
    VALUES (?, 'ip', 'co_ten', 'x', 4, ?)`).run(IP_THO, luc(-120));
  assert.equal((await nhanDon(true)).chanNgam, false, 'khoá IP từ đơn có tên chặn đơn ẩn danh cùng IP');
  assert.equal((await nhanDon(false)).chanNgam, false, 'khoá IP vẫn chặn đơn có tên cùng IP');
});

test('R4 — mark-spam đơn có tên không mã máy, có cờ khoaIp: không ghi dòng khoá IP, không báo khoá địa chỉ mạng', { skip: BO_QUA }, async () => {
  dungCsdl();
  themDon(1, { an: 0, may: null });
  const r = await canBo('POST', '/submissions/1/mark-spam', { reason: 'x', khoaIp: true });
  assert.equal(r.status, 200);
  assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM blacklists WHERE kind = 'ip'`).get().n, 0);
  assert.doesNotMatch(r.body.ghiChu, /địa chỉ mạng/i);
});

test('R4 — 3 đơn có tên chặn ngầm từ 3 máy cùng IP: không có luật tự khoá IP, không dòng khoá IP', { skip: BO_QUA }, async () => {
  dungCsdl();
  assert.equal(xetKhoaIp, undefined, 'xetKhoaIp vẫn được export');
  const may = ['a1b2c3d4-0000-4000-8000-000000000001', 'a1b2c3d4-0000-4000-8000-000000000002', 'a1b2c3d4-0000-4000-8000-000000000003'];
  may.forEach((m, i) => themDonChanNgam(30 + i, { an: 0, may: m, ip: IP_THO }));
  assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM blacklists WHERE kind = 'ip'`).get().n, 0);
  assert.equal((await nhanDon(true)).chanNgam, false);
  assert.equal((await nhanDon(false)).chanNgam, false);
});

/* SEC-DEC-008 #3: NULL = ẩn danh = không hậu quả theo máy */
test('R5 — đơn có is_anonymous NULL bị đánh rác thì xử như ẩn danh: không có dòng khoá nào, không chặn loại nào', { skip: BO_QUA }, async () => {
  dungCsdl();
  themDon(1, { an: null });
  await canBo('POST', '/submissions/1/mark-spam', { reason: 'x' });
  assert.equal((await nhan(false)).chanNgam, false, 'không rõ loại mà khoá luôn đơn có tên');
  assert.equal((await nhan(true)).chanNgam, false, 'không rõ loại mà khoá theo máy');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM blacklists').get().n, 0);
});

test('R6 — /kiem-tra-khoa: chỉ khoá loại có tên thì biểu mẫu vẫn mở, không lộ khoá loại nào', { skip: BO_QUA }, async () => {
  dungCsdl();
  themDon(1, { an: 0 });
  await canBo('POST', '/submissions/1/mark-spam', { reason: 'x' });
  const k = await congKhai('POST', '/kiem-tra-khoa', { deviceId: MAY_P });
  assert.equal(k.body?.biKhoa, false, 'giao diện sẽ thay cả biểu mẫu tố giác ẩn danh bằng màn hình khoá');
  assert.doesNotMatch(k.text, /an_danh|co_ten|ẩn danh|có tên|loai/i);
});

test('R6 — /kiem-tra-khoa: khoá CẢ HAI loại vẫn không báo khoá — màn hình khoá là phép thử "tố giác ẩn danh này có cùng máy với người có tên kia không"', { skip: BO_QUA }, async () => {
  /* Cán bộ đánh rác tố giác ẩn danh B, rồi đánh rác một đơn có tên của P. Nếu
     màn hình khoá hiện khi cả hai loại bị khoá thì P gặp màn hình khoá khi và
     chỉ khi B gửi từ máy của P. Trạng thái giao diện không được phụ thuộc vào
     khoá loại ẩn danh. */
  dungCsdl();
  themDon(1, { an: 0 });
  themDon(2, { an: 1, status: 'pending_review' });
  await canBo('POST', '/submissions/1/mark-spam', { reason: 'x' });
  await canBo('POST', '/submissions/2/review', { action: 'spam' });
  /* SEC-DEC-008 #3: review=spam đơn ẩn danh không còn tạo khoá — dựng được khoá
     có tên, KHÔNG dựng được dòng ẩn danh */
  assert.ok(khoaCon('co_ten'));
  assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM blacklists WHERE loai_don = 'an_danh'`).get().n, 0);
  const k = await congKhai('POST', '/kiem-tra-khoa', { deviceId: MAY_P });
  assert.equal(k.body?.biKhoa, false, 'màn hình khoá hiện khi máy bị khoá cả hai loại');
});

test('R7 — khôi phục rồi mark-spam lại CÙNG một đơn không làm mới khoá (b2)', { skip: BO_QUA }, async () => {
  dungCsdl();
  themDon(1, { an: 0 });
  await canBo('POST', '/submissions/1/mark-spam', { reason: 'x' });
  db.exec(`UPDATE blacklists SET expires_at = datetime('now', '+10 minutes')`);
  assert.equal((await canBo('POST', '/trash/1/restore')).status, 200);
  const r = await canBo('POST', '/submissions/1/mark-spam', { reason: 'x' });
  assert.equal(r.status, 200);
  assert.ok(khoaCon('co_ten').gio < 1, `khoá được làm mới: còn ${khoaCon('co_ten').gio.toFixed(1)} giờ`);
  const don = db.prepare('SELECT status, deleted_at FROM submissions WHERE id = 1').get();
  assert.equal(don.status, 'spam', 'đơn vẫn phải được đánh dấu tin rác');
  assert.ok(don.deleted_at, 'đơn vẫn phải vào thùng rác');
});

/* SEC-DEC-008 #3: không còn khoá ẩn danh để làm mới — "không gia hạn" thành
   "không có gì để gia hạn" */
test('R7 — vòng khôi phục + review=spam lại cùng một đơn ẩn danh: không có dòng khoá nào sau cả vòng', { skip: BO_QUA }, async () => {
  dungCsdl();
  themDon(2, { an: 1, status: 'pending_review' });
  await canBo('POST', '/submissions/2/review', { action: 'spam' });
  db.exec(`UPDATE blacklists SET expires_at = datetime('now', '+10 minutes')`);
  assert.equal((await canBo('POST', '/trash/2/restore')).status, 200);
  assert.equal((await canBo('POST', '/submissions/2/review', { action: 'spam' })).status, 200);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM blacklists').get().n, 0, 'đơn ẩn danh gây khoá theo máy');
});

test('R8 — mark-spam tay đơn đang bị chặn ngầm: không gia hạn khoá, không đẩy lên 30 ngày (b1)', { skip: BO_QUA }, async () => {
  dungCsdl();
  themDon(1, { an: 0, tao: luc(300) });
  await canBo('POST', '/submissions/1/mark-spam', { reason: 'x' });
  db.exec(`UPDATE blacklists SET expires_at = datetime('now', '+10 minutes')`);
  themDonChanNgam(11, { an: 0, tao: luc(20) });
  themDonChanNgam(12, { an: 0, tao: luc(10) });
  const r1 = await canBo('POST', '/submissions/11/mark-spam', { reason: 'x' });
  const r2 = await canBo('POST', '/submissions/12/mark-spam', { reason: 'x' });
  assert.equal(r1.status, 200);
  assert.equal(r2.status, 200);
  assert.notEqual(r2.body?.taiPham, true);
  assert.ok(khoaCon('co_ten').gio < 1, `khoá bị gia hạn: còn ${khoaCon('co_ten').gio.toFixed(1)} giờ`);
  for (const id of [11, 12]) {
    assert.ok(db.prepare('SELECT deleted_at FROM submissions WHERE id = ?').get(id).deleted_at, `đơn ${id} vẫn phải vào thùng rác`);
  }
});

test('R8 — đơn chặn ngầm đã bị đánh rác tay không được đếm vào tái phạm về sau', { skip: BO_QUA }, async () => {
  dungCsdl();
  themDon(1, { an: 0, tao: luc(300) });
  await canBo('POST', '/submissions/1/mark-spam', { reason: 'x' });
  themDonChanNgam(11, { an: 0, tao: luc(200) });
  themDonChanNgam(12, { an: 0, tao: luc(100) });
  await canBo('POST', '/submissions/11/mark-spam', { reason: 'x' });
  await canBo('POST', '/submissions/12/mark-spam', { reason: 'x' });
  /* Một đơn mới, cán bộ đánh rác thật: mới là quyết định thứ hai, chưa đủ ba */
  themDon(13, { an: 0, tao: luc(5) });
  const r = await canBo('POST', '/submissions/13/mark-spam', { reason: 'x' });
  assert.notEqual(r.body?.taiPham, true, 'đơn chặn ngầm bị đếm thành quyết định cán bộ');
  assert.ok(khoaCon('co_ten').gio <= 24.1, `khoá ${khoaCon('co_ten').gio.toFixed(1)} giờ`);
});

test('R9 — 2 đơn ẩn danh rác + 1 đơn có tên rác cùng máy không tạo khoá 30 ngày cho loại nào', { skip: BO_QUA }, async () => {
  dungCsdl();
  themDon(11, { an: 1, status: 'pending_review', tao: luc(180), assigned: 2 });
  themDon(12, { an: 1, status: 'pending_review', tao: luc(120), assigned: 2 });
  themDon(13, { an: 0, tao: luc(60) });
  await canBo('POST', '/submissions/11/review', { action: 'spam' });
  await canBo('POST', '/submissions/12/review', { action: 'spam' });
  const r = await canBo('POST', '/submissions/13/mark-spam', { reason: 'x' });
  assert.notEqual(r.body?.taiPham, true);
  const dai = db.prepare(`SELECT COUNT(*) AS n FROM blacklists WHERE expires_at > datetime('now', '+2 days')`).get().n;
  assert.equal(dai, 0, 'đếm tái phạm trộn hai loại đơn');
});

test('R12 — thiết bị tin cậy vẫn miễn khoá với mọi loại', { skip: BO_QUA }, async () => {
  dungCsdl();
  db.exec(`INSERT INTO blacklists (identifier, kind, reason, expires_at) VALUES ('${MAY_P}', 'trusted_device', 'kiosk', datetime('now', '+100 years'))`);
  db.exec(`INSERT INTO blacklists (identifier, kind, loai_don, reason, expires_at) VALUES
           ('${MAY_P}', 'device', 'co_ten', 'x', datetime('now', '+1 day')),
           ('${MAY_P}', 'device', 'an_danh', 'x', datetime('now', '+1 day'))`);
  assert.equal((await nhan(true)).chanNgam, false);
  assert.equal((await nhan(false)).chanNgam, false);
});

test('Dòng khoá cũ (trước nang_cap_v19, loai_don = khong_ro) không chặn loại đơn nào', { skip: BO_QUA }, async () => {
  dungCsdl();
  db.exec(`INSERT INTO blacklists (identifier, kind, reason, expires_at) VALUES ('${MAY_P}', 'device', 'cũ', datetime('now', '+1 day'))`);
  assert.equal((await nhan(true)).chanNgam, false, 'khoá không rõ loại chặn đơn ẩn danh');
  assert.equal((await nhan(false)).chanNgam, false, 'khoá không rõ loại chặn đơn có tên');
});

test('kiemTraBiKhoa không được nói rõ loại đơn thì không chặn (không rõ loại -> không đoán)', { skip: BO_QUA }, async () => {
  dungCsdl();
  db.exec(`INSERT INTO blacklists (identifier, kind, loai_don, reason, expires_at) VALUES
           ('${MAY_P}', 'device', 'co_ten', 'x', datetime('now', '+1 day')),
           ('${MAY_P}', 'device', 'an_danh', 'x', datetime('now', '+1 day'))`);
  const kq = await kiemTraBiKhoa(pool, { deviceId: MAY_P, ip: IP_THO });
  assert.equal(kq.biKhoa, false);
});

test('Khiếu nại: máy bị khoá cả hai loại chỉ sinh MỘT khiếu nại mỗi đối tượng — hai dòng giống nhau là lộ máy từng bị khoá loại ẩn danh', { skip: BO_QUA }, async () => {
  dungCsdl();
  db.exec(`INSERT INTO blacklists (identifier, kind, loai_don, reason, expires_at) VALUES
           ('${MAY_P}', 'device', 'co_ten', 'x', datetime('now', '+1 day')),
           ('${MAY_P}', 'device', 'an_danh', 'x', datetime('now', '+1 day'))`);
  const tt = await khieuNai('GET', `/trang-thai?deviceId=${MAY_P}`);
  assert.deepEqual(tt.body?.loaiKhoa, ['device']);
  const r = await khieuNai('POST', '/', { deviceId: MAY_P, noiDung: 'Tôi là Phạm Văn Phúc, xin mở khoá máy' });
  assert.equal(r.status, 201);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM unlock_appeals').get().n, 1);
});

/* ------------------------------------------------------------------------ */
/* Vòng 2 — biến thể trọng tài tìm ra sau bản vá đầu                          */
/* ------------------------------------------------------------------------ */

/* Đúng hàng mà routes/submissions.js ghi khi đơn bị chặn ngầm CÓ ẢNH NGHI NGỜ:
   INSERT status='spam', is_spam=1, rồi bước 8 ghi đè status='pending_review'. */
const themDonChanNgamCoAnh = (id, o = {}) => themDon(id, { tao: luc(1), ...o, status: 'pending_review', spam: 1 });

test('N1 — review=spam đơn chặn ngầm có ảnh (pending_review, is_spam=1) không gia hạn khoá', { skip: BO_QUA }, async () => {
  dungCsdl();
  themDon(1, { an: 0, tao: luc(300) });
  await canBo('POST', '/submissions/1/mark-spam', { reason: 'x' });
  db.exec(`UPDATE blacklists SET expires_at = datetime('now', '+10 minutes')`);
  themDonChanNgamCoAnh(11, { an: 0 });
  const r = await canBo('POST', '/submissions/11/review', { action: 'spam' });
  assert.equal(r.status, 200);
  assert.ok(khoaCon('co_ten').gio < 1, `khoá bị gia hạn: còn ${khoaCon('co_ten').gio.toFixed(1)} giờ`);
});

test('N1 — mark-spam đơn chặn ngầm có ảnh không gia hạn khoá', { skip: BO_QUA }, async () => {
  dungCsdl();
  themDon(1, { an: 0, tao: luc(300) });
  await canBo('POST', '/submissions/1/mark-spam', { reason: 'x' });
  db.exec(`UPDATE blacklists SET expires_at = datetime('now', '+10 minutes')`);
  themDonChanNgamCoAnh(11, { an: 0 });
  const r = await canBo('POST', '/submissions/11/mark-spam', { reason: 'x' });
  assert.equal(r.status, 200);
  assert.ok(khoaCon('co_ten').gio < 1, `khoá bị gia hạn: còn ${khoaCon('co_ten').gio.toFixed(1)} giờ`);
});

test('N1 — đơn chặn ngầm có ảnh bị đánh rác tay (review/mark-spam) không được đếm tái phạm', { skip: BO_QUA }, async () => {
  dungCsdl();
  themDon(1, { an: 0, tao: luc(300) });
  await canBo('POST', '/submissions/1/mark-spam', { reason: 'x' });
  themDonChanNgamCoAnh(11, { an: 0, tao: luc(200) });
  themDonChanNgamCoAnh(12, { an: 0, tao: luc(100) });
  await canBo('POST', '/submissions/11/mark-spam', { reason: 'x' });
  await canBo('POST', '/submissions/12/review', { action: 'spam' });
  themDon(13, { an: 0, tao: luc(5) });
  const r = await canBo('POST', '/submissions/13/mark-spam', { reason: 'x' });
  assert.notEqual(r.body?.taiPham, true, 'đơn chặn ngầm bị đếm thành quyết định cán bộ');
  assert.ok(khoaCon('co_ten').gio <= 24.1, `khoá ${khoaCon('co_ten').gio.toFixed(1)} giờ`);
});

test('N1c — cú bấm trên một đơn không cuốn đơn chặn ngầm cùng máy, nên chúng không thành quyết định cán bộ', { skip: BO_QUA }, async () => {
  dungCsdl();
  themDon(1, { an: 0, tao: luc(300) });
  await canBo('POST', '/submissions/1/mark-spam', { reason: 'x' });
  themDonChanNgamCoAnh(11, { an: 0, tao: luc(200) });
  themDonChanNgamCoAnh(12, { an: 0, tao: luc(100) });
  themDon(13, { an: 0, tao: luc(5) });
  const truoc = db.prepare('SELECT id, status, deleted_at FROM submissions WHERE id <> 13 ORDER BY id').all().map((x) => ({ ...x }));
  const r = await canBo('POST', '/submissions/13/mark-spam', { reason: 'x' });
  assert.equal(r.status, 200, r.text);
  /* SEC-DEC-008 M-D: dọn theo lô đã gỡ — khẳng định rộng hơn "soDonDaDon = 0" cũ */
  const sau = db.prepare('SELECT id, status, deleted_at FROM submissions WHERE id <> 13 ORDER BY id').all().map((x) => ({ ...x }));
  assert.deepEqual(sau, truoc, 'cú bấm trên đơn 13 đổi status/deleted_at của đơn khác');
  assert.notEqual(r.body?.taiPham, true);
});

/* Giả lập CSDL chưa chạy va_loi_duyet_tin_an_danh.sql: ENUM status_history thiếu
   'spam' -> mọi INSERT dòng lịch sử 'spam' lỗi (route nuốt lỗi). */
const hongLichSuSpam = () => db.exec(`CREATE TRIGGER enum_cu BEFORE INSERT ON status_history
  WHEN NEW.new_status = 'spam' OR NEW.old_status = 'spam' BEGIN SELECT RAISE(ABORT, 'Data truncated for column new_status'); END`);

test('N2 — ghi status_history lỗi: khôi phục + mark-spam lại vẫn không làm mới khoá', { skip: BO_QUA }, async () => {
  dungCsdl();
  hongLichSuSpam();
  themDon(1, { an: 0 });
  await canBo('POST', '/submissions/1/mark-spam', { reason: 'x' });
  db.exec(`UPDATE blacklists SET expires_at = datetime('now', '+10 minutes')`);
  assert.equal((await canBo('POST', '/trash/1/restore')).status, 200);
  /* Không có dòng lịch sử nào, đơn mang is_spam = 1: không phân biệt được với
     đơn bị chặn ngầm, nên route phải ghi dấu "không tính tái phạm" — mà ghi
     không được. Thiết kế: từ chối đánh rác, không làm gì nửa vời. */
  const r = await canBo('POST', '/submissions/1/mark-spam', { reason: 'x' });
  assert.notEqual(r.status, 200, 'đánh rác mà không ghi được dấu không tính tái phạm');
  assert.ok(khoaCon('co_ten').gio < 1, `khoá được làm mới: còn ${khoaCon('co_ten').gio.toFixed(1)} giờ`);
  assert.equal(db.prepare('SELECT deleted_at FROM submissions WHERE id = 1').get().deleted_at, null,
    'đơn bị đưa vào thùng rác dù thao tác báo lỗi');
});

/* SEC-DEC-008 #3: như R7 ẩn danh ở trên */
test('N2 — ghi status_history lỗi: khôi phục + review=spam lại đơn ẩn danh — không có dòng khoá nào sau cả vòng', { skip: BO_QUA }, async () => {
  dungCsdl();
  hongLichSuSpam();
  themDon(2, { an: 1, status: 'pending_review' });
  await canBo('POST', '/submissions/2/review', { action: 'spam' });
  db.exec(`UPDATE blacklists SET expires_at = datetime('now', '+10 minutes')`);
  assert.equal((await canBo('POST', '/trash/2/restore')).status, 200);
  assert.equal((await canBo('POST', '/submissions/2/review', { action: 'spam' })).status, 200);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM blacklists').get().n, 0, 'đơn ẩn danh gây khoá theo máy');
});

const MGR = { id: 2, username: 'mgr2', role: 'manager', full_name: 'Lãnh đạo' };
const khoaHaiLoai = () => db.exec(`INSERT INTO blacklists (identifier, kind, loai_don, reason, expires_at) VALUES
  ('${MAY_P}', 'device', 'co_ten', 'Tin rác: x', datetime('now', '+1 day')),
  ('${MAY_P}', 'device', 'an_danh', 'Tin rác — đánh dấu tại hàng chờ kiểm duyệt', datetime('now', '+1 day'))`);

test('N5 — máy chỉ bị khoá loại ẩn danh: không có đường khiếu nại (khiếu nại ký tên về khoá ẩn danh là tự khai danh tính)', { skip: BO_QUA }, async () => {
  dungCsdl();
  db.exec(`INSERT INTO blacklists (identifier, kind, loai_don, reason, expires_at)
           VALUES ('${MAY_P}', 'device', 'an_danh', 'x', datetime('now', '+1 day'))`);
  const tt = await khieuNai('GET', `/trang-thai?deviceId=${MAY_P}`);
  assert.equal(tt.body?.biKhoa, false);
  const r = await khieuNai('POST', '/', { deviceId: MAY_P, noiDung: 'Tôi là Phạm Văn Phúc, xin mở khoá máy' });
  assert.equal(r.status, 400);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM unlock_appeals').get().n, 0);
});

test('N5 — khoá cả hai loại, chấp nhận khiếu nại: chỉ gỡ khoá loại có tên, "còn bị khoá" không phản ánh khoá ẩn danh', { skip: BO_QUA }, async () => {
  dungCsdl();
  khoaHaiLoai();
  assert.equal((await khieuNai('POST', '/', { deviceId: MAY_P, noiDung: 'Tôi là Phạm Văn Phúc, xin mở khoá máy' })).status, 201);
  const kn = (await goi('/api/admin', adminRouter, HANDLER, 'GET', '/chat/khieu-nai')).body;
  assert.equal(kn.length, 1);
  const xl = await goi('/api/admin', adminRouter, MGR, 'POST', `/chat/khieu-nai/${kn[0].id}/xu-ly`, { quyetDinh: 'go_khoa' });
  assert.equal(xl.status, 200);
  const conLai = db.prepare(`SELECT loai_don FROM blacklists ORDER BY loai_don`).all().map((r) => r.loai_don);
  assert.deepEqual(conLai, ['an_danh'], 'gỡ khoá theo khiếu nại phải chỉ gỡ loại có tên — gỡ cả loại ẩn danh là dòng khoá ẩn danh biến mất đúng lúc xử lý khiếu nại ký tên');
  const sau = (await goi('/api/admin', adminRouter, HANDLER, 'GET', '/chat/khieu-nai?tatCa=1')).body;
  assert.equal(sau[0].con_bi_khoa, false, 'cờ "còn bị khoá" của khiếu nại ký tên lộ ra khoá loại ẩn danh còn lại');
});

test('N5 — giao diện: ô khiếu nại hiện phía trên biểu mẫu, không chỉ trong màn hình khoá', async () => {
  const trang = await readFile(new URL('../../src/pages/SendFeedbackPage.tsx', import.meta.url), 'utf8');
  /* /kiem-tra-khoa không còn báo khoá nên màn hình khoá không hiện; ô khiếu nại
     chỉ nằm ở đó là mất lối khiếu nại. Và nếu nó chỉ hiện khi CẢ HAI loại bị
     khoá thì mọi khiếu nại đều ngầm nói "máy này đang bị khoá loại ẩn danh". */
  assert.match(trang, /<KhieuNaiMoKhoa\s*\/>/);
});

test('Migration nang_cap_v19.sql thêm loai_don và đổi khoá duy nhất', async () => {
  const sql = await readFile(new URL('../../database/nang_cap_v19.sql', import.meta.url), 'utf8');
  /* Câu ALTER nằm trong SQL động (PREPARE) nên nháy đơn bị nhân đôi */
  assert.match(sql, /loai_don\s+ENUM\('{1,2}an_danh'{1,2},\s*'{1,2}co_ten'{1,2},\s*'{1,2}khong_ro'{1,2}\)\s+NOT NULL\s+DEFAULT\s+'{1,2}khong_ro'{1,2}/);
  assert.match(sql, /UNIQUE KEY uq_dinh_danh_loai \(identifier, kind, loai_don\)/);
  assert.match(sql, /DROP INDEX uq_dinh_danh\b/);
});

/* Lối gọi hàm quyết định với IP thô, cho các test khoá IP */
function nhanDon(anDanh) {
  return xetTruocKhiNhan(pool, { body: { isAnonymous: anDanh }, ip: IP_THO });
}
