/**
 * BUG-014 vòng 3 — VÒNG ĐỜI CỦA DẤU NỐI (SEC-DEC-008, phần M-F, phiên FIX #1).
 *
 * Mã máy (device_id) và IP đã băm (ip_address) là hai dấu cho biết "hai đơn từ
 * cùng một máy / một mạng". Chúng chỉ cần cho chống spam trong 30 ngày (mọi cửa
 * sổ trong mã đều ≤ 30 ngày); giữ lâu hơn chỉ có lợi cho người đọc trộm CSDL.
 * Tệp này canh:
 *
 *   A. Tệp dọn dữ liệu cũ database/nang_cap_v21.sql:
 *      - xoá dòng khoá cũ 'khong_ro' (R1 của RETEST P30) — nhưng KHÔNG xoá thiết
 *        bị tin cậy, vốn cũng mang 'khong_ro' từ nang_cap_v19.sql
 *      - NULL device_id của đơn đã xoá danh tính
 *      - NULL device_id, ip_address của đơn quá 30 ngày
 *      - không đóng dấu giờ chạy lên updated_at, chạy lại lần hai không đổi gì
 *   B. Xoá danh tính (cả hai đường: người dân tự yêu cầu, và tự xoá khi hồ sơ
 *      đóng) xoá luôn mã máy.
 *   C. Tự dọn dấu nối quá 30 ngày KHÔNG phụ thuộc có ai mở trang nào, ở cả ba
 *      điểm vào máy chủ.
 *   D. Hàm đọc hai cột chịu được NULL: không mã máy lẫn IP thì không khoá gì,
 *      không báo "đã khoá", không tạo dòng khoá mang định danh rỗng.
 *
 * Mã biến thể: buglogs/bugs/BUG-014.md (Phần 3 — R1) và SEC-DEC-008 mục "Bổ sung
 * cho BUG-014 vòng 3".
 *
 * Câu SQL của route và của tệp dọn chạy NGUYÊN VĂN trên node:sqlite; updated_at
 * giả lập ngữ nghĩa MySQL ON UPDATE CURRENT_TIMESTAMP bằng trigger (bài học P29
 * N1). Node < 22 -> BỎ QUA (hiện rõ trong output).
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
const { default: trackingRouter } = await import('../src/routes/tracking.js');

/* Mô-đun tự dọn — nạp mềm để các ca khác trong tệp vẫn chạy khi nó chưa có */
const vongDoi = await import('../src/lib/vong-doi-dau-noi.js').catch(() => null);

const sqlite = await import('node:sqlite').catch(() => null);
const BO_QUA = sqlite ? false : 'cần node:sqlite (Node ≥ 22) để chạy câu SQL thật';

const ADMIN   = { id: 1, username: 'admin', role: 'admin',   full_name: 'Quản trị' };
const HANDLER = { id: 4, username: 'cb4',   role: 'handler', full_name: 'Cán bộ xử lý' };
const MAY_P   = '3f9c2a71-5b4e-4d8a-9c1f-7e2b6a0d4c95';
const MAY_Q   = 'b81d0e46-2c7a-4f93-8e05-19a4c6f2d7b3';
const MAY_KIOSK = '0c6e1f2a-9d3b-4a57-8e21-5f4b7c9a0d13';
const IP_P    = 'ip-da-bam-cua-p';

const NGAY = 24 * 60; // phút

/* ------------------------------------------------------------------------ */
/* CSDL thật trong bộ nhớ                                                    */
/* ------------------------------------------------------------------------ */

let db;
/* Đồng hồ ảo: mọi NOW() đọc mốc này, hai kịch bản có mốc giờ giống hệt nhau */
const GOC_DONG_HO = Date.parse('2026-09-26T08:00:00Z');
let dongHo = GOC_DONG_HO;
const norm = (v) => (v instanceof Date ? v.toISOString().slice(0, 19).replace('T', ' ')
  : typeof v === 'boolean' ? Number(v) : v === undefined ? null : v);

