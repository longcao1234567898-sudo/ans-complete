/**
 * BUG-016 — Không còn khoá theo địa chỉ mạng ở bất kỳ đâu (SEC-DEC-008, G1, phiên FIX #4).
 *
 * Vì sao: khoá IP chưa từng có tác dụng kể từ khi chuyển sang lưu IP băm (lưu
 * băm, kiểm bằng thô), nhưng cán bộ vẫn được báo "đã khoá địa chỉ mạng 2 giờ".
 * Sửa cho chạy thì một cú "Tin rác" lên đơn không mã máy qua 4G chặn ngầm cả
 * vùng thuê bao dùng chung IP — thử nghiệm trên người dân. Loc chọn bỏ hẳn lớp
 * này. Giới hạn theo IP đã băm (giờ, ngày, chờ, trùng) GIỮ NGUYÊN.
 *
 * Tệp này canh:
 *   · R1'  mark-spam đơn không mã máy, có hay không cờ khoaIp: không dòng kind='ip',
 *          phản hồi nói đúng sự thật (không khoá), không nhắc "địa chỉ mạng"
 *   · R2'  3 đơn rác từ 3 máy cùng IP: không dòng kind='ip' — kể cả khi dữ liệu
 *          khớp đúng dạng mà mã cũ so
 *   · R3'  khiếu nại và /kiem-tra-khoa không còn nhánh IP
 *   · nhận đơn: dòng kind='ip' còn sót trong CSDL không chặn ngầm ai
 *   · R5   không đường nào trong mã ghi dòng kind='ip' (allow-list trên mã nguồn)
 *   · R6'  thiết bị tin cậy không đổi, khoá thiết bị đơn có tên còn tác dụng
 *   · R7'  ô c1 của BUG-015: đánh rác đơn có tên không mã máy không chặn ai cùng IP
 *   · tệp dọn database/nang_cap_v23.sql xoá mọi dòng kind='ip', không đụng gì khác
 *   · giới hạn theo IP đã băm còn chạy; giao diện không còn hỏi "khoá địa chỉ mạng?"
 *
 * Câu SQL của route và của tệp dọn chạy NGUYÊN VĂN trên node:sqlite, qua HTTP
 * thật. Node < 22 -> BỎ QUA (hiện rõ trong output), không âm thầm xanh.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { datBienMoiTruongHopLe } from './helpers-test.js';

datBienMoiTruongHopLe();

const { pool } = await import('../src/db.js');
const { signAccessToken } = await import('../src/lib/token.js');
const { encrypt, hashIdentifier } = await import('../src/lib/crypto.js');
const chanSpam = await import('../src/lib/chan-spam.js');
const { default: adminRouter } = await import('../src/routes/admin/index.js');
const { default: submissionsRouter } = await import('../src/routes/submissions.js');
const { default: khieuNaiRouter } = await import('../src/routes/khieu-nai.js');

const sqlite = await import('node:sqlite').catch(() => null);
const BO_QUA = sqlite ? false : 'cần node:sqlite (Node ≥ 22) để chạy câu SQL thật';

const HANDLER = { id: 4, username: 'cb4',  role: 'handler', full_name: 'Cán bộ xử lý' };
const MAY_HOA = '3f9c2a71-5b4e-4d8a-9c1f-7e2b6a0d4c95';
const MAY_KHAC = 'b81d0e46-2c7a-4f93-8e05-19a4c6f2d7b3';
/* fetch tới 127.0.0.1 -> req.ip của route công khai */
const IP_THO = '127.0.0.1';

/* ------------------------------------------------------------------------ */
/* CSDL thật trong bộ nhớ                                                    */
/* ------------------------------------------------------------------------ */

let db;
/* Đồng hồ ảo cho mọi NOW() trong SQL: hai kịch bản có mốc giờ giống hệt nhau.
   Mốc gốc lùi MỘT NGÀY so với giờ thật: route tính thời gian chờ giữa hai đơn
   bằng Date.now() thật trừ created_at (giờ ảo) — mốc ở tương lai là 429 oan. */
const GOC_DONG_HO = Math.floor((Date.now() - 24 * 3600_000) / 60_000) * 60_000;
let dongHo = GOC_DONG_HO;
const norm = (v) => (v instanceof Date ? v.toISOString().slice(0, 19).replace('T', ' ')
  : typeof v === 'boolean' ? Number(v) : v === undefined ? null : v);

/* Dịch đúng các cú pháp MySQL mà route và tệp dọn dùng — không dịch gì khác.
   Câu nào còn cú pháp lạ thì SQLite ném lỗi, test đỏ, người sửa biết. */
