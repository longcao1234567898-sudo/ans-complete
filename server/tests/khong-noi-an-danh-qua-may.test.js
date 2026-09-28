/**
 * BUG-017 PHẦN NỐI — Đơn ẩn danh không chịu hậu quả nào theo máy hay theo mạng,
 * và không mang mã máy (SEC-DEC-008, M-B, phiên FIX #3).
 *
 * Vì sao: chị Hoa chỉ có một điện thoại. Chị gửi tố giác ẩn danh về một ổ cờ
 * bạc. Cán bộ C có dính líu bấm "Tin rác". Máy chị bị khoá với đơn ẩn danh; tố
 * giác thứ hai của chị bị gạt ngầm sang "nghi rác", C đọc được. So giờ khoá với
 * thùng rác, C biết hai đơn là của cùng một người, gộp nội dung lại thì đoán ra
 * chị. Mã máy lưu trên đơn ẩn danh còn cho người cầm bản sao CSDL nối tố giác
 * với một đơn có tên cùng máy.
 *
 * Tệp này canh:
 *   · nhận đơn ẩn danh: không lưu mã máy, không bao giờ bị chặn ngầm theo máy/mạng
 *   · đánh rác đơn ẩn danh (review, mark-spam): không tạo dòng khoá nào, không
 *     vào nhánh khoá IP, phản hồi không nói "đã khoá"
 *   · mọi thứ cán bộ đọc được y hệt dù hai tố giác ẩn danh cùng hay khác máy
 *   · tệp dọn dữ liệu cũ database/nang_cap_v22.sql và lượt tự dọn làm cùng việc
 *   · không hồi quy: khoá loại có tên, giới hạn theo IP của đơn ẩn danh
 *
 * Mỗi test ghi mã biến thể N-1…N-15 trong buglogs/quyet-dinh/SEC-DEC-008.md.
 *
 * Câu SQL của route và của tệp dọn chạy NGUYÊN VĂN trên node:sqlite, qua HTTP
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
const chanSpam = await import('../src/lib/chan-spam.js');
const { donDauNoi } = await import('../src/lib/vong-doi-dau-noi.js');
const { default: adminRouter } = await import('../src/routes/admin/index.js');
const { default: submissionsRouter } = await import('../src/routes/submissions.js');
const { default: khieuNaiRouter } = await import('../src/routes/khieu-nai.js');
const { default: trackingRouter } = await import('../src/routes/tracking.js');

const sqlite = await import('node:sqlite').catch(() => null);
const BO_QUA = sqlite ? false : 'cần node:sqlite (Node ≥ 22) để chạy câu SQL thật';

const HANDLER = { id: 4, username: 'cb4',  role: 'handler', full_name: 'Cán bộ xử lý' };
const MGR     = { id: 2, username: 'mgr2', role: 'manager', full_name: 'Lãnh đạo' };
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
const lanhDao  = (m, d, b) => goi('/api/admin', adminRouter, MGR, m, d, b);
const congKhai = (m, d, b) => goi('/api/submissions', submissionsRouter, null, m, d, b);
const khieuNai = (m, d, b) => goi('/api/khieu-nai', khieuNaiRouter, null, m, d, b);
const traCuu   = (code) => goi('/api/tracking', trackingRouter, null, 'GET', `/${code}`);

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
/* So hai kịch bản                                                           */
/* ------------------------------------------------------------------------ */

const LA_GIO = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}/;
const TRUONG_DEM_LUI = new Set(['con_lai_phut', 'days_left', 'daysLeft']);
/* Mã tra cứu và PIN sinh ngẫu nhiên mỗi lần gửi — không phụ thuộc máy */
const TRUONG_NGAU_NHIEN = /tracking|trackingcode|chatpin|ma_tra_cuu/i;
function chuanHoa(anh) {
  const nhan = new Map();
  const di = (v, k) => {
    if (k && TRUONG_NGAU_NHIEN.test(k) && typeof v === 'string') return '<MA>';
    if (Array.isArray(v)) return v.map((x) => di(x));
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([kk, vv]) => [kk, di(vv, kk)]));
    if (TRUONG_DEM_LUI.has(k)) return typeof v === 'number' ? Math.round(v / 60) : v;
    if (typeof v === 'string' && LA_GIO.test(v)) {
      if (!nhan.has(v)) nhan.set(v, `GIO_${nhan.size}`);
      return nhan.get(v);
    }
    return v;
  };
  return di(anh);
}