/* Dịch đúng các cú pháp MySQL mà route và tệp dọn dùng — không dịch gì khác.
   Câu nào còn cú pháp lạ thì SQLite ném lỗi, test đỏ. */
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
    `CREATE TABLE staff (id INT PRIMARY KEY, full_name TEXT, is_active INT DEFAULT 1)`,
    `CREATE TABLE wards (id INT PRIMARY KEY, name TEXT)`,
    `CREATE TABLE report_messages (submission_id INT, sender_type TEXT, read_by_staff INT)`,
    `CREATE TABLE submissions (
       id INTEGER PRIMARY KEY, tracking_code TEXT, original_content TEXT, ai_processed_content TEXT,
       category_id INT, ai_suggested_category_id INT, status TEXT, urgency TEXT, security_level TEXT DEFAULT 'thuong',
       is_anonymous INT, is_flagged INT DEFAULT 0, flag_reason TEXT, is_verified_otp INT,
       sender_name TEXT, sender_phone TEXT, sender_phone_hash TEXT, sender_email TEXT,
       ip_address TEXT, user_agent TEXT, content_hash TEXT,
       created_at TEXT, updated_at TEXT, deadline_at TEXT, resolved_at TEXT,
       assigned_to INT, resolved_by INT, reviewed_by INT, reviewed_at TEXT,
       rejection_reason TEXT, resolution_note TEXT, ward_id INT, chat_pin_hash TEXT,
       incident_lat REAL, incident_lng REAL,
       identity_erased INT DEFAULT 0, identity_erased_at TEXT, deleted_at TEXT, deleted_by INT,
       incident_group_id INT, device_id TEXT, is_spam INT DEFAULT 0)`,
    `CREATE TABLE submission_images (submission_id INT, image_url TEXT, mime_type TEXT, moderation_status TEXT)`,
    `CREATE TABLE status_history (submission_id INT, old_status TEXT, new_status TEXT, note TEXT,
       changed_at TEXT DEFAULT (NOW()), changed_by INT)`,
    `CREATE TABLE staff_activity_logs (staff_id INT, action TEXT, target_type TEXT, target_id TEXT, details TEXT, ip_address TEXT)`,
    `CREATE TABLE activity_logs (id INTEGER PRIMARY KEY, staff_id INT, hanh_dong TEXT, loai_doi_tuong TEXT,
       doi_tuong_id TEXT, chi_tiet TEXT, ip_address TEXT, user_agent TEXT, created_at TEXT DEFAULT (NOW()))`,
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
    /* database/nang_cap_v8.sql */
    `CREATE TABLE data_deletion_requests (
       id INTEGER PRIMARY KEY, submission_id INT, tracking_code TEXT, status TEXT DEFAULT 'pending',
       requested_at TEXT DEFAULT (NOW()), handled_at TEXT, handled_by INT, reason TEXT, requester_ip TEXT)`,
    `INSERT INTO categories VALUES (1, 'to_giac', 'Tố giác', 15), (3, 'phan_anh', 'Phản ánh', 15)`,
    `INSERT INTO staff (id, full_name) VALUES (1, 'Quản trị'), (2, 'Lãnh đạo'), (4, 'Cán bộ xử lý')`,
    /* updated_at trên MySQL là ON UPDATE CURRENT_TIMESTAMP: sửa bất kỳ cột nào thì
       tự đóng giờ, TRỪ KHI câu UPDATE gán updated_at tường minh. Trigger BEFORE
       ... OF updated_at chỉ chạy khi updated_at nằm trong SET. */
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
    /* Thủ tục update_submission_status (TRON_BO_DATABASE_V5.sql) — chỉ phần
       đụng tới submissions và status_history */
    if (/^\s*CALL\s+update_submission_status/i.test(String(sql))) {
      const [id, trangThai, ghiChu, lyDo, canBo] = p;
      const cu = db.prepare('SELECT status FROM submissions WHERE id = ?').get(id)?.status ?? null;
      db.prepare(`UPDATE submissions SET status = ?, rejection_reason = COALESCE(?, rejection_reason),
          resolved_by = ?, resolved_at = NOW(), updated_at = NOW() WHERE id = ?`)
        .run(trangThai, lyDo, canBo, id);
      db.prepare(`INSERT INTO status_history (submission_id, old_status, new_status, note, changed_by)
          VALUES (?,?,?,?,?)`).run(id, cu, trangThai, ghiChu, canBo);
      return [[], []];
    }
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
const maTraCuu = (id) => `MA${String(id).padStart(4, '0')}`;