function sangSqlite(sql) {
  const dv = (d) => `${d.toLowerCase()}s`;
  let s = sql.replace(/DATE_(ADD|SUB)\(NOW\(\),\s*INTERVAL\s+(\?|\d+)\s+(HOUR|DAY|YEAR)\)/gi,
    (_m, huong, n, d) => `datetime(NOW(), '${huong.toUpperCase() === 'ADD' ? '+' : '-'}' || ${n} || ' ${dv(d)}')`);
  s = s.replace(/NOW\(\)\s*-\s*INTERVAL\s+(\?|\d+)\s+(HOUR|DAY|MINUTE)/gi,
    (_m, n, d) => `datetime(NOW(), '-' || ${n} || ' ${dv(d)}')`);
  s = s.replace(/DATEDIFF\(DATE_ADD\(s\.deleted_at,\s*INTERVAL\s+\?\s+DAY\),\s*NOW\(\)\)/gi,
    `CAST(julianday(s.deleted_at) + ? - julianday(NOW()) AS INT)`);
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
  dongHo = GOC_DONG_HO;
  db.function('NOW', () => norm(new Date(dongHo)));
  db.function('LEFT', (s, n) => (s == null ? null : String(s).slice(0, n)));
  for (const q of [
    `CREATE TABLE categories (id INT PRIMARY KEY, code TEXT, name TEXT, sla_days INT)`,
    `CREATE TABLE staff (id INT PRIMARY KEY, full_name TEXT, role TEXT, is_active INT DEFAULT 1)`,
    `CREATE TABLE wards (id INT PRIMARY KEY, name TEXT)`,
    `CREATE TABLE report_messages (submission_id INT, sender_type TEXT, read_by_staff INT)`,
    `CREATE TABLE submissions (
       id INTEGER PRIMARY KEY, tracking_code TEXT, original_content TEXT, ai_processed_content TEXT,
       category_id INT, ai_suggested_category_id INT, status TEXT, urgency TEXT, security_level TEXT DEFAULT 'thuong',
       is_anonymous INT, is_flagged INT DEFAULT 0, flag_reason TEXT, is_verified_otp INT,
       sender_name TEXT, sender_phone TEXT, sender_phone_hash TEXT, sender_email TEXT,
       ip_address TEXT, user_agent TEXT, content_hash TEXT,
       created_at TEXT DEFAULT (NOW()), updated_at TEXT DEFAULT (NOW()), deadline_at TEXT, resolved_at TEXT,
       assigned_to INT, resolved_by INT, reviewed_by INT, reviewed_at TEXT,
       rejection_reason TEXT, resolution_note TEXT, ward_id INT, chat_pin_hash TEXT,
       incident_lat REAL, incident_lng REAL,
       identity_erased INT DEFAULT 0, identity_erased_at TEXT, deleted_at TEXT, deleted_by INT,
       incident_group_id INT, device_id TEXT, is_spam INT DEFAULT 0)`,
    `CREATE TABLE submission_images (submission_id INT, image_url TEXT, mime_type TEXT, moderation_status TEXT)`,
    `CREATE TABLE status_history (submission_id INT, old_status TEXT, new_status TEXT, note TEXT,
       changed_at TEXT DEFAULT (NOW()), changed_by INT)`,
    `CREATE TABLE staff_activity_logs (id INTEGER PRIMARY KEY, staff_id INT, action TEXT, target_type TEXT,
       target_id TEXT, details TEXT, ip_address TEXT, created_at TEXT DEFAULT (NOW()))`,
    `CREATE TABLE activity_logs (id INTEGER PRIMARY KEY, staff_id INT, hanh_dong TEXT, loai_doi_tuong TEXT,
       doi_tuong_id TEXT, chi_tiet TEXT, ip_address TEXT, user_agent TEXT, created_at TEXT DEFAULT (NOW()))`,
    `CREATE TABLE incident_groups (id INTEGER PRIMARY KEY, ward_id INT, category_id INT, first_submission_id INT,
       submission_count INT, first_reported_at TEXT, last_reported_at TEXT, acknowledged INT DEFAULT 0)`,
    /* Lược đồ SAU database/nang_cap_v19.sql */
    `CREATE TABLE blacklists (id INTEGER PRIMARY KEY, identifier TEXT, kind TEXT,
       loai_don TEXT NOT NULL DEFAULT 'khong_ro', reason TEXT, created_by INT,
       created_at TEXT DEFAULT (NOW()), expires_at TEXT, UNIQUE (identifier, kind, loai_don))`,
    `CREATE VIEW vw_blacklist_active AS
       SELECT b.id, b.identifier, b.kind, b.reason, b.created_at, b.expires_at,
              st.full_name AS nguoi_khoa,
              CAST((julianday(b.expires_at) - julianday(NOW())) * 1440 AS INT) AS con_lai_phut
         FROM blacklists b LEFT JOIN staff st ON st.id = b.created_by
        WHERE b.expires_at > NOW() ORDER BY b.created_at DESC`,
    `CREATE TABLE unlock_appeals (
       id INTEGER PRIMARY KEY, identifier TEXT, kind TEXT, content TEXT, status TEXT DEFAULT 'cho_xu_ly',
       created_at TEXT DEFAULT (NOW()), handled_at TEXT, handled_by INT, handler_note TEXT,
       device_id TEXT, ip_address TEXT)`,
    `CREATE TABLE data_deletion_requests (
       id INTEGER PRIMARY KEY, submission_id INT, tracking_code TEXT, status TEXT DEFAULT 'pending',
       requested_at TEXT DEFAULT (NOW()), handled_at TEXT, handled_by INT, reason TEXT, requester_ip TEXT)`,
    `INSERT INTO categories VALUES (1, 'to_giac', 'Tố giác', 15), (3, 'phan_anh', 'Phản ánh', 15)`,
    `INSERT INTO staff (id, full_name) VALUES (1, 'Quản trị'), (2, 'Lãnh đạo'), (4, 'Cán bộ xử lý')`,
    /* updated_at trên MySQL là ON UPDATE CURRENT_TIMESTAMP: sửa bất kỳ cột nào thì
       tự đóng giờ, TRỪ KHI câu UPDATE gán updated_at tường minh (bài học P29 N1). */
    `CREATE TABLE _gan_updated_at (id INT)`,
    `CREATE TRIGGER _gan_tay BEFORE UPDATE OF updated_at ON submissions
       BEGIN INSERT INTO _gan_updated_at VALUES (NEW.id); END`,
    `CREATE TRIGGER _tu_dong_gio AFTER UPDATE ON submissions
       BEGIN
         UPDATE submissions SET updated_at = NOW()
          WHERE id = NEW.id AND NOT EXISTS (SELECT 1 FROM _gan_updated_at WHERE id = NEW.id);
         DELETE FROM _gan_updated_at WHERE id = NEW.id;
       END`,
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

const luc = (phutTruoc) => norm(new Date(dongHo - phutTruoc * 60000));
const troiQua = (phut) => { dongHo += phut * 60_000; };

/** Dựng thẳng một hàng đơn — dữ liệu mã CŨ ghi (đơn ẩn danh còn mang mã máy).
 *  an: 1 ẩn danh · 0 có tên · null không rõ (cột cho phép NULL) */
function themDon(id, { an = 1, may = MAY_HOA, ip = 'ip-da-bam', status, spam = 0, tao = luc(120) } = {}) {
  db.prepare(`INSERT INTO submissions (id, tracking_code, original_content, category_id, status, urgency,
      is_anonymous, sender_name, created_at, updated_at, deadline_at, device_id, ip_address, is_spam)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    id, `MA${String(id).padStart(4, '0')}`, `Nội dung đơn ${id}`, an === 0 ? 3 : 1,
    status ?? (an === 0 ? 'processing' : 'pending_review'), 'normal',
    an, an === 0 ? encrypt('Phạm Văn Phúc') : null, tao, tao, '2026-12-01 00:00:00', may, ip, spam);
}

async function goi(duongGoc, router, staff, method, duong, body) {
  troiQua(1);
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

/* Hai tố giác ẩn danh khác nội dung (không gộp nhóm sự kiện, không trùng gần đúng) */
const TO_GIAC_1 = 'Tối ngày 20 tháng 9, khoảng 22 giờ, tại bến sông thôn Đông có nhóm người dùng hai tàu hút cát trái phép, chở đi bằng xe tải không biển số.';
const TO_GIAC_2 = 'Nhà ông T ở cuối xóm Chợ tổ chức đánh bạc ăn tiền vào các tối thứ Bảy, có người canh ở đầu ngõ và dùng xe máy chở con bạc từ xã bên sang.';
const donAnDanh = (noiDung, may) => ({ isAnonymous: true, category: 'to_giac', content: noiDung, ...(may ? { deviceId: may } : {}) });
const DON_CO_TEN = {
  isAnonymous: false, category: 'phan_anh', deviceId: MAY_HOA,
  fullName: 'Phạm Văn Phúc', phone: '0916284735',
  content: 'Đèn đường ở ngõ 5 thôn Đông bị hỏng đã hai tuần, buổi tối đi lại rất nguy hiểm cho người già và trẻ nhỏ.',
};

/** Gửi thật qua POST /api/submissions, trả hàng đơn trong CSDL */
async function guiDon(body) {
  const r = await congKhai('POST', '/', body);
  assert.equal(r.status, 201, `POST /api/submissions không nhận đơn: ${r.status} ${r.text.slice(0, 300)}`);
  const hang = { ...db.prepare('SELECT * FROM submissions WHERE tracking_code = ?').get(r.body.trackingCode) };
  return { ...hang, phanHoi: r };
}
/* Đơn ẩn danh thứ hai từ cùng IP: qua thời gian chờ 10 phút giữa hai đơn */
const quaThoiGianCho = () => troiQua(15);

const dongKhoa = () => db.prepare('SELECT identifier, kind, loai_don FROM blacklists ORDER BY id').all().map((r) => ({ ...r }));
const soDongKhoa = () => db.prepare(`SELECT COUNT(*) AS n FROM blacklists WHERE kind IN ('device', 'ip')`).get().n;

/* ------------------------------------------------------------------------ */
/* Riêng cho BUG-016                                                          */
/* ------------------------------------------------------------------------ */

/* Dạng route nhận đơn ghi vào submissions.ip_address */
const IP_BAM = hashIdentifier(IP_THO).slice(0, 32);
const dongIp = () => db.prepare(`SELECT identifier, loai_don FROM blacklists WHERE kind = 'ip'`).all().map((r) => ({ ...r }));
/* Route nhận đơn gọi luật tự động mà không chờ — đợi nó chạy xong rồi mới đếm */
const choViecNgam = () => new Promise((r) => setTimeout(r, 50));
/* Đơn có tên KHÔNG gửi mã máy: gọi thẳng API, hoặc trình duyệt tắt localStorage */
const coTenKhongMay = () => { const { deviceId: _bo, ...b } = DON_CO_TEN; return b; };

/* Dòng kind='ip' mã cũ để lại, ở CẢ HAI dạng: băm (mark-spam ghi ip_address của
   đơn) và thô (dạng mà các nhánh kiểm đem so) — không dạng nào được chặn gì */
function themDongIpCu(loaiDon = 'co_ten') {
  const them = db.prepare(`INSERT INTO blacklists (identifier, kind, loai_don, reason, created_by, expires_at)
    VALUES (?, 'ip', ?, 'Tin rác (hồ sơ không có mã thiết bị)', 4, datetime(NOW(), '+1 days'))`);
  them.run(IP_BAM, loaiDon);
  them.run(IP_THO, loaiDon);
}

/* ======================================================================== */
/* R1' — đánh rác đơn không mã máy                                            */
/* ======================================================================== */

for (const khoaIp of [true, false, undefined]) {
  test(`R1' — mark-spam đơn có tên không mã máy (khoaIp=${khoaIp}): không dòng khoá nào, báo đúng là không khoá`, { skip: BO_QUA }, async () => {
    dungCsdl();
    themDon(1, { an: 0, may: null, ip: IP_BAM, status: 'processing' });
    const r = await canBo('POST', '/submissions/1/mark-spam', { reason: 'bịa đặt', ...(khoaIp === undefined ? {} : { khoaIp }) });
    assert.equal(r.status, 200, r.text);
    assert.equal(db.prepare('SELECT status FROM submissions WHERE id = 1').get().status, 'spam');
    assert.deepEqual(dongKhoa(), [], 'đánh rác đơn không mã máy vẫn ghi dòng khoá');
    assert.equal(r.body.daKhoaThietBi, false);
    assert.equal(r.body.kieuKhoa, '');
    assert.doesNotMatch(r.body.ghiChu, /địa chỉ mạng|khoá theo|2 giờ/i, 'cán bộ vẫn được hứa một cú khoá mạng');
    assert.match(r.body.ghiChu, /không có mã thiết bị nên không khoá/i, 'phải báo đúng sự thật: hồ sơ không có mã máy nên không khoá');
  });
}

test("R1' — review (hàng chờ) đánh rác đơn có tên không mã máy: không dòng khoá nào", { skip: BO_QUA }, async () => {
  dungCsdl();
  themDon(1, { an: 0, may: null, ip: IP_BAM, status: 'pending_review' });
  const r = await canBo('POST', '/submissions/1/review', { action: 'spam' });
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(dongKhoa(), []);
  assert.doesNotMatch(r.text, /địa chỉ mạng/i);
});

/* ======================================================================== */
/* R7' — ô c1 của BUG-015 vẫn kín                                             */
/* ======================================================================== */

test("R7' — ô c1 của BUG-015: đánh rác đơn có tên không mã máy (khoaIp) rồi đơn ẩn danh lẫn có tên cùng IP gửi tới: không đơn nào bị chặn ngầm", { skip: BO_QUA }, async () => {
  dungCsdl();
  themDon(1, { an: 0, may: null, ip: IP_BAM, status: 'processing', tao: luc(300) });
  assert.equal((await canBo('POST', '/submissions/1/mark-spam', { reason: 'x', khoaIp: true })).status, 200);
  const an = await guiDon(donAnDanh(TO_GIAC_1));
  assert.equal(an.is_spam, 0, 'tố giác ẩn danh cùng IP bị chặn ngầm vì một đơn có tên');
  assert.equal(an.status, 'pending_review');
  troiQua(15);
  const ten = await guiDon(coTenKhongMay());
  assert.equal(ten.is_spam, 0, 'đơn có tên cùng IP bị chặn ngầm theo địa chỉ mạng');
});

/* ======================================================================== */
/* Nhận đơn: dòng kind='ip' còn sót không chặn ai                             */
/* ======================================================================== */

for (const loaiDon of ['co_ten', 'an_danh', 'khong_ro']) {
  test(`nhận đơn — dòng kind='ip' còn sót (loai_don=${loaiDon}, dạng băm lẫn thô) không chặn ngầm đơn nào cùng IP`, { skip: BO_QUA }, async () => {
    dungCsdl();
    themDongIpCu(loaiDon);
    const ten = await guiDon(coTenKhongMay());
    assert.equal(ten.is_spam, 0, 'dòng khoá IP cũ vẫn chặn ngầm đơn có tên');
    troiQua(15);
    const an = await guiDon(donAnDanh(TO_GIAC_1));
    assert.equal(an.is_spam, 0, 'dòng khoá IP cũ vẫn chặn ngầm tố giác ẩn danh');
    for (const anDanh of [false, true]) {
      const kq = await chanSpam.xetTruocKhiNhan(pool, { body: { isAnonymous: anDanh }, ip: IP_THO });
      assert.equal(kq.chanNgam, false, `xetTruocKhiNhan chặn theo IP (anDanh=${anDanh})`);
      for (const ip of [IP_THO, IP_BAM]) {
        assert.equal((await chanSpam.kiemTraBiKhoa(pool, { deviceId: '', ip, anDanh })).biKhoa, false,
          `kiemTraBiKhoa còn nhánh IP (ip=${ip === IP_THO ? 'thô' : 'băm'}, anDanh=${anDanh})`);
      }
    }
  });
}

/* ======================================================================== */
/* R2' — luật tự động                                                         */
/* ======================================================================== */

test("R2' — 3 đơn rác có tên từ 3 máy cùng IP trong 1 giờ, đơn tiếp theo bị chặn ngầm: không dòng kind='ip' nào", { skip: BO_QUA }, async () => {
  dungCsdl();
  const may = ['a1b2c3d4-0000-4000-8000-000000000001', 'a1b2c3d4-0000-4000-8000-000000000002', 'a1b2c3d4-0000-4000-8000-000000000003'];
  /* Cả hai dạng IP trên cột ip_address: dạng route ghi (băm) và dạng mã cũ đem
     so (thô) — để phép thử không mù chỉ vì hai dạng lệch nhau */
  may.forEach((m, i) => {
    themDon(30 + i, { an: 0, may: m, ip: IP_BAM, status: 'spam', spam: 1, tao: luc(20) });
    themDon(40 + i, { an: 0, may: m, ip: IP_THO, status: 'spam', spam: 1, tao: luc(20) });
  });
  db.prepare(`INSERT INTO blacklists (identifier, kind, loai_don, reason, created_by, expires_at)
    VALUES (?, 'device', 'co_ten', 'Tin rác', 4, datetime(NOW(), '+1 days'))`).run(MAY_HOA);
  const don = await guiDon(DON_CO_TEN);
  assert.equal(don.is_spam, 1, 'khoá thiết bị loại có tên phải còn tác dụng');
  await choViecNgam();
  assert.deepEqual(dongIp(), [], 'luật tự động vẫn khoá địa chỉ mạng');
});

/* ======================================================================== */
/* R5 — không đường nào ghi dòng kind='ip'                                    */
/* ======================================================================== */

test('R5 — thư viện không còn hàm khoá IP (khoaIpThuCong, xetKhoaIp)', () => {
  assert.equal(chanSpam.khoaIpThuCong, undefined, 'khoaIpThuCong vẫn được export');
  assert.equal(chanSpam.xetKhoaIp, undefined, 'xetKhoaIp vẫn được export');
});

/* Tách danh sách giá trị của VALUES (...) theo dấu phẩy ở tầng ngoài cùng —
   giá trị có thể là DATE_ADD(NOW(), INTERVAL ? HOUR). ra.het: vị trí ngoặc đóng */
function tachGiaTri(sql, tu) {
  const mo = sql.indexOf('(', tu);
  let sau = 0;
  let dau = mo + 1;
  const ra = [];
  for (let i = mo; i < sql.length; i++) {
    const c = sql[i];
    if (c === '(') sau++;
    else if (c === ')' && --sau === 0) { ra.push(sql.slice(dau, i).trim()); ra.het = i; return ra; }
    else if (c === ',' && sau === 1) { ra.push(sql.slice(dau, i).trim()); dau = i + 1; }
  }
  throw new Error('VALUES không đóng ngoặc');
}

async function moiTepJs(thuMuc) {
  const ra = [];
  for (const muc of await readdir(thuMuc, { withFileTypes: true })) {
    const duong = join(thuMuc, muc.name);
    if (muc.isDirectory()) ra.push(...await moiTepJs(duong));
    else if (muc.name.endsWith('.js')) ra.push(duong);
  }
  return ra;
}

/**
 * Dò mọi câu GHI vào blacklists trong một đoạn mã. Allow-list: chỉ chấp nhận
 * đúng dạng `INSERT INTO blacklists (cột…) VALUES (…)` — MỘT bộ giá trị, kind là
 * hằng 'device' hoặc 'trusted_device', ON DUPLICATE KEY UPDATE không đụng kind.
 * Mọi cách ghi khác (REPLACE, INSERT IGNORE, INSERT … SET, INSERT … SELECT, tên
 * bảng trong dấu ` hoặc kèm schema, tên bảng động ${…}, nhiều bộ VALUES,
 * UPDATE … SET kind) đều tính là vi phạm — không phân tích được thì không chứng
 * minh được là không ghi 'ip'.
 * @returns {{ soCau: number, viPham: string[] }}
 */
function doCauGhiBlacklists(ma) {
  const CHO_PHEP = new Set(["'device'", "'trusted_device'"]);
  const viPham = [];
  let soCau = 0;
  for (const m of ma.matchAll(/\b(INSERT|REPLACE)\b[\w\s]*?\bINTO\s+([^\s(]+)/gi)) {
    const ten = m[2];
    const dong = ten.includes('${');
    if (!dong && !/^`?(\w+`?\.`?)?blacklists`?$/i.test(ten)) continue;   // bảng khác
    soCau++;
    const loi = (ly) => viPham.push(`${ly}: ${m[0].replace(/\s+/g, ' ')}…`);
    if (dong) { loi('tên bảng động, không kiểm được'); continue; }
    const dauCau = m[0].slice(0, m[0].length - ten.length).replace(/\s+/g, ' ').trim();
    if (!/^INSERT INTO$/i.test(dauCau) || ten !== 'blacklists') { loi('câu ghi không đúng dạng cho phép'); continue; }
    const sau = ma.slice(m.index + m[0].length);
    const dang = /^\s*\(([^)]*)\)\s*VALUES\b/i.exec(sau);
    if (!dang) { loi('không phải dạng (cột…) VALUES (…)'); continue; }
    const giaTri = tachGiaTri(sau, dang[0].length);
    const conLai = sau.slice(giaTri.het + 1);
    if (/^\s*,/.test(conLai)) { loi('nhiều bộ VALUES'); continue; }
    const cot = dang[1].split(',').map((c) => c.trim());
    const k = cot.indexOf('kind');
    if (k === -1) loi('không ghi cột kind');
    else if (!CHO_PHEP.has(giaTri[k])) loi(`ghi kind = ${giaTri[k]}`);
    /* Phần đuôi của chính câu đó: tới dấu ; hoặc hết template literal */
    const duoi = conLai.split(/[;`]/)[0];
    if (/\bON\s+DUPLICATE\s+KEY\s+UPDATE\b[\s\S]*\bkind\s*=/i.test(duoi)) loi('ON DUPLICATE KEY UPDATE đổi kind');
  }
  if (/\bUPDATE\s+`?(\w+`?\.`?)?blacklists`?\s[^;]*?\bSET\b[^;]*?\bkind\s*=/i.test(ma)) viPham.push('UPDATE đổi kind của blacklists');
  return { soCau, viPham };
}

test('R5 — bộ dò câu ghi blacklists bắt được mọi cú pháp lách allow-list', () => {
  const MAU_LACH = [
    "INSERT INTO blacklists (identifier, kind) VALUES (?, 'ip')",
    "REPLACE INTO blacklists (identifier, kind) VALUES (?, 'device')",
    "INSERT IGNORE INTO blacklists (identifier, kind) VALUES (?, 'device')",
    "INSERT INTO `blacklists` (identifier, kind) VALUES (?, 'device')",
    "INSERT INTO blacklists SET identifier = ?, kind = 'ip'",
    "INSERT INTO blacklists (identifier, kind) SELECT ip_address, 'ip' FROM submissions",
    "INSERT INTO blacklists (identifier, kind, expires_at) VALUES (?, ?, NOW())",
    "UPDATE blacklists SET kind = 'ip' WHERE id = ?",
    "UPDATE `blacklists` SET kind = 'ip' WHERE id = ?",
    /* Trọng tài vòng hai P42 */
    "INSERT INTO hop_thu_an_ninh_so.blacklists (identifier, kind) VALUES (?, 'ip')",
    'INSERT INTO ${BANG} (identifier, kind) VALUES (?, \'ip\')',
    "INSERT INTO blacklists (identifier, kind) VALUES (?, 'device'), (?, 'ip')",
    "INSERT INTO blacklists (identifier, kind) VALUES (?, 'device') ON DUPLICATE KEY UPDATE kind = 'ip'",
  ];
  for (const mau of MAU_LACH) {
    assert.ok(doCauGhiBlacklists(mau).viPham.length > 0, `bộ dò để lọt: ${mau}`);
  }
  const hopLe = doCauGhiBlacklists(`INSERT INTO blacklists (identifier, kind, loai_don, reason, created_by, expires_at)
       VALUES (?, 'device', ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? HOUR))`);
  assert.deepEqual(hopLe, { soCau: 1, viPham: [] }, 'bộ dò chặn nhầm câu hợp lệ');
});

test('R5 — mọi câu ghi vào blacklists trong server/src chỉ ghi kind trong allow-list (device, trusted_device)', async () => {
  const goc = fileURLToPath(new URL('../src', import.meta.url));
  let soCau = 0;
  for (const tep of await moiTepJs(goc)) {
    const kq = doCauGhiBlacklists(await readFile(tep, 'utf8'));
    soCau += kq.soCau;
    assert.deepEqual(kq.viPham, [], `${tep}: chỉ được ghi hằng 'device' hoặc 'trusted_device', dạng INSERT INTO blacklists (…) VALUES (…)`);
  }
  assert.ok(soCau > 0, 'không tìm thấy câu INSERT INTO blacklists nào — phép dò hỏng');
});

/* ======================================================================== */
/* R3' — khiếu nại và /kiem-tra-khoa                                          */
/* ======================================================================== */

test("R3' — khiếu nại không còn nhánh IP: dòng kind='ip' loại có tên (thô lẫn băm) không hiện ô khiếu nại, không nhận khiếu nại", { skip: BO_QUA }, async () => {
  dungCsdl();
  themDongIpCu('co_ten');
  const tt = await khieuNai('GET', '/trang-thai');
  assert.equal(tt.status, 200, tt.text);
  assert.equal(tt.body.biKhoa, false, 'khiếu nại vẫn đọc khoá theo địa chỉ mạng');
  const gui = await khieuNai('POST', '/', { noiDung: 'Tôi bị khoá oan, xin mở khoá cho mạng nhà tôi.' });
  assert.equal(gui.status, 400, gui.text);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM unlock_appeals').get().n, 0, 'khiếu nại được ghi cho một khoá IP');
});

test("R3' — không hồi quy: khiếu nại khoá THIẾT BỊ loại có tên vẫn chạy, không gộp khoá IP", { skip: BO_QUA }, async () => {
  dungCsdl();
  themDongIpCu('co_ten');
  db.prepare(`INSERT INTO blacklists (identifier, kind, loai_don, reason, created_by, expires_at)
    VALUES (?, 'device', 'co_ten', 'Tin rác', 4, datetime(NOW(), '+1 days'))`).run(MAY_HOA);
  const tt = await khieuNai('GET', `/trang-thai?deviceId=${MAY_HOA}`);
  assert.equal(tt.status, 200, tt.text);
  assert.equal(tt.body.biKhoa, true);
  assert.deepEqual(tt.body.loaiKhoa, ['device'], 'ô khiếu nại vẫn gộp cả khoá địa chỉ mạng');
});

test("R3' — /kiem-tra-khoa không báo khoá dù CSDL còn dòng kind='ip'", { skip: BO_QUA }, async () => {
  dungCsdl();
  themDongIpCu('co_ten');
  const r = await congKhai('POST', '/kiem-tra-khoa', { deviceId: MAY_HOA });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { biKhoa: false });
});

/* ======================================================================== */
/* R6' — thiết bị tin cậy, khoá thiết bị không đổi                            */
/* ======================================================================== */

test("R6' — thiết bị tin cậy vẫn miễn khoá; đánh rác đơn có tên CÓ mã máy vẫn khoá đúng máy đó", { skip: BO_QUA }, async () => {
  dungCsdl();
  const them = db.prepare(`INSERT INTO blacklists (identifier, kind, loai_don, reason, created_by, expires_at)
    VALUES (?, ?, ?, 'x', 4, datetime(NOW(), ?))`);
  them.run(MAY_HOA, 'trusted_device', 'khong_ro', '+100 years');
  them.run(MAY_HOA, 'device', 'co_ten', '+1 days');
  const tc = await chanSpam.kiemTraBiKhoa(pool, { deviceId: MAY_HOA, anDanh: false });
  assert.equal(tc.biKhoa, false);
  assert.equal(tc.tinCay, true);

  themDon(1, { an: 0, may: MAY_KHAC, ip: IP_BAM, status: 'processing' });
  const r = await canBo('POST', '/submissions/1/mark-spam', { reason: 'x', khoaIp: true });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.kieuKhoa, 'thiết bị');
  assert.deepEqual(dongKhoa().filter((k) => k.identifier === MAY_KHAC), [{ identifier: MAY_KHAC, kind: 'device', loai_don: 'co_ten' }]);
  assert.deepEqual(dongIp(), []);
  assert.equal((await chanSpam.kiemTraBiKhoa(pool, { deviceId: MAY_KHAC, anDanh: false })).biKhoa, true);
});

/* ======================================================================== */
/* Giới hạn theo IP đã băm còn chạy                                           */
/* ======================================================================== */

test('không hồi quy — 5 đơn trong giờ từ cùng IP thì đơn thứ sáu bị 429 (giới hạn theo IP băm giữ nguyên)', { skip: BO_QUA }, async () => {
  dungCsdl();
  for (let i = 1; i <= 5; i++) themDon(50 + i, { an: 0, may: null, ip: IP_BAM, tao: luc(30 + i) });
  const r = await congKhai('POST', '/', coTenKhongMay());
  assert.equal(r.status, 429, r.text);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM submissions').get().n, 5);
});

/* ======================================================================== */
/* Tệp dọn dữ liệu cũ                                                         */
/* ======================================================================== */

async function chayTep(ten) {
  const sql = await readFile(new URL(`../../database/${ten}`, import.meta.url), 'utf8');
  const cau = sql.replace(/--.*$/gm, '').split(';').map((c) => c.trim())
    .filter((c) => /^(UPDATE|DELETE)\b/i.test(c));
  assert.ok(cau.length > 0, `${ten} không có câu UPDATE/DELETE nào`);
  for (const c of cau) db.exec(sangSqlite(c));
}

test("nang_cap_v23.sql — xoá mọi dòng kind='ip' (mọi loại, còn hạn lẫn hết hạn); khoá thiết bị, thiết bị tin cậy, đơn không đổi; chạy lại không đổi thêm", { skip: BO_QUA }, async () => {
  dungCsdl();
  themDon(1, { an: 0, may: MAY_HOA, ip: IP_BAM });
  themDon(2, { an: 0, may: null, ip: IP_THO, status: 'spam', spam: 1 });
  const donTruoc = db.prepare('SELECT * FROM submissions ORDER BY id').all().map((r) => ({ ...r }));
  db.exec(`INSERT INTO blacklists (identifier, kind, loai_don, reason, created_by, expires_at) VALUES
    ('${IP_BAM}',  'ip', 'co_ten',   'Tin rác (hồ sơ không có mã thiết bị)', 4, datetime(NOW(), '+2 hours')),
    ('${IP_THO}',  'ip', 'co_ten',   'Tự động: 3 đơn rác từ 3 thiết bị trong 1 giờ', NULL, datetime(NOW(), '+1 hours')),
    ('ip-cu',      'ip', 'khong_ro', 'x', 4, datetime(NOW(), '+1 days')),
    ('ip-an',      'ip', 'an_danh',  'x', 4, datetime(NOW(), '+1 days')),
    ('ip-het-han', 'ip', 'co_ten',   'x', 4, datetime(NOW(), '-1 hours')),
    ('${MAY_HOA}',  'device', 'co_ten', 'Tin rác', 4, datetime(NOW(), '+1 days')),
    ('${MAY_KHAC}', 'trusted_device', 'khong_ro', 'kiosk', 1, datetime(NOW(), '+100 years'))`);
  const conLai = [
    { identifier: MAY_HOA, kind: 'device', loai_don: 'co_ten' },
    { identifier: MAY_KHAC, kind: 'trusted_device', loai_don: 'khong_ro' },
  ];
  await chayTep('nang_cap_v23.sql');
  assert.deepEqual(dongIp(), [], 'còn dòng khoá IP sau khi chạy tệp dọn');
  assert.deepEqual(dongKhoa(), conLai, 'tệp dọn đụng tới khoá thiết bị hoặc thiết bị tin cậy');
  assert.deepEqual(db.prepare('SELECT * FROM submissions ORDER BY id').all().map((r) => ({ ...r })), donTruoc, 'tệp dọn sửa bảng đơn');
  await chayTep('nang_cap_v23.sql');
  assert.deepEqual(dongKhoa(), conLai);
});

/* ======================================================================== */
/* Giao diện                                                                  */
/* ======================================================================== */

test('giao diện — không còn hộp hỏi "khoá địa chỉ mạng?", markSpam không gửi cờ khoaIp, đơn không mã máy được báo trước là không khoá', async () => {
  const trang = await readFile(new URL('../../src/pages/admin/AdminSubmissionDetailPage.tsx', import.meta.url), 'utf8');
  /* assert.ok thay cho match: đỏ thì không in cả tệp .tsx ra */
  assert.ok(!/khoaIp/.test(trang), 'trang chi tiết còn cờ khoaIp');
  /* Chuỗi hiện cho cán bộ (trong nháy đơn) không được nhắc khoá địa chỉ mạng;
     chú thích mã thì được */
  assert.ok(!/'[^'\n]*địa chỉ mạng[^'\n]*'/i.test(trang), 'trang chi tiết còn hỏi/hứa khoá địa chỉ mạng');
  assert.ok(/co_ma_thiet_bi/.test(trang), 'trang không còn xét hồ sơ có mã máy không trước khi hứa khoá');
  assert.ok(/không có mã thiết bị nên không khoá/i.test(trang), 'trang không báo trước cho cán bộ là hồ sơ không mã máy thì không khoá');
  const dv = await readFile(new URL('../../src/services/adminService.ts', import.meta.url), 'utf8');
  const i = dv.indexOf('export const markSpam');
  assert.ok(i > -1, 'không tìm thấy markSpam');
  const het = dv.indexOf('\nexport ', i + 1);
  assert.doesNotMatch(dv.slice(i, het > -1 ? het : undefined), /khoaIp/, 'markSpam vẫn gửi cờ khoaIp');
});

/* ======================================================================== */
/* R3' phía cán bộ — màn xét khiếu nại không còn nhánh IP                     */
/* ======================================================================== */

test("R3' — cán bộ xem khiếu nại cũ loại địa chỉ mạng: không báo 'còn bị khoá', không ghép đơn theo IP", { skip: BO_QUA }, async () => {
  dungCsdl();
  const IP_CU = 'ip-cu-da-bam';
  themDon(1, { an: 0, may: null, ip: IP_CU, status: 'spam', spam: 1 });
  db.prepare(`INSERT INTO blacklists (identifier, kind, loai_don, reason, created_by, expires_at)
    VALUES (?, 'ip', 'co_ten', 'x', 4, datetime(NOW(), '+1 days'))`).run(IP_CU);
  db.prepare(`INSERT INTO unlock_appeals (identifier, kind, content) VALUES (?, 'ip', 'Xin mở khoá mạng nhà tôi')`).run(IP_CU);
  const r = await canBo('GET', '/chat/khieu-nai?tatCa=1');
  assert.equal(r.status, 200, r.text);
  const [k] = r.body;
  assert.ok(k, 'không thấy khiếu nại');
  assert.equal(k.con_bi_khoa, false, 'màn khiếu nại vẫn coi dòng khoá IP là đang khoá');
  assert.deepEqual(k.tinLienQuan, [], 'màn khiếu nại vẫn ghép đơn theo địa chỉ mạng');
});

test('giao diện — trang Danh sách khoá và khu khiếu nại không còn nói hệ thống khoá theo địa chỉ mạng', async () => {
  const trang = await readFile(new URL('../../src/pages/admin/AdminBlacklistPage.tsx', import.meta.url), 'utf8');
  /* Hai lời hứa cũ về luật tự khoá IP. Nhãn "hệ thống tự khoá" ở cột người khoá
     (dòng không có created_by) không phải lời hứa khoá IP nên không cấm */
  assert.ok(!/tự\s*khoá\s*(<b>)?\s*2\s*giờ|chỉ\s*tự\s*khoá\s*khi/i.test(trang), 'trang Danh sách khoá vẫn nói hệ thống tự khoá địa chỉ IP');
  assert.ok(/không còn khoá theo địa chỉ mạng/i.test(trang), 'trang Danh sách khoá không nói rõ đã bỏ khoá theo địa chỉ mạng');
  const khu = await readFile(new URL('../../src/components/admin/KhuKhieuNai.tsx', import.meta.url), 'utf8');
  assert.ok(!/nhà mạng cấp chung địa chỉ/i.test(khu), 'khu khiếu nại vẫn nói máy bị khoá nhầm vì chung địa chỉ mạng');
});