/** Mọi thứ cán bộ đọc được về hai tố giác (N-4) */
async function chupManHinh(ghiChu, ids) {
  const man = {
    hangCho:     canBo('GET', '/submissions?status=pending_review&sort=moi_nhat'),
    danhSach:    canBo('GET', '/submissions?sort=moi_nhat'),
    nghiRac:     canBo('GET', '/submissions?nghiRac=1&sort=moi_nhat'),
    thungRac:    canBo('GET', '/trash'),
    danhSachKhoa: canBo('GET', '/chat/blacklist'),
    khieuNai:    canBo('GET', '/chat/khieu-nai?tatCa=1'),
    nhomSuKien:  canBo('GET', '/incident-groups'),
    nhatKy:      lanhDao('GET', '/logs'),
  };
  for (const id of ids) man[`chiTiet_${id}`] = lanhDao('GET', `/submissions/${id}`);
  const ket = { ghiChu };
  for (const [ten, p] of Object.entries(man)) {
    const r = await p;
    assert.equal(r.status, 200, `${ghiChu} — ${ten}: ${r.status} ${r.text.slice(0, 200)}`);
    ket[ten] = r.body;
  }
  return ket;
}

async function soHaiKichBan(kichBan) {
  const ket = {};
  /* Route tính deadline_at bằng Date.now() THẬT: hạn của hai đơn khi trùng giây,
     khi không, tuỳ lúc chạy — nhãn GIO_n lệch giữa hai kịch bản, test đỏ chập
     chờn mà không do máy (ND-037). Ghim Date.now theo đồng hồ ảo thay vì bỏ
     deadline_at khỏi phép so: hạn mà phụ thuộc máy thì vẫn phải bắt được. Giữ
     nguyên độ lệch một ngày của GOC_DONG_HO để thời gian chờ không 429 oan. */
  const dateNowThat = Date.now;
  Date.now = () => dongHo + 24 * 3600_000;
  try {
    for (const [ten, mayDau] of [['cung_may', MAY_HOA], ['khac_may', MAY_KHAC]]) {
      dungCsdl();
      ket[ten] = chuanHoa(await kichBan(mayDau));
    }
  } finally {
    Date.now = dateNowThat;
  }
  assert.equal(ket.cung_may.length, ket.khac_may.length);
  for (let i = 0; i < ket.cung_may.length; i++) {
    assert.deepEqual(ket.cung_may[i], ket.khac_may[i],
      `Bước "${ket.cung_may[i]?.ghiChu}": cán bộ phân biệt được hai tố giác ẩn danh CÙNG máy hay KHÁC máy — nối được hai tố giác của một người`);
  }
}

/* ======================================================================== */
/* N-1 — nhận đơn                                                            */
/* ======================================================================== */

test('N-1 — POST đơn ẩn danh CÓ gửi deviceId: CSDL không lưu mã máy', { skip: BO_QUA }, async () => {
  dungCsdl();
  const don = await guiDon(donAnDanh(TO_GIAC_1, MAY_HOA));
  assert.equal(don.device_id, null, 'đơn ẩn danh mang mã máy — người cầm CSDL nối được nó với đơn có tên cùng máy');
  assert.equal(don.status, 'pending_review');
});

test('N-1 — không hồi quy: đơn có tên vẫn lưu mã máy (khoá loại có tên cần nó)', { skip: BO_QUA }, async () => {
  dungCsdl();
  const don = await guiDon(DON_CO_TEN);
  assert.equal(don.device_id, MAY_HOA);
});

test('N-1 — cả hai điểm vào nhận đơn công khai (index.js, may-chu-cong-khai.js) dùng chung routes/submissions.js', async () => {
  for (const tep of ['index.js', 'may-chu-cong-khai.js']) {
    const ma = await readFile(new URL(`../src/${tep}`, import.meta.url), 'utf8');
    const nen = await readFile(new URL('../src/nen-tang.js', import.meta.url), 'utf8').catch(() => '');
    assert.ok(/routes\/submissions\.js/.test(ma) || (/nen-tang\.js/.test(ma) && /routes\/submissions\.js/.test(nen)),
      `${tep} không nạp routes/submissions.js — có một lối nhận đơn khác chưa được kiểm`);
  }
});

/* ======================================================================== */
/* N-2 — đánh rác đơn ẩn danh không tạo dòng khoá nào                         */
/* ======================================================================== */