/** an: 1 ẩn danh · 0 có tên · tao: mốc tạo (mặc định 2 giờ trước) */
function themDon(id, { an = 0, may = MAY_P, ip = IP_P, status = 'processing', tao = luc(120), ...x } = {}) {
  db.prepare(`INSERT INTO submissions (id, tracking_code, original_content, category_id, status, urgency,
      is_anonymous, sender_name, sender_phone, created_at, updated_at, deadline_at, assigned_to,
      device_id, ip_address, is_spam, deleted_at, rejection_reason, identity_erased)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    id, maTraCuu(id), `Nội dung đơn ${id}`, an ? 1 : 3, status, 'normal',
    an, an || x.erased ? null : encrypt('Phạm Văn Phúc'), an || x.erased ? null : encrypt('0916284735'),
    tao, tao, '2026-12-01 00:00:00', x.assigned ?? null, may, ip,
    x.spam ?? 0, x.deletedAt ?? null, x.rejectionReason ?? null, x.erased ? 1 : 0);
}

const don = (id) => ({ ...db.prepare('SELECT * FROM submissions WHERE id = ?').get(id) });
const dauNoi = () => db.prepare('SELECT id, device_id, ip_address, updated_at FROM submissions ORDER BY id')
  .all().map((r) => ({ ...r }));
const cacDongKhoa = () => db.prepare('SELECT id, identifier, kind, loai_don, reason FROM blacklists ORDER BY id')
  .all().map((r) => ({ ...r }));

async function goi(duongGoc, router, staff, method, duong, body) {
  dongHo += 60_000;
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
const quanTri  = (m, d, b) => goi('/api/admin', adminRouter, ADMIN, m, d, b);
const nguoiDan = (m, d, b) => goi('/api/tracking', trackingRouter, null, m, d, b);

/* ------------------------------------------------------------------------ */
/* Tệp dọn dữ liệu                                                           */
/* ------------------------------------------------------------------------ */

/* Chạy tệp như người vận hành chạy trong HeidiSQL. Chỉ lấy câu UPDATE/DELETE —
   phần USE, SELECT kiểm, ghi chú là của MySQL. Câu phải chạy được sau khi dịch
   đúng các cú pháp ngày giờ ở sangSqlite. */
async function chayTep(ten) {
  const sql = await readFile(new URL(`../../database/${ten}`, import.meta.url), 'utf8');
  const cau = sql.replace(/--.*$/gm, '').split(';').map((c) => c.trim())
    .filter((c) => /^(UPDATE|DELETE)\b/i.test(c));
  assert.ok(cau.length > 0, `${ten} không có câu UPDATE/DELETE nào`);
  for (const c of cau) db.exec(sangSqlite(c));
  return cau;
}
const chayV20 = () => chayTep('nang_cap_v20.sql');
const chayV21 = () => chayTep('nang_cap_v21.sql');

/* Câu upsert NGUYÊN VĂN của khoaThietBi trước 69e8c00
   (git show 69e8c00^:server/src/lib/chan-spam.js): một dòng khoá mỗi máy, ghi đè
   reason/created_by/expires_at, GIỮ created_at. Sau nang_cap_v19 dòng đó mang
   loai_don = 'khong_ro' (giá trị mặc định của cột). */
const UPSERT_CU = `INSERT INTO blacklists (identifier, kind, reason, created_by, expires_at)
       VALUES (?, 'device', ?, ?, DATE_ADD(NOW(), INTERVAL ? HOUR))
       ON DUPLICATE KEY UPDATE
         reason     = VALUES(reason),
         created_by = VALUES(created_by),
         expires_at = DATE_ADD(NOW(), INTERVAL ? HOUR)`;
const khoaCu = (may, lyDo, staffId, gio = 24) => pool.query(UPSERT_CU, [may, lyDo, staffId, gio, gio]);

/* ------------------------------------------------------------------------ */
/* So hai kịch bản — cùng khung với khong-noi-qua-khoa-khieu-nai.test.js      */
/* ------------------------------------------------------------------------ */

const LA_GIO = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}/;
const TRUONG_DEM_LUI = new Set(['con_lai_phut', 'days_left', 'daysLeft']);
function chuanHoa(anh) {
  const nhan = new Map();
  const di = (v, k) => {
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

async function chupManHinh(ghiChu) {
  const [ds, kn, tr] = await Promise.all([
    canBo('GET', '/chat/blacklist'),
    canBo('GET', '/chat/khieu-nai?tatCa=1'),
    canBo('GET', '/trash'),
  ]);
  for (const r of [ds, kn, tr]) assert.equal(r.status, 200, `${ghiChu}: ${r.text.slice(0, 200)}`);
  return { ghiChu, danhSachKhoa: ds.body, khieuNai: kn.body, thungRac: tr.body.items ?? tr.body };
}

async function soHaiKichBan(kichBan) {
  const ket = {};
  for (const [ten, mayB] of [['cung_may', MAY_P], ['khac_may', MAY_Q]]) {
    dungCsdl();
    ket[ten] = chuanHoa(await kichBan(mayB));
  }
  for (let i = 0; i < ket.cung_may.length; i++) {
    assert.deepEqual(ket.cung_may[i], ket.khac_may[i],
      `Bước "${ket.cung_may[i]?.ghiChu}": cán bộ phân biệt được B CÙNG máy với P hay KHÁC máy — nối được tố giác ẩn danh với người ký tên`);
  }
  assert.equal(ket.cung_may.length, ket.khac_may.length);
}

/* ======================================================================== */
/* A. Tệp dọn dữ liệu nang_cap_v21.sql                                       */
/* ======================================================================== */

/* R1 (RETEST P30): máy P bị khoá vì đơn có tên A rồi vì tố giác ẩn danh B (hoặc
   ngược lại) bằng mã cũ -> MỘT dòng khoá 'khong_ro' mang created_at của đơn đầu
   và lý do/người khoá/hạn của đơn sau. v20 không dọn được dòng này. */
for (const [ten, thuTu] of [['có tên trước, ẩn danh sau', 'coten_truoc'], ['ẩn danh trước, có tên sau', 'andanh_truoc']]) {
  test(`A1 R1 (${ten}) — sau v20 + v21, danh sách khoá + khiếu nại + thùng rác y hệt dù tố giác ẩn danh B cùng hay khác máy P`, { skip: BO_QUA }, async () => {
    await soHaiKichBan(async (mayB) => {
      const buoc = async (anDanh) => {
        dongHo += 60 * 60_000;
        if (anDanh) {
          themDon(2, { an: 1, may: mayB, status: 'spam', spam: 1, deletedAt: luc(0) });
          await khoaCu(mayB, 'Tin rác — đánh dấu tại hàng chờ kiểm duyệt', 1);   // /review cũ
        } else {
          themDon(1, { an: 0, may: MAY_P, status: 'spam', spam: 1, deletedAt: luc(0), rejectionReason: 'bịa đặt' });
          await khoaCu(MAY_P, 'Tin rác — hồ sơ MA1: bịa đặt', 4);               // /mark-spam cũ
        }
      };
      if (thuTu === 'coten_truoc') { await buoc(false); await buoc(true); }
      else { await buoc(true); await buoc(false); }
      await chayV20();
      await chayV21();
      return [await chupManHinh('sau khi chạy v20 rồi v21')];
    });
  });
}

test('A1 R1 — đối chứng: kịch bản R1 dựng đúng, CHỈ chạy v20 thì cán bộ còn phân biệt được (không phải kiểm bản vá)', { skip: BO_QUA }, async () => {
  await assert.rejects(soHaiKichBan(async (mayB) => {
    dongHo += 60 * 60_000;
    themDon(1, { an: 0, may: MAY_P, status: 'spam', spam: 1, deletedAt: luc(0), rejectionReason: 'bịa đặt' });
    await khoaCu(MAY_P, 'Tin rác — hồ sơ MA1: bịa đặt', 4);
    dongHo += 60 * 60_000;
    themDon(2, { an: 1, may: mayB, status: 'spam', spam: 1, deletedAt: luc(0) });
    await khoaCu(mayB, 'Tin rác — đánh dấu tại hàng chờ kiểm duyệt', 1);
    await chayV20();
    return [await chupManHinh('chỉ chạy v20')];
  }), /phân biệt được/, 'dữ liệu dựng sai — không tái hiện được R1 thì ca A1 không kiểm gì');
});

test('A2 — v21 xoá mọi dòng khoá thiết bị/IP loại khong_ro (kể cả dòng tái phạm 30 ngày), GIỮ thiết bị tin cậy và dòng khoá có loại', { skip: BO_QUA }, async () => {
  dungCsdl();
  await khoaCu(MAY_P, 'Tin rác — hồ sơ MA1: bịa đặt', 4);
  await khoaCu(MAY_Q, 'Tái phạm: 3 lần tin rác liên tiếp trong 30 ngày', 4, 720);
  const them = db.prepare(`INSERT INTO blacklists (identifier, kind, loai_don, reason, created_by, expires_at)
    VALUES (?, ?, ?, ?, ?, ?)`);
  them.run(IP_P, 'ip', 'khong_ro', 'Tin rác (hồ sơ không có mã thiết bị)', 4, luc(-120));
  /* Thiết bị tin cậy: nang_cap_v19 cũng gắn 'khong_ro' — xoá nó là máy kiosk bị
     khoá oan ở cú "Tin rác" kế tiếp */
  them.run(MAY_KIOSK, 'trusted_device', 'khong_ro', 'Máy kiosk trụ sở', 1, '2099-01-01 00:00:00');
  them.run(MAY_P, 'device', 'co_ten', 'Tin rác', 4, luc(-600));
  them.run(MAY_Q, 'device', 'an_danh', 'Tin rác', 4, luc(-600));

  await chayV21();

  const con = cacDongKhoa();
  assert.deepEqual(con.filter((d) => d.loai_don === 'khong_ro' && ['device', 'ip'].includes(d.kind)), [],
    'còn dòng khoá khong_ro — R1 vẫn hở');
  assert.deepEqual(con.map((d) => [d.identifier, d.kind, d.loai_don]), [
    [MAY_KIOSK, 'trusted_device', 'khong_ro'],
    [MAY_P, 'device', 'co_ten'],
    [MAY_Q, 'device', 'an_danh'],
  ], 'v21 xoá nhầm dòng không phải khoá khong_ro');
});

test('A3 — v21: đơn quá 30 ngày mất device_id và ip_address; đơn trong 30 ngày giữ nguyên; updated_at của mọi đơn giữ nguyên', { skip: BO_QUA }, async () => {
  dungCsdl();
  themDon(1, { an: 0, tao: luc(45 * NGAY) });
  themDon(2, { an: 1, tao: luc(31 * NGAY), may: MAY_Q });
  themDon(3, { an: 0, tao: luc(30 * NGAY + 60), may: null });       // chỉ còn IP
  themDon(4, { an: 0, tao: luc(29 * NGAY) });
  themDon(5, { an: 1, tao: luc(2 * NGAY), may: MAY_Q });            // ẩn danh mới: phiên #3, KHÔNG phải phiên này
  const truoc = dauNoi();
  dongHo += NGAY * 60_000 / 24; // người vận hành chạy tệp một giờ sau

  await chayV21();

  const sau = dauNoi();
  for (const id of [1, 2, 3]) {
    const d = sau.find((r) => r.id === id);
    assert.equal(d.device_id, null, `đơn quá 30 ngày #${id} còn mã máy`);
    assert.equal(d.ip_address, null, `đơn quá 30 ngày #${id} còn IP đã băm`);
  }
  for (const id of [4, 5]) {
    assert.deepEqual(sau.find((r) => r.id === id), truoc.find((r) => r.id === id),
      `đơn trong 30 ngày #${id} bị đụng — phá chống spam, và #5 là việc của phiên #3`);
  }
  assert.deepEqual(sau.map((r) => [r.id, r.updated_at]), truoc.map((r) => [r.id, r.updated_at]),
    'tệp dọn đóng giờ chạy lên updated_at — cán bộ gom được nhóm đơn vừa bị dọn theo giờ trùng nhau');
});