for (const [duong, lam] of [
  ['review', (id) => canBo('POST', `/submissions/${id}/review`, { action: 'spam' })],
  ['mark-spam', (id) => canBo('POST', `/submissions/${id}/mark-spam`, { reason: 'bịa đặt' })],
]) {
  test(`N-2 — ${duong} đơn ẩn danh (dữ liệu cũ còn mã máy): vào thùng rác, KHÔNG có dòng khoá nào, không tái phạm`, { skip: BO_QUA }, async () => {
    dungCsdl();
    themDon(1, { an: 1 });
    const r = await lam(1);
    assert.equal(r.status, 200, r.text);
    assert.notEqual(r.body?.taiPham, true);
    assert.deepEqual(dongKhoa(), [], 'đánh rác một tố giác ẩn danh tạo dòng khoá theo máy/mạng');
    const d = db.prepare('SELECT status, deleted_at FROM submissions WHERE id = 1').get();
    assert.equal(d.status, 'spam');
    assert.ok(d.deleted_at, 'đơn phải vào thùng rác');
  });

  test(`N-2 — ${duong} ba tố giác ẩn danh cùng máy (dữ liệu cũ): không dòng khoá nào, không khoá 30 ngày`, { skip: BO_QUA }, async () => {
    dungCsdl();
    for (const id of [1, 2, 3]) themDon(id, { an: 1, tao: luc(300 - id * 60) });
    for (const id of [1, 2, 3]) {
      const r = await lam(id);
      assert.equal(r.status, 200, r.text);
      assert.notEqual(r.body?.taiPham, true);
    }
    assert.deepEqual(dongKhoa(), []);
  });
}

/* ======================================================================== */
/* N-3 — kịch bản chị Hoa                                                     */
/* ======================================================================== */

for (const [duong, lam] of [
  ['review', (id) => canBo('POST', `/submissions/${id}/review`, { action: 'spam' })],
  ['mark-spam', (id) => canBo('POST', `/submissions/${id}/mark-spam`, { reason: 'bịa đặt' })],
]) {
  test(`N-3 — chị Hoa (${duong}): tố giác đầu bị rác, tố giác thứ hai đúng máy đúng IP vào hàng chờ, không có ở nghi rác`, { skip: BO_QUA }, async () => {
    dungCsdl();
    const dau = await guiDon(donAnDanh(TO_GIAC_1, MAY_HOA));
    assert.equal((await lam(dau.id)).status, 200);
    quaThoiGianCho();
    const sau = await guiDon(donAnDanh(TO_GIAC_2, MAY_HOA));
    assert.equal(sau.is_spam, 0, 'tố giác thứ hai bị chặn ngầm vì máy bị khoá qua tố giác đầu');
    assert.equal(sau.status, 'pending_review');
    const nr = await canBo('GET', '/submissions?nghiRac=1&sort=moi_nhat');
    assert.equal(nr.status, 200, nr.text.slice(0, 200));
    assert.ok(!(nr.body?.data || []).some((x) => x.id === sau.id), 'tố giác thứ hai nằm trong danh sách nghi rác');
  });
}

test('N-3 — dữ liệu cũ: tố giác cũ còn mã máy bị rác, tố giác mới gửi từ đúng máy đó không bị chặn ngầm', { skip: BO_QUA }, async () => {
  dungCsdl();
  themDon(1, { an: 1, may: MAY_HOA, ip: null });
  assert.equal((await canBo('POST', '/submissions/1/review', { action: 'spam' })).status, 200);
  const sau = await guiDon(donAnDanh(TO_GIAC_2, MAY_HOA));
  assert.equal(sau.is_spam, 0);
  assert.equal(sau.status, 'pending_review');
});

test('N-3 — phòng thủ hai lớp: dòng khoá loại ẩn danh còn sót trong CSDL (thiết bị lẫn IP) không chặn ngầm tố giác nào', { skip: BO_QUA }, async () => {
  dungCsdl();
  db.exec(`INSERT INTO blacklists (identifier, kind, loai_don, reason, expires_at) VALUES
           ('${MAY_HOA}', 'device', 'an_danh', 'x', datetime(NOW(), '+1 days'))`);
  const ipBam = (await import('../src/lib/crypto.js')).hashIdentifier(IP_THO).slice(0, 32);
  db.exec(`INSERT INTO blacklists (identifier, kind, loai_don, reason, expires_at) VALUES
           ('${IP_THO}', 'ip', 'an_danh', 'x', datetime(NOW(), '+1 days')),
           ('${ipBam}', 'ip', 'an_danh', 'x', datetime(NOW(), '+1 days'))`);
  const sau = await guiDon(donAnDanh(TO_GIAC_2, MAY_HOA));
  assert.equal(sau.is_spam, 0);
  assert.equal(sau.status, 'pending_review');
});