test('A4 — v21: đơn đã xoá danh tính mất device_id dù còn mới; updated_at giữ nguyên', { skip: BO_QUA }, async () => {
  dungCsdl();
  themDon(1, { an: 0, tao: luc(3 * NGAY), erased: true, ip: null, status: 'resolved' });
  themDon(2, { an: 0, tao: luc(3 * NGAY), status: 'resolved' });
  const truoc = dauNoi();

  await chayV21();

  const sau = dauNoi();
  assert.equal(sau[0].device_id, null, 'đơn đã xoá danh tính còn mã máy — vẫn nối được với đơn khác cùng máy');
  assert.equal(sau[0].updated_at, truoc[0].updated_at, 'đóng giờ chạy lên đơn đã xoá danh tính');
  assert.deepEqual(sau[1], truoc[1], 'đơn chưa xoá danh tính, còn mới, bị đụng');
});

test('A5 — v21 chạy lại lần hai không đổi gì', { skip: BO_QUA }, async () => {
  dungCsdl();
  themDon(1, { an: 0, tao: luc(45 * NGAY) });
  themDon(2, { an: 0, tao: luc(3 * NGAY), erased: true, ip: null });
  themDon(3, { an: 0, tao: luc(3 * NGAY) });
  await khoaCu(MAY_P, 'Tin rác', 4);
  db.prepare(`INSERT INTO blacklists (identifier, kind, loai_don, reason, expires_at) VALUES (?, 'trusted_device', 'khong_ro', 'kiosk', '2099-01-01 00:00:00')`).run(MAY_KIOSK);
  await chayV21();
  const truoc = [dauNoi(), cacDongKhoa()];
  dongHo += 60 * 60_000;
  await chayV21();
  assert.deepEqual([dauNoi(), cacDongKhoa()], truoc);
});