/* ======================================================================== */
/* N-4 — so hai kịch bản trên mọi thứ cán bộ đọc được                         */
/* ======================================================================== */

for (const [duong, lam] of [
  ['review', (id) => canBo('POST', `/submissions/${id}/review`, { action: 'spam' })],
  ['mark-spam', (id) => canBo('POST', `/submissions/${id}/mark-spam`, { reason: 'bịa đặt' })],
]) {
  test(`N-4 (${duong}) — tố giác thứ hai CÙNG hay KHÁC máy tố giác bị rác: hàng chờ, nghi rác, thùng rác, danh sách khoá, chi tiết, nhóm sự kiện, khiếu nại, nhật ký, phản hồi y hệt`, { skip: BO_QUA }, async () => {
    await soHaiKichBan(async (mayDau) => {
      const buoc = [];
      const dau = await guiDon(donAnDanh(TO_GIAC_1, mayDau));
      const rac = await lam(dau.id);
      assert.equal(rac.status, 200, rac.text);
      buoc.push({ ghiChu: 'phản hồi cú đánh rác', phanHoi: rac.body });
      quaThoiGianCho();
      const sau = await guiDon(donAnDanh(TO_GIAC_2, MAY_HOA));
      buoc.push({ ghiChu: 'phản hồi cho người gửi tố giác thứ hai', phanHoi: sau.phanHoi.body });
      buoc.push(await chupManHinh('sau khi tố giác thứ hai tới', [dau.id, sau.id]));
      /* Cán bộ đánh rác luôn tố giác thứ hai: phản hồi cũng không được khác */
      const rac2 = await lam(sau.id);
      buoc.push({ ghiChu: 'phản hồi cú đánh rác thứ hai', status: rac2.status, phanHoi: rac2.body });
      buoc.push(await chupManHinh('sau cú đánh rác thứ hai', [dau.id, sau.id]));
      return buoc;
    });
  });
}

/* ======================================================================== */
/* N-5 — is_anonymous NULL                                                    */
/* ======================================================================== */

test('N-5 — đơn is_anonymous NULL bị đánh rác: xử như ẩn danh — không dòng khoá nào, không chặn loại nào', { skip: BO_QUA }, async () => {
  dungCsdl();
  themDon(1, { an: null, status: 'processing' });
  const r = await canBo('POST', '/submissions/1/mark-spam', { reason: 'x' });
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(dongKhoa(), [], 'đơn không rõ loại gây khoá theo máy');
  const nhan = (anDanh) => chanSpam.xetTruocKhiNhan(pool, { body: { deviceId: MAY_HOA, isAnonymous: anDanh }, ip: IP_THO });
  assert.equal((await nhan(false)).chanNgam, false);
  assert.equal((await nhan(true)).chanNgam, false);
});

/* ======================================================================== */
/* N-6, N-7 — không nhánh khoá IP nào cho đơn ẩn danh                          */
/* ======================================================================== */

for (const khoaIp of [true, false]) {
  test(`N-6 — mark-spam đơn ẩn danh không mã máy (khoaIp=${khoaIp}): không dòng khoá IP, phản hồi không nói "đã khoá"`, { skip: BO_QUA }, async () => {
    dungCsdl();
    themDon(1, { an: 1, may: null, ip: 'ip-da-bam-cua-hoa' });
    const r = await canBo('POST', '/submissions/1/mark-spam', { reason: 'x', khoaIp });
    assert.equal(r.status, 200, r.text);
    assert.deepEqual(dongKhoa(), [], 'đánh rác tố giác ẩn danh khoá địa chỉ mạng của người gửi');
    assert.equal(r.body.daKhoaThietBi, false);
    assert.equal(r.body.kieuKhoa, '');
    assert.doesNotMatch(r.body.ghiChu, /và khoá|khoá theo địa chỉ|khoá thiết bị này|khoá 30 ngày/i);
    /* Nói đúng sự thật: không phải "không có mã máy lẫn địa chỉ mạng" — đơn này CÓ IP */
    assert.doesNotMatch(r.body.ghiChu, /không có mã thiết bị lẫn địa chỉ mạng/i);
  });
}