/* ======================================================================== */
/* B. Xoá danh tính xoá luôn mã máy — cả hai đường                           */
/* ======================================================================== */

test('B1 — người dân yêu cầu xoá danh tính hồ sơ đã đóng (routes/tracking.js) -> device_id về NULL', { skip: BO_QUA }, async () => {
  dungCsdl();
  themDon(1, { an: 0, status: 'resolved' });
  const r = await nguoiDan('POST', `/${maTraCuu(1)}/request-deletion`);
  assert.equal(r.status, 200, r.text.slice(0, 200));
  assert.equal(r.body.status, 'done', 'dữ liệu dựng sai — phải là đường xoá ngay');
  const d = don(1);
  assert.equal(d.identity_erased, 1);
  assert.equal(d.device_id, null, 'xoá danh tính mà giữ mã máy — đơn "không còn danh tính" vẫn nối được với đơn khác cùng máy');
  assert.equal(d.ip_address, null);
});

test('B2 — hồ sơ đóng khi có yêu cầu xoá đang chờ (routes/admin/submissions.js) -> device_id về NULL', { skip: BO_QUA }, async () => {
  dungCsdl();
  themDon(1, { an: 0, status: 'processing' });
  db.prepare(`INSERT INTO data_deletion_requests (submission_id, tracking_code, status) VALUES (1, ?, 'pending')`)
    .run(maTraCuu(1));
  const r = await quanTri('PATCH', '/submissions/1/status', { status: 'resolved', note: 'xong' });
  assert.equal(r.status, 200, r.text.slice(0, 200));
  const d = don(1);
  assert.equal(d.identity_erased, 1, 'dữ liệu dựng sai — đường tự xoá khi đóng hồ sơ không chạy');
  assert.equal(d.device_id, null, 'tự xoá danh tính khi đóng hồ sơ mà giữ mã máy');
  assert.equal(d.ip_address, null);
});

test('B3 — đánh rác hồ sơ đã xoá danh tính: không tạo dòng khoá nào, không báo đã khoá', { skip: BO_QUA }, async () => {
  dungCsdl();
  themDon(1, { an: 0, status: 'resolved' });
  assert.equal((await nguoiDan('POST', `/${maTraCuu(1)}/request-deletion`)).body?.status, 'done');
  const r = await canBo('POST', '/submissions/1/mark-spam', { reason: 'bịa đặt' });
  assert.equal(r.status, 200, r.text.slice(0, 200));
  assert.deepEqual(cacDongKhoa(), [], 'hồ sơ đã xoá danh tính vẫn khoá được máy người gửi');
  assert.equal(r.body.daKhoaThietBi, false);
});

/* ======================================================================== */
/* C. Tự dọn dấu nối quá 30 ngày — không cần ai mở trang                     */
/* ======================================================================== */