/* Sau BUG-016 (SEC-DEC-008 G1) không còn hộp hỏi "khoá địa chỉ mạng?" cho loại
   đơn nào — đổi từ "hộp hỏi không hiện cho đơn ẩn danh" (Loc duyệt, P42) */
test('N-6 — giao diện: không còn hộp hỏi "khoá địa chỉ mạng?"; lời nhắc đơn ẩn danh nói không khoá máy hay mạng', async () => {
  const trang = await readFile(new URL('../../src/pages/admin/AdminSubmissionDetailPage.tsx', import.meta.url), 'utf8');
  assert.equal(trang.indexOf('khoaIp'), -1, 'còn hộp hỏi / cờ khoá địa chỉ mạng');
  const i = trang.indexOf("'Đánh dấu TIN RÁC. Tố giác ẩn danh không khoá máy hay mạng của người gửi");
  assert.ok(i > -1, 'lời nhắc khi đánh rác đơn ẩn danh không còn nói "không khoá máy hay mạng"');
  /* Suy ra "ẩn danh" đúng quy ước laDonAnDanh: NULL là ẩn danh, và MySQL trả
     TINYINT dạng số — so `!== false` thì đơn có tên (0) cũng thành ẩn danh */
  const dinhNghia = trang.slice(0, i).match(/const anDanh\s*=\s*([^;]+);/)?.[1] || '';
  assert.match(dinhNghia, /is_anonymous\s*==\s*null/, `anDanh không coi NULL là ẩn danh: ${dinhNghia}`);
  assert.match(dinhNghia, /Number\(\s*data\??\.is_anonymous\s*\)\s*!==\s*0/, `anDanh không so theo số: ${dinhNghia}`);
});

/* Đổi ở P42 (Loc duyệt): không gọi xetKhoaIp nữa — hàm đã gỡ cùng BUG-016. Đi
   qua route nhận đơn thật: đơn ẩn danh thứ tư cùng IP tới sau 3 đơn chặn ngầm */
test('N-7 — 3 tố giác ẩn danh chặn ngầm từ 3 máy cùng IP, tố giác thứ tư tới qua route: không dòng khoá nào, không bị chặn ngầm', { skip: BO_QUA }, async () => {
  dungCsdl();
  assert.equal(chanSpam.xetKhoaIp, undefined, 'luật khoá IP tự động vẫn còn trong thư viện');
  const may = ['a1b2c3d4-0000-4000-8000-000000000001', 'a1b2c3d4-0000-4000-8000-000000000002', 'a1b2c3d4-0000-4000-8000-000000000003'];
  may.forEach((m, i) => themDon(30 + i, { an: 1, may: m, ip: IP_THO, status: 'spam', spam: 1, tao: luc(20) }));
  const don = await guiDon(donAnDanh(TO_GIAC_1, MAY_KHAC));
  assert.equal(don.is_spam, 0, 'tố giác ẩn danh bị chặn ngầm theo mạng');
  await new Promise((r) => setTimeout(r, 50));
  assert.deepEqual(dongKhoa(), [], 'khoá mạng vì tố giác ẩn danh');
});

/* ======================================================================== */
/* N-14 — thư viện: không hàm nào tác động lên máy vì đơn ẩn danh              */
/* ======================================================================== */

test('N-14 — mọi hàm khoá/đếm trong lib/chan-spam.js với anDanh = true: không ghi dòng khoá nào, không chặn', { skip: BO_QUA }, async () => {
  dungCsdl();
  for (const id of [1, 2, 3]) themDon(id, { an: 1, status: 'spam', tao: luc(100 - id) });
  assert.equal(await chanSpam.khoaThietBi(pool, { deviceId: MAY_HOA, staffId: 4, lyDo: 'x', anDanh: true }), false);
  assert.equal((await chanSpam.xetKhoaTaiPham(pool, { deviceId: MAY_HOA, staffId: 4, anDanh: true })).taiPham, false);
  /* Dòng khoaIpThuCong bỏ ở P42 (Loc duyệt): hàm đã gỡ cùng BUG-016 */
  assert.deepEqual(dongKhoa(), []);
  db.exec(`INSERT INTO blacklists (identifier, kind, loai_don, reason, expires_at) VALUES
           ('${MAY_HOA}', 'device', 'an_danh', 'x', datetime(NOW(), '+1 days')),
           ('${IP_THO}', 'ip', 'an_danh', 'x', datetime(NOW(), '+1 days'))`);
  assert.equal((await chanSpam.kiemTraBiKhoa(pool, { deviceId: MAY_HOA, ip: IP_THO, anDanh: true })).biKhoa, false);
});

test('N-14 — nhận đơn ẩn danh không đọc mã máy: xetTruocKhiNhan trả mã rỗng', { skip: BO_QUA }, async () => {
  dungCsdl();
  const kq = await chanSpam.xetTruocKhiNhan(pool, { body: { deviceId: MAY_HOA, isAnonymous: true }, ip: IP_THO });
  assert.equal(kq.deviceId, '');
  assert.equal(kq.chanNgam, false);
});

test('N-14 — chỉ một câu INSERT ghi submissions.device_id, và nó chặn mã máy của đơn ẩn danh', async () => {
  const { readdir } = await import('node:fs/promises');
  const goc = new URL('../src/', import.meta.url);
  const tep = (await readdir(goc, { recursive: true })).filter((t) => t.endsWith('.js'));
  const ghi = [];
  for (const t of tep) {
    const ma = await readFile(new URL(t, goc), 'utf8');
    for (const m of ma.matchAll(/INSERT INTO submissions\s*\(([^)]*)\)/g)) {
      if (/\bdevice_id\b/.test(m[1])) ghi.push(t.replace(/\\/g, '/'));
    }
  }
  assert.deepEqual(ghi, ['routes/submissions.js'], `nơi ghi submissions.device_id: ${ghi.join(', ')}`);
  const route = await readFile(new URL('routes/submissions.js', goc), 'utf8');
  assert.match(route, /isAnonymous\s*\?\s*null\s*:\s*\(?\s*deviceId/, 'câu INSERT không chặn mã máy của đơn ẩn danh');
});

/* ======================================================================== */
/* N-8, N-9 — dọn dữ liệu cũ                                                  */
/* ======================================================================== */

/* Chạy tệp như người vận hành chạy trong HeidiSQL. Chỉ lấy câu UPDATE/DELETE —
   phần USE, SELECT kiểm, ghi chú là của MySQL. */
async function chayTep(ten) {
  const sql = await readFile(new URL(`../../database/${ten}`, import.meta.url), 'utf8');
  const cau = sql.replace(/--.*$/gm, '').split(';').map((c) => c.trim())
    .filter((c) => /^(UPDATE|DELETE)\b/i.test(c));
  assert.ok(cau.length > 0, `${ten} không có câu UPDATE/DELETE nào`);
  for (const c of cau) db.exec(sangSqlite(c));
}

/** Dữ liệu mã cũ để lại: tố giác ẩn danh (1 và NULL) mang mã máy, dòng khoá loại
 *  ẩn danh còn hạn và hết hạn (thiết bị lẫn IP), cạnh đơn có tên và khoá có tên. */
function dungDuLieuCu() {
  themDon(1, { an: 1, may: MAY_HOA, tao: luc(3 * 60) });
  themDon(2, { an: null, may: MAY_HOA, tao: luc(2 * 60) });
  themDon(3, { an: 0, may: MAY_HOA, tao: luc(60) });
  themDon(4, { an: 1, may: null, tao: luc(30) });
  /* Đơn ẩn danh đã bị chặn ngầm từ trước: is_spam giữ nguyên (chốt của BUG-015) */
  themDon(5, { an: 1, may: MAY_KHAC, status: 'spam', spam: 1, tao: luc(20) });
  db.exec(`INSERT INTO blacklists (identifier, kind, loai_don, reason, created_by, expires_at) VALUES
    ('${MAY_HOA}',  'device', 'an_danh', 'Tin rác — đánh dấu tại hàng chờ kiểm duyệt', 4, datetime(NOW(), '+1 days')),
    ('${MAY_KHAC}', 'device', 'an_danh', 'Tái phạm', 4, datetime(NOW(), '+29 days')),
    ('ip-cu',       'ip',     'an_danh', 'Tự động', NULL, datetime(NOW(), '+1 hours')),
    ('${MAY_HOA}',  'device', 'co_ten',  'Tin rác: bịa đặt', 4, datetime(NOW(), '+1 days')),
    ('${MAY_KHAC}', 'trusted_device', 'khong_ro', 'kiosk', 1, datetime(NOW(), '+100 years'))`);
  db.exec(`INSERT INTO blacklists (identifier, kind, loai_don, reason, created_by, expires_at, created_at) VALUES
    ('ma-het-han', 'device', 'an_danh', 'x', 4, datetime(NOW(), '-1 hours'), datetime(NOW(), '-25 hours'))`);
}
const anhDon = () => db.prepare('SELECT id, device_id, ip_address, is_spam, status, updated_at FROM submissions ORDER BY id')
  .all().map((r) => ({ ...r }));