test('C1 — xoaDauNoiQuaHan: đơn quá 30 ngày mất device_id/ip_address, đơn trong 30 ngày giữ nguyên, updated_at giữ nguyên', { skip: BO_QUA }, async () => {
  assert.ok(vongDoi, 'chưa có server/src/lib/vong-doi-dau-noi.js — không có cơ chế tự dọn dấu nối');
  dungCsdl();
  themDon(1, { an: 0, tao: luc(31 * NGAY) });
  themDon(2, { an: 1, tao: luc(40 * NGAY), may: MAY_Q, status: 'spam', spam: 1, deletedAt: luc(35 * NGAY) });
  themDon(3, { an: 0, tao: luc(29 * NGAY) });
  const truoc = dauNoi();
  const soDon = await vongDoi.xoaDauNoiQuaHan(pool);
  const sau = dauNoi();
  assert.equal(soDon, 2);
  for (const id of [1, 2]) {
    assert.equal(sau.find((r) => r.id === id).device_id, null, `#${id}`);
    assert.equal(sau.find((r) => r.id === id).ip_address, null, `#${id}`);
  }
  assert.deepEqual(sau.find((r) => r.id === 3), truoc.find((r) => r.id === 3));
  assert.deepEqual(sau.map((r) => r.updated_at), truoc.map((r) => r.updated_at), 'tự dọn đóng giờ lên updated_at');
  assert.equal(vongDoi.SO_NGAY_GIU_DAU_NOI, 30, 'SEC-DEC-008 câu 5: 30 ngày');
});

test('C2 — batTuDonDauNoi: dọn NGAY lúc khởi động và lặp lại theo chu kỳ, không cần route nào được gọi; lỗi CSDL một lượt không làm dừng các lượt sau', { skip: BO_QUA }, async () => {
  assert.ok(vongDoi, 'chưa có server/src/lib/vong-doi-dau-noi.js');
  dungCsdl();
  themDon(1, { an: 0, tao: luc(31 * NGAY) });
  const goc = pool.query;
  let loiMotLan = false;
  const viec = vongDoi.batTuDonDauNoi(pool, { chuKyMs: 20 });
  try {
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(don(1).device_id, null, 'không dọn lúc khởi động — phải chờ tới chu kỳ đầu');
    /* Đơn thứ hai "già" đi sau khởi động; một lượt CSDL lỗi xen giữa */
    themDon(2, { an: 0, tao: luc(31 * NGAY) });
    pool.query = async (...a) => {
      if (!loiMotLan) { loiMotLan = true; throw new Error('mất kết nối giả'); }
      return goc(...a);
    };
    await new Promise((r) => setTimeout(r, 120));
    assert.ok(loiMotLan, 'chu kỳ không chạy');
    assert.equal(don(2).device_id, null, 'một lượt lỗi làm dừng cơ chế tự dọn');
  } finally {
    viec.dung();
    pool.query = goc;
  }
});

test('C3 — cả ba điểm vào máy chủ đều bật tự dọn trong start()', async () => {
  for (const tep of ['index.js', 'may-chu-cong-khai.js', 'may-chu-can-bo.js']) {
    const nguon = (await readFile(new URL(`../src/${tep}`, import.meta.url), 'utf8'))
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    assert.ok(/import\s*\{[^}]*\bbatTuDonDauNoi\b[^}]*\}\s*from\s*'\.\/lib\/vong-doi-dau-noi\.js'/.test(nguon),
      `${tep} không nạp batTuDonDauNoi`);
    const start = nguon.match(/async function start\(\)\s*\{([\s\S]*?)\n\}/);
    assert.ok(start, `${tep}: không thấy hàm start()`);
    assert.ok(/\bbatTuDonDauNoi\(pool\b/.test(start[1]), `${tep}: start() không bật tự dọn dấu nối`);
  }
});

test('C4 — đơn quá 30 ngày sau khi tự dọn bị đánh rác: không khoá gì, không báo đã khoá, không lỗi', { skip: BO_QUA }, async () => {
  assert.ok(vongDoi, 'chưa có server/src/lib/vong-doi-dau-noi.js');
  dungCsdl();
  themDon(1, { an: 0, tao: luc(31 * NGAY), status: 'processing' });
  await vongDoi.xoaDauNoiQuaHan(pool);
  const r = await canBo('POST', '/submissions/1/mark-spam', { reason: 'bịa đặt' });
  assert.equal(r.status, 200, r.text.slice(0, 200));
  assert.deepEqual(cacDongKhoa(), []);
  assert.equal(r.body.daKhoaThietBi, false);
  assert.doesNotMatch(r.body.ghiChu, /khoá thiết bị này|khoá theo địa chỉ mạng/);
});

/* ======================================================================== */
/* D. Hàm đọc hai cột chịu được NULL / rỗng (canh hồi quy)                   */
/* ======================================================================== */

for (const [ten, may, ip] of [['NULL', null, null], ['chuỗi rỗng', '', '']]) {
  test(`D1 — mark-spam đơn có mã máy và IP là ${ten}: không dòng khoá nào (không định danh rỗng), không báo đã khoá`, { skip: BO_QUA }, async () => {
    dungCsdl();
    themDon(1, { an: 0, may, ip });
    const r = await canBo('POST', '/submissions/1/mark-spam', { reason: 'bịa đặt' });
    assert.equal(r.status, 200, r.text.slice(0, 200));
    assert.deepEqual(cacDongKhoa(), []);
    assert.equal(r.body.daKhoaThietBi, false);
    assert.equal(r.body.kieuKhoa, '');
  });

  test(`D2 — review spam đơn hàng chờ có mã máy và IP là ${ten}: không dòng khoá nào`, { skip: BO_QUA }, async () => {
    dungCsdl();
    themDon(1, { an: 1, may, ip, status: 'pending_review' });
    const r = await canBo('POST', '/submissions/1/review', { action: 'spam' });
    assert.equal(r.status, 200, r.text.slice(0, 200));
    assert.deepEqual(cacDongKhoa(), []);
    assert.equal(r.body.taiPham, false);
  });
}