for (const [ten, chay] of [
  ['database/nang_cap_v22.sql', () => chayTep('nang_cap_v22.sql')],
  ['lượt tự dọn (donDauNoi) — mã cũ còn ghi trong khoảng giữa lúc chạy tệp và lúc cập nhật mã', () => donDauNoi(pool)],
]) {
  test(`N-8 — ${ten}: mọi đơn ẩn danh (1 và NULL) mất mã máy, 0 dòng khoá loại ẩn danh; đơn có tên, khoá có tên, thiết bị tin cậy, is_spam, updated_at giữ nguyên`, { skip: BO_QUA }, async () => {
    dungCsdl();
    dungDuLieuCu();
    const truoc = anhDon();
    troiQua(7);
    await chay();
    const sau = anhDon();
    for (const d of sau) {
      const t = truoc.find((x) => x.id === d.id);
      assert.equal(d.updated_at, t.updated_at, `đơn ${d.id}: updated_at bị đóng giờ chạy dọn — dấu gom nhóm mới`);
      assert.equal(d.is_spam, t.is_spam, `đơn ${d.id}: is_spam bị đổi`);
      assert.equal(d.status, t.status);
      assert.equal(d.ip_address, t.ip_address, `đơn ${d.id}: IP đã băm bị đụng (việc của vòng đời 30 ngày)`);
    }
    assert.deepEqual(sau.map((d) => [d.id, d.device_id]), [[1, null], [2, null], [3, MAY_HOA], [4, null], [5, null]]);
    assert.deepEqual(dongKhoa(), [
      { identifier: MAY_HOA, kind: 'device', loai_don: 'co_ten' },
      { identifier: MAY_KHAC, kind: 'trusted_device', loai_don: 'khong_ro' },
    ]);
  });

  test(`N-8 — ${ten}: chạy lại lần hai không đổi gì`, { skip: BO_QUA }, async () => {
    dungCsdl();
    dungDuLieuCu();
    await chay();
    const lan1 = [anhDon(), dongKhoa()];
    troiQua(7);
    await chay();
    assert.deepEqual([anhDon(), dongKhoa()], lan1);
  });

  test(`N-9 — ${ten}: không còn cặp đơn ẩn danh ↔ đơn có tên nào nối được qua mã máy`, { skip: BO_QUA }, async () => {
    dungCsdl();
    dungDuLieuCu();
    await chay();
    const cap = db.prepare(`SELECT COUNT(*) AS n FROM submissions a JOIN submissions b
        ON a.device_id = b.device_id AND a.id <> b.id
       WHERE COALESCE(a.is_anonymous, 1) <> 0`).get().n;
    assert.equal(cap, 0);
  });
}

/* ======================================================================== */
/* N-10, N-11 — không hồi quy                                                 */
/* ======================================================================== */

test('N-10 — không hồi quy: khoá loại có tên vẫn chặn ngầm đơn có tên tiếp theo; rác tố giác ẩn danh không chặn đơn có tên', { skip: BO_QUA }, async () => {
  dungCsdl();
  themDon(1, { an: 1 });
  await canBo('POST', '/submissions/1/review', { action: 'spam' });
  const coTen1 = await guiDon(DON_CO_TEN);
  assert.equal(coTen1.is_spam, 0, 'rác tố giác ẩn danh chặn ngầm đơn có tên cùng máy');
  assert.equal((await canBo('POST', `/submissions/${coTen1.id}/mark-spam`, { reason: 'x' })).status, 200);
  assert.equal(dongKhoa().filter((k) => k.loai_don === 'co_ten').length, 1, 'đánh rác đơn có tên phải khoá máy loại có tên');
  troiQua(5);
  const coTen2 = await guiDon({ ...DON_CO_TEN, content: 'Cống thoát nước đầu thôn Đông bị tắc, mưa xuống là ngập cả đoạn đường vào trường tiểu học.' });
  assert.equal(coTen2.is_spam, 1, 'khoá loại có tên không còn chặn đơn có tên');
});