test('D3 — khiếu nại cũ của máy mà mọi đơn đã mất dấu nối: danh sách khiếu nại vẫn tải được, nhóm tin liên quan rỗng', { skip: BO_QUA }, async () => {
  dungCsdl();
  themDon(1, { an: 0, may: null, ip: null, status: 'spam', spam: 1 });
  db.prepare(`INSERT INTO blacklists (identifier, kind, loai_don, reason, created_by, expires_at)
    VALUES (?, 'device', 'co_ten', 'Tin rác', 4, ?)`).run(MAY_P, luc(-600));
  db.prepare(`INSERT INTO unlock_appeals (identifier, kind, content, device_id, ip_address) VALUES (?, 'device', ?, ?, ?)`)
    .run(MAY_P, 'Tôi gửi phản ánh thật, xin mở khoá cho tôi.', MAY_P, '127.0.0.1');
  const r = await canBo('GET', '/chat/khieu-nai?tatCa=1');
  assert.equal(r.status, 200, r.text.slice(0, 200));
  assert.equal(r.body.length, 1);
  assert.deepEqual(r.body[0].tinLienQuan, []);
});

/* ======================================================================== */
/* E. Dòng khoá thiết bị/IP ĐÃ HẾT HẠN cũng là dấu nối — tự xoá              */
/*    (trọng tài P35: mã máy sống mãi ở blacklists dù submissions đã dọn;     */
/*    Loc chọn nới M-F sang phần này, phần khiếu nại tách BUG riêng)          */
/* ======================================================================== */

function dungDongKhoaHonHop() {
  const them = db.prepare(`INSERT INTO blacklists (identifier, kind, loai_don, reason, created_by, created_at, expires_at)
    VALUES (?, ?, ?, 'x', 4, ?, ?)`);
  them.run('het-co-ten', 'device', 'co_ten', luc(3 * NGAY), luc(2 * NGAY));
  them.run('het-an-danh', 'device', 'an_danh', luc(3 * NGAY), luc(2 * NGAY));
  them.run('het-ip', 'ip', 'co_ten', luc(3 * NGAY), luc(60));
  them.run('het-tai-pham', 'device', 'co_ten', luc(70 * NGAY), luc(40 * NGAY));
  them.run('con-co-ten', 'device', 'co_ten', luc(60), luc(-600));
  them.run('con-an-danh', 'device', 'an_danh', luc(60), luc(-600));
  /* Thiết bị tin cậy: không bao giờ là khoá — kể cả dòng mang hạn đã qua */
  them.run(MAY_KIOSK, 'trusted_device', 'khong_ro', luc(90 * NGAY), luc(NGAY));
}
const conLai = () => cacDongKhoa().map((d) => d.identifier);
const KY_VONG_CON_LAI = ['con-co-ten', 'con-an-danh', MAY_KIOSK];

test('E1 — donDauNoi: xoá mọi dòng khoá thiết bị/IP đã hết hạn (mọi loại đơn), giữ dòng còn hạn và thiết bị tin cậy', { skip: BO_QUA }, async () => {
  assert.ok(vongDoi?.donDauNoi, 'chưa có donDauNoi trong lib/vong-doi-dau-noi.js');
  dungCsdl();
  dungDongKhoaHonHop();
  const kq = await vongDoi.donDauNoi(pool);
  assert.deepEqual(conLai(), KY_VONG_CON_LAI);
  assert.equal(kq.soDongKhoa, 4);
});

test('E2 — v21: xoá mọi dòng khoá thiết bị/IP đã hết hạn (mọi loại đơn), giữ dòng còn hạn và thiết bị tin cậy', { skip: BO_QUA }, async () => {
  dungCsdl();
  dungDongKhoaHonHop();
  await chayV21();
  assert.deepEqual(conLai(), KY_VONG_CON_LAI);
});

test('E3 — kịch bản trọng tài: rác tố giác ẩn danh B + đơn có tên A cùng máy P, 31 ngày sau lượt tự dọn: không bảng nào (đơn, khoá) còn mã máy P', { skip: BO_QUA }, async () => {
  assert.ok(vongDoi?.batTuDonDauNoi, 'chưa có lib/vong-doi-dau-noi.js');
  dungCsdl();
  themDon(1, { an: 0, status: 'processing' });
  themDon(2, { an: 1, status: 'pending_review' });
  assert.equal((await canBo('POST', '/submissions/2/review', { action: 'spam' })).status, 200);
  assert.equal((await canBo('POST', '/submissions/1/mark-spam', { reason: 'bịa đặt' })).status, 200);
  assert.ok(cacDongKhoa().length > 0, 'dữ liệu dựng sai — hai cú Tin rác phải tạo dòng khoá');
  dongHo += 31 * NGAY * 60_000;
  const viec = vongDoi.batTuDonDauNoi(pool, { chuKyMs: 60_000 });
  try {
    await new Promise((r) => setTimeout(r, 20));
  } finally {
    viec.dung();
  }
  const conMa = db.prepare(`SELECT 'submissions' AS bang, id FROM submissions WHERE device_id = ? OR ip_address = ?
    UNION ALL SELECT 'blacklists', id FROM blacklists WHERE identifier IN (?, ?)`).all(MAY_P, IP_P, MAY_P, IP_P);
  assert.deepEqual(conMa.map((r) => ({ ...r })), [],
    'mã máy/IP còn ở bảng — ghép blacklists.created_at/created_by với status_history là nối lại được hai đơn');
});

test('E4 — đơn đã xoá danh tính: sau khi dòng khoá nó gây ra hết hạn và lượt tự dọn chạy, không còn dòng khoá nào mang mã máy của nó', { skip: BO_QUA }, async () => {
  assert.ok(vongDoi?.donDauNoi, 'chưa có donDauNoi trong lib/vong-doi-dau-noi.js');
  dungCsdl();
  themDon(1, { an: 0, status: 'processing' });
  assert.equal((await canBo('POST', '/submissions/1/mark-spam', { reason: 'bịa đặt' })).body?.daKhoaThietBi, true);
  /* Khôi phục khỏi thùng rác rồi đóng hồ sơ (như trọng tài làm qua route) */
  db.exec(`UPDATE submissions SET deleted_at = NULL, deleted_by = NULL, status = 'resolved' WHERE id = 1`);
  assert.equal((await nguoiDan('POST', `/${maTraCuu(1)}/request-deletion`)).body?.status, 'done');
  dongHo += 25 * 60 * 60_000; // khoá 24 giờ đã hết
  await vongDoi.donDauNoi(pool);
  assert.deepEqual(cacDongKhoa(), [], 'đơn đã xoá danh tính vẫn nối lại được với máy qua dòng khoá cũ');
});

/* ======================================================================== */
/* F. Khoảng hở triển khai: v21 chạy TRƯỚC khi cập nhật mã máy chủ, nên mã   */
/*    cũ còn ghi dữ liệu kiểu cũ sau v21. Lượt tự dọn phải làm đủ mọi việc   */
/*    của v21, không chỉ phần "quá hạn" (trọng tài lần 2, P35)               */
/* ======================================================================== */

for (const [ten, thuTu] of [['có tên trước, ẩn danh sau', 'coten_truoc'], ['ẩn danh trước, có tên sau', 'andanh_truoc']]) {
  test(`F1 R1 (${ten}) — mã cũ ghi dòng khoá khong_ro SAU khi v21 đã chạy: lượt tự dọn của mã mới xoá nó, cán bộ không phân biệt được B cùng hay khác máy P`, { skip: BO_QUA }, async () => {
    assert.ok(vongDoi?.donDauNoi, 'chưa có donDauNoi');
    await soHaiKichBan(async (mayB) => {
      await chayV20();
      await chayV21();
      const buoc = async (anDanh) => {
        dongHo += 60 * 60_000;
        if (anDanh) {
          themDon(2, { an: 1, may: mayB, status: 'spam', spam: 1, deletedAt: luc(0) });
          await khoaCu(mayB, 'Tin rác — đánh dấu tại hàng chờ kiểm duyệt', 1);
        } else {
          themDon(1, { an: 0, may: MAY_P, status: 'spam', spam: 1, deletedAt: luc(0), rejectionReason: 'bịa đặt' });
          await khoaCu(MAY_P, 'Tin rác — hồ sơ MA1: bịa đặt', 4);
        }
      };
      if (thuTu === 'coten_truoc') { await buoc(false); await buoc(true); }
      else { await buoc(true); await buoc(false); }
      await vongDoi.donDauNoi(pool);   // mã mới khởi động
      return [await chupManHinh('sau lượt tự dọn đầu tiên của mã mới')];
    });
  });
}

test('F2 — đơn bị xoá danh tính bằng mã cũ SAU khi v21 đã chạy (còn mã máy): lượt tự dọn xoá mã máy, giữ updated_at; thiết bị tin cậy khong_ro còn nguyên', { skip: BO_QUA }, async () => {
  assert.ok(vongDoi?.donDauNoi, 'chưa có donDauNoi');
  dungCsdl();
  await chayV21();
  themDon(1, { an: 0, tao: luc(3 * NGAY), erased: true, ip: null, status: 'resolved' });
  themDon(2, { an: 0, tao: luc(3 * NGAY), status: 'resolved' });
  db.prepare(`INSERT INTO blacklists (identifier, kind, loai_don, reason, expires_at) VALUES (?, 'trusted_device', 'khong_ro', 'kiosk', '2099-01-01 00:00:00')`).run(MAY_KIOSK);
  const truoc = dauNoi();
  await vongDoi.donDauNoi(pool);
  const sau = dauNoi();
  assert.equal(sau[0].device_id, null, 'đơn đã xoá danh tính còn mã máy sau lượt tự dọn');
  assert.equal(sau[0].updated_at, truoc[0].updated_at);
  assert.deepEqual(sau[1], truoc[1]);
  assert.deepEqual(conLai(), [MAY_KIOSK]);
});