test('N-11 — không hồi quy: đơn ẩn danh thứ hai cùng IP gửi ngay vẫn bị chặn thời gian chờ (429)', { skip: BO_QUA }, async () => {
  dungCsdl();
  /* Thời gian chờ route tính bằng Date.now() THẬT trừ created_at — đưa đồng hồ
     ảo về giờ thật cho riêng ca này. Giả lập trả giờ dạng chuỗi UTC không múi
     giờ, route đọc nó bằng new Date() theo giờ địa phương (mysql2 trả Date nên
     không lệch) — bù độ lệch múi giờ để chuỗi đọc ra đúng lúc này. */
  dongHo = Date.now() - new Date().getTimezoneOffset() * 60_000;
  await guiDon(donAnDanh(TO_GIAC_1, MAY_HOA));
  const ngay = await congKhai('POST', '/', donAnDanh(TO_GIAC_2, MAY_KHAC));
  assert.equal(ngay.status, 429, 'gửi ẩn danh thứ hai ngay lập tức phải bị chặn thời gian chờ');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM submissions').get().n, 1);
});

test('N-11 — không hồi quy: đơn ẩn danh thứ ba trong ngày cùng IP bị chặn (429), dù đổi mã máy', { skip: BO_QUA }, async () => {
  dungCsdl();
  await guiDon(donAnDanh(TO_GIAC_1, MAY_HOA));
  quaThoiGianCho();
  await guiDon(donAnDanh(TO_GIAC_2, MAY_KHAC));
  quaThoiGianCho();
  const baDon = await congKhai('POST', '/', donAnDanh('Ở bãi đất trống sau chợ Đông có nhóm thanh niên tụ tập mua bán chất cấm vào khoảng 23 giờ hằng đêm, đi xe không biển.', MAY_HOA));
  assert.equal(baDon.status, 429, 'đơn ẩn danh thứ ba trong ngày cùng IP phải bị chặn');
});

/* ======================================================================== */
/* N-12, N-13, N-15                                                          */
/* ======================================================================== */

test('N-12 — máy chỉ gửi tố giác ẩn danh bị rác: khiếu nại không thấy khoá, không nhận khiếu nại', { skip: BO_QUA }, async () => {
  dungCsdl();
  const dau = await guiDon(donAnDanh(TO_GIAC_1, MAY_HOA));
  await canBo('POST', `/submissions/${dau.id}/review`, { action: 'spam' });
  const tt = await khieuNai('GET', `/trang-thai?deviceId=${MAY_HOA}`);
  assert.equal(tt.body?.biKhoa, false);
  const r = await khieuNai('POST', '/', { deviceId: MAY_HOA, noiDung: 'Tôi là Phạm Văn Phúc, xin mở khoá máy' });
  assert.notEqual(r.status, 201);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM unlock_appeals').get().n, 0);
});

test('N-13 — tra cứu mã của tố giác ẩn danh gửi sau khi tố giác trước cùng máy bị rác: không bao giờ ra "spam"', { skip: BO_QUA }, async () => {
  dungCsdl();
  const dau = await guiDon(donAnDanh(TO_GIAC_1, MAY_HOA));
  await canBo('POST', `/submissions/${dau.id}/mark-spam`, { reason: 'x' });
  quaThoiGianCho();
  const sau = await guiDon(donAnDanh(TO_GIAC_2, MAY_HOA));
  const tc = await traCuu(sau.tracking_code);
  assert.equal(tc.status, 200, tc.text.slice(0, 200));
  assert.doesNotMatch(tc.text, /"spam"/);
  assert.equal(sau.status, 'pending_review');
});

test('N-15 — danh sách khoá sau khi rác cả tố giác ẩn danh lẫn đơn có tên cùng máy: chỉ còn dòng loại có tên', { skip: BO_QUA }, async () => {
  dungCsdl();
  themDon(1, { an: 1 });
  themDon(2, { an: 0 });
  await canBo('POST', '/submissions/1/review', { action: 'spam' });
  await canBo('POST', '/submissions/2/mark-spam', { reason: 'x' });
  assert.deepEqual(dongKhoa(), [{ identifier: MAY_HOA, kind: 'device', loai_don: 'co_ten' }]);
  const ds = await canBo('GET', '/chat/blacklist');
  assert.equal(ds.status, 200);
  assert.equal((ds.body?.data ?? ds.body).length, 1);
  assert.equal(soDongKhoa(), 1);
});
