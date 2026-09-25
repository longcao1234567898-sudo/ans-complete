/**
 * BUG-014 — Cán bộ không được có trong tay giá trị nào dùng làm KHOÁ NỐI giữa
 * đơn tố giác ẩn danh và đơn có tên của cùng người gửi.
 *
 * Mã thiết bị là UUID sinh một lần và sống mãi trong localStorage. Từng mã đơn
 * lẻ không nói lên ai, nhưng hai hồ sơ cùng mã là hai đơn từ cùng một trình
 * duyệt: đơn có tên (tên che, SĐT che) cộng đơn ẩn danh cùng mã là đủ gán đơn
 * ẩn danh cho một người. Người dân ở xã thường chỉ có một điện thoại.
 *
 * Các đường đọc bị kiểm ở đây:
 *   · GET /submissions/:id — từng trả nguyên văn device_id cho mọi cán bộ
 *   · GET /chat/khieu-nai  — gom các đơn bị đánh rác CÙNG MÁY vào một nhóm
 *   · GET /chat/blacklist  — mã máy thô + lý do khoá ghi mã hồ sơ (N1)
 *   · dọn theo lô          — ghi mã hồ sơ gây khoá vào đơn bị cuốn, cuốn cả đơn khác loại (N2, N3)
 *
 * Câu SQL của route chạy NGUYÊN VĂN trên engine SQL thật (node:sqlite) — engine
 * tự quyết cột nào trả về, không giả lập phép chiếu bằng regex. Bài học P23:
 * pool giả trả nguyên hàng bất kể SELECT thì test nói sai về việc route kéo cột
 * nào lên. Node < 22 không có node:sqlite -> các test đó bị BỎ QUA (hiện rõ trong
 * output), không âm thầm xanh.
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

const ADMIN   = { id: 1, username: 'admin', role: 'admin',   full_name: 'Quản trị' };
const MGR     = { id: 2, username: 'mgr2',  role: 'manager', full_name: 'Lãnh đạo' };
const HANDLER = { id: 4, username: 'cb4',   role: 'handler', full_name: 'Cán bộ xử lý' };

/* UUID v4 thật như trình duyệt sinh — để kiểm cả việc cắt ngắn / lấy một khúc */
const MA_MAY   = '3f9c2a71-5b4e-4d8a-9c1f-7e2b6a0d4c95';
const MA_KHAC  = 'b81d0e46-2c7a-4f93-8e05-19a4c6f2d7b3';
const IP_BAM   = 'hmac-ip-cua-nguoi-gui-0001';

/* ------------------------------------------------------------------------ */
/* CSDL thật trong bộ nhớ                                                    */
/* ------------------------------------------------------------------------ */

let db;
const norm = (v) => (v instanceof Date ? v.toISOString().slice(0, 19).replace('T', ' ')
  : typeof v === 'boolean' ? Number(v) : v === undefined ? null : v);

/* Dịch đúng hai cú pháp MySQL mà các route khoá/dọn dùng — không dịch gì khác.
   Câu nào còn cú pháp lạ thì SQLite ném lỗi, test đỏ, người sửa biết mà bổ sung. */
function sangSqlite(sql) {
  let s = sql.replace(/DATE_(ADD|SUB)\(NOW\(\),\s*INTERVAL\s+(\?|\d+)\s+(HOUR|DAY|YEAR)\)/gi,
    (_m, huong, n, dv) => `datetime('now', '${huong.toUpperCase() === 'ADD' ? '+' : '-'}' || ${n} || ' ${dv.toLowerCase()}s')`);
  const i = s.search(/ON DUPLICATE KEY UPDATE/i);
  if (i > -1) {
    s = s.slice(0, i) + 'ON CONFLICT(identifier, kind, loai_don) DO UPDATE SET'
      + s.slice(i + 'ON DUPLICATE KEY UPDATE'.length).replace(/VALUES\((\w+)\)/g, 'excluded.$1');
  }
  return s;
}

function dungCsdl() {
  db = new sqlite.DatabaseSync(':memory:');
  /* Hai hàm MySQL mà câu SQL của route khiếu nại dùng */
  db.function('NOW', () => norm(new Date()));
  db.function('LEFT', (s, n) => (s == null ? null : String(s).slice(0, n)));
  for (const q of [
    `CREATE TABLE categories (id INT PRIMARY KEY, code TEXT, name TEXT, sla_days INT)`,
    `CREATE TABLE staff (id INT PRIMARY KEY, full_name TEXT, is_active INT DEFAULT 1)`,
    `CREATE TABLE wards (id INT PRIMARY KEY, name TEXT)`,
    `CREATE TABLE submissions (
       id INTEGER PRIMARY KEY, tracking_code TEXT, original_content TEXT, ai_processed_content TEXT,
       category_id INT, status TEXT, urgency TEXT, security_level TEXT DEFAULT 'thuong',
       is_anonymous INT, is_flagged INT DEFAULT 0, flag_reason TEXT,
       sender_name TEXT, sender_phone TEXT, sender_phone_hash TEXT, sender_email TEXT,
       ip_address TEXT, user_agent TEXT, content_hash TEXT,
       created_at TEXT, updated_at TEXT, deadline_at TEXT, resolved_at TEXT,
       assigned_to INT, resolved_by INT, reviewed_by INT, reviewed_at TEXT,
       rejection_reason TEXT, resolution_note TEXT, ward_id INT,
       incident_lat REAL, incident_lng REAL,
       identity_erased INT DEFAULT 0, identity_erased_at TEXT, deleted_at TEXT, deleted_by INT,
       incident_group_id INT, device_id TEXT, is_spam INT DEFAULT 0)`,
    `CREATE TABLE submission_images (submission_id INT, image_url TEXT, mime_type TEXT, moderation_status TEXT)`,
    `CREATE TABLE status_history (submission_id INT, old_status TEXT, new_status TEXT, note TEXT, changed_at TEXT, changed_by INT)`,
    `CREATE TABLE staff_activity_logs (staff_id INT, action TEXT, target_type TEXT, target_id TEXT, details TEXT, ip_address TEXT)`,
    /* Lược đồ SAU database/nang_cap_v19.sql (khoá tách theo loại đơn, BUG-015) */
    `CREATE TABLE blacklists (id INTEGER PRIMARY KEY, identifier TEXT, kind TEXT,
       loai_don TEXT NOT NULL DEFAULT 'khong_ro', reason TEXT, created_by INT,
       created_at TEXT DEFAULT CURRENT_TIMESTAMP, expires_at TEXT, UNIQUE (identifier, kind, loai_don))`,
    /* Bản SQLite của view trong database/nang_cap_v12.sql — cùng cột, cùng điều kiện */
    `CREATE VIEW vw_blacklist_active AS
       SELECT b.id, b.identifier, b.kind, b.reason, b.created_at, b.expires_at,
              st.full_name AS nguoi_khoa,
              CAST((julianday(b.expires_at) - julianday('now')) * 1440 AS INT) AS con_lai_phut
         FROM blacklists b LEFT JOIN staff st ON st.id = b.created_by
        WHERE b.expires_at > NOW() ORDER BY b.created_at DESC`,
    `CREATE TABLE unlock_appeals (
       id INTEGER PRIMARY KEY, identifier TEXT, kind TEXT, content TEXT, status TEXT,
       created_at TEXT, handled_at TEXT, handled_by INT, handler_note TEXT, device_id TEXT, ip_address TEXT)`,
    `INSERT INTO categories VALUES (1, 'to_giac', 'Tố giác', 15)`,
    `INSERT INTO staff (id, full_name) VALUES (1, 'Quản trị'), (2, 'Lãnh đạo'), (4, 'Cán bộ xử lý')`,
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

function themDon(id, { an = 0, may = MA_MAY, ip = IP_BAM, spam = 0, ...x } = {}) {
  db.prepare(
    `INSERT INTO submissions (id, tracking_code, original_content, category_id, status, urgency,
       is_anonymous, sender_name, sender_phone, sender_email, created_at, updated_at, deadline_at,
       assigned_to, device_id, ip_address, is_spam, deleted_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run(id, x.ma || `MA${id}`, x.noiDung || `Nội dung đơn ${id}`, 1,
    x.status || (spam ? 'spam' : 'processing'), 'normal',
    an, an ? null : encrypt('Nguyễn Văn An'), an ? null : encrypt('0901234567'),
    an ? null : encrypt('an@example.com'), x.luc || '2026-09-01 08:00:00', x.luc || '2026-09-01 08:00:00',
    '2026-09-20 08:00:00', x.assigned === undefined ? 2 : x.assigned, may, ip, spam, null);
}

async function goi(staff, method, duong, body) {
  const app = express();
  app.use(express.json());
  app.use('/api/admin', adminRouter);
  const server = app.listen(0);
  try {
    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}/api/admin${duong}`, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${signAccessToken(staff)}` },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json = {};
    try { json = JSON.parse(text); } catch { /* để trống */ }
    return { status: res.status, body: json, text };
  } finally {
    server.close();
  }
}

/** Mọi khúc của mã (theo dấu gạch) và mã viết liền — bắt cả kiểu cắt ngắn, lấy một đoạn */
const cacKhuc = (ma) => [ma, ma.replace(/-/g, ''), ...ma.split('-').filter((k) => k.length >= 8)];

function khongLoMa(r, ma = MA_MAY) {
  for (const k of cacKhuc(ma)) {
    assert.ok(!r.text.toLowerCase().includes(k.toLowerCase()), `Response chứa mã thiết bị (hoặc một khúc của nó): ${k}`);
  }
}

/* ------------------------------------------------------------------------ */
/* (a) Kịch bản gốc: GET /:id                                                */
/* ------------------------------------------------------------------------ */

for (const [ten, cb] of [['handler', HANDLER], ['manager', MGR], ['admin', ADMIN]]) {
  test(`(a) ${ten} GET /submissions/:id -> không thấy mã thiết bị, ở cả đơn ẩn danh lẫn đơn có tên`, { skip: BO_QUA }, async () => {
    dungCsdl();
    themDon(10);            // có tên
    themDon(11, { an: 1 }); // ẩn danh, cùng máy
    for (const id of [10, 11]) {
      const r = await goi(cb, 'GET', `/submissions/${id}`);
      assert.equal(r.status, 200);
      assert.equal(r.body.device_id, undefined, 'GET /:id không được có trường device_id');
      khongLoMa(r);
    }
  });
}

test('(a) hai đơn cùng máy (một có tên, một ẩn danh) -> không còn trường nào mang cùng một giá trị riêng-của-máy', { skip: BO_QUA }, async () => {
  dungCsdl();
  themDon(10);
  themDon(11, { an: 1 });
  themDon(12, { an: 1, may: MA_KHAC }); // đối chứng
  const [a, b, c] = await Promise.all([10, 11, 12].map((id) => goi(HANDLER, 'GET', `/submissions/${id}`)));
  /* Trường nào giống nhau ở đơn 10 và 11 (cùng máy) nhưng KHÁC ở đơn 12 (máy
     khác) là trường mang thông tin về máy -> chính là khoá nối. */
  const khoaNoi = Object.keys(a.body).filter((k) =>
    JSON.stringify(a.body[k]) === JSON.stringify(b.body[k])
    && JSON.stringify(a.body[k]) !== JSON.stringify(c.body[k]));
  assert.deepEqual(khoaNoi, [], `Trường dùng được làm khoá nối: ${khoaNoi.join(', ')}`);
});

/* ------------------------------------------------------------------------ */
/* (c) Băm / cắt ngắn / mã hoá tất định / đổi tên trường đều là CHƯA VÁ      */
/* ------------------------------------------------------------------------ */

test('(c) response chỉ phụ thuộc vào mã thiết bị qua cờ có/không — đổi mã, response y hệt', { skip: BO_QUA }, async () => {
  dungCsdl();
  themDon(11, { an: 1 });
  const truoc = await goi(HANDLER, 'GET', '/submissions/11');
  db.prepare('UPDATE submissions SET device_id = ? WHERE id = 11').run(MA_KHAC);
  const sau = await goi(HANDLER, 'GET', '/submissions/11');
  assert.equal(truoc.status, 200);
  /* Bất kỳ biến đổi tất định nào của mã (băm, cắt, mã hoá, đổi tên trường) đều
     làm hai response khác nhau. Giống hệt nhau thì không còn gì để nối. */
  assert.deepEqual(sau.body, truoc.body, 'Response đổi theo giá trị mã thiết bị — vẫn nối được');
});

/* ------------------------------------------------------------------------ */
/* (b) Không hồi quy: giao diện vẫn biết có mã hay không; khoá vẫn đúng máy  */
/* ------------------------------------------------------------------------ */

test('(b) giao diện vẫn biết hồ sơ CÓ mã thiết bị hay không (co_ma_thiet_bi)', { skip: BO_QUA }, async () => {
  dungCsdl();
  themDon(11, { an: 1 });
  themDon(12, { an: 1, may: null });
  const co = await goi(HANDLER, 'GET', '/submissions/11');
  const khong = await goi(HANDLER, 'GET', '/submissions/12');
  assert.equal(co.body.co_ma_thiet_bi, true);
  assert.equal(khong.status, 200);
  assert.equal(khong.body.co_ma_thiet_bi, false);
});

/* Hai route khoá máy đọc device_id PHÍA MÁY CHỦ theo id hồ sơ — client không
   gửi mã lên. Câu MySQL INTERVAL/ON DUPLICATE KEY không chạy trên SQLite nên
   dùng pool ghi lại truy vấn. */
function poolGhiLai(hang) {
  const ds = [];
  pool.query = async (sql, p = []) => {
    ds.push({ sql: String(sql), p });
    if (/SELECT is_active FROM staff/i.test(sql)) return [[{ is_active: 1 }]];
    if (/FROM submissions WHERE id = \?/i.test(sql)) return [[hang]];
    if (/FROM blacklists/i.test(sql)) return [[]];
    /* donDuocGayKhoa (BUG-015): đơn chưa từng bị cán bộ đánh rác */
    if (/FROM status_history/i.test(sql)) return [[]];
    if (/SELECT status\s+FROM submissions/i.test(sql)) return [[]];
    return [{ affectedRows: 1 }];
  };
  return ds;
}
const khoaMay = (ds) => ds.filter((t) => /INSERT INTO blacklists/i.test(t.sql) && /'device'/.test(t.sql));

test('(b) POST /:id/mark-spam vẫn khoá ĐÚNG máy của hồ sơ', async () => {
  const ds = poolGhiLai({ status: 'processing', device_id: MA_MAY, ip_address: IP_BAM, tracking_code: 'MA11' });
  const r = await goi(HANDLER, 'POST', '/submissions/11/mark-spam', { reason: 'bịa đặt' });
  assert.equal(r.status, 200);
  assert.equal(khoaMay(ds).length, 1, 'Không khoá thiết bị');
  assert.equal(khoaMay(ds)[0].p[0], MA_MAY);
  khongLoMa(r);
});

test('(b) POST /:id/review spam vẫn khoá ĐÚNG máy của hồ sơ', async () => {
  const ds = poolGhiLai({ status: 'pending_review', is_anonymous: 1, device_id: MA_MAY });
  const r = await goi(HANDLER, 'POST', '/submissions/11/review', { action: 'spam' });
  assert.equal(r.status, 200);
  assert.equal(khoaMay(ds).length, 1, 'Không khoá thiết bị');
  assert.equal(khoaMay(ds)[0].p[0], MA_MAY);
  khongLoMa(r);
});

/* ------------------------------------------------------------------------ */
/* (d) Khiếu nại mở khoá: nhóm "tin liên quan" gom đơn cùng máy              */
/* ------------------------------------------------------------------------ */

/** Một khiếu nại không được mang BẤT KỲ trường nào nói về đơn ẩn danh của máy đó —
    kể cả số đếm — và không mang mã máy (N1: mã máy nối khiếu nại với dòng khoá). */
function khongCoDauVetAnDanh(k) {
  const thua = Object.keys(k).filter((t) => /an_?danh/i.test(t));
  assert.deepEqual(thua, [], `Khiếu nại có trường nói về đơn ẩn danh: ${thua.join(', ')}`);
  assert.equal(k.identifier, undefined, 'Khiếu nại trả mã máy/địa chỉ — nối được với danh sách khoá');
  for (const kh of cacKhuc(MA_MAY)) assert.ok(!JSON.stringify(k).includes(kh), `Khiếu nại chứa mã máy: ${kh}`);
}

function themKhieuNai(id, { kind = 'device', identifier = MA_MAY, noiDung = 'Tôi là Nguyễn Văn An, số 0901234567, xin mở khoá' } = {}) {
  db.prepare(
    `INSERT INTO unlock_appeals (id, identifier, kind, content, status, created_at)
     VALUES (?,?,?,?, 'cho_xu_ly', '2026-09-02 08:00:00')`
  ).run(id, identifier, kind, noiDung);
}

for (const [kind, identifier] of [['device', MA_MAY], ['ip', IP_BAM]]) {
  for (const [ten, cb] of [['handler', HANDLER], ['admin', ADMIN]]) {
    test(`(d) ${ten} xem khiếu nại (${kind}) -> không thấy đơn ẩn danh cùng máy trong nhóm tin liên quan`, { skip: BO_QUA }, async () => {
      dungCsdl();
      themDon(10, { spam: 1, ma: 'COTEN10', noiDung: 'Đèn đường hỏng trước nhà' });
      themDon(11, { spam: 1, an: 1, ma: 'ANDANH11', noiDung: 'Tố giác ổ đánh bạc ở xóm Đông' });
      themDon(12, { spam: 1, an: 1, ma: 'KHAC12', may: MA_KHAC, ip: 'ip-khac', noiDung: 'Đơn máy khác' });
      themKhieuNai(1, { kind, identifier });

      const r = await goi(cb, 'GET', '/chat/khieu-nai');
      assert.equal(r.status, 200);
      const [k] = r.body;
      assert.ok(k, 'Không thấy khiếu nại');
      /* Đơn có tên vẫn hiện — cán bộ cần thấy người này đã gửi gì mới quyết được */
      assert.deepEqual(k.tinLienQuan.map((t) => t.tracking_code), ['COTEN10']);
      /* Đơn ẩn danh: không id, không mã tra cứu, không trích nội dung */
      for (const chuoi of ['ANDANH11', 'Tố giác ổ đánh bạc']) {
        assert.ok(!r.text.includes(chuoi), `Khiếu nại lộ đơn ẩn danh cùng máy: "${chuoi}"`);
      }
      assert.ok(!k.tinLienQuan.some((t) => t.id === 11), 'Khiếu nại trả id đơn ẩn danh cùng máy');
      /* N4: kể cả SỐ LƯỢNG đơn ẩn danh cũng không — gắn với lời khiếu nại có ký tên, nó cho biết người này từng dùng kênh ẩn danh */
      khongCoDauVetAnDanh(k);
    });
  }
}

test('(d) máy chỉ có đơn ẩn danh bị đánh rác -> nhóm rỗng, không một dấu vết nào về đơn ẩn danh', { skip: BO_QUA }, async () => {
  dungCsdl();
  themDon(11, { spam: 1, an: 1, ma: 'ANDANH11' });
  themDon(13, { spam: 1, an: 1, ma: 'ANDANH13' });
  themKhieuNai(1);
  const r = await goi(HANDLER, 'GET', '/chat/khieu-nai');
  assert.equal(r.status, 200);
  assert.deepEqual(r.body[0].tinLienQuan, []);
  khongCoDauVetAnDanh(r.body[0]);
  assert.ok(!/ANDANH1[13]/.test(r.text));
});

test('(d) is_anonymous NULL (cột cho phép NULL) -> coi là ẩn danh: không liệt kê', { skip: BO_QUA }, async () => {
  dungCsdl();
  themDon(10, { spam: 1, ma: 'COTEN10' });
  themDon(14, { spam: 1, an: 1, ma: 'KHONGRO14' });
  db.prepare('UPDATE submissions SET is_anonymous = NULL WHERE id = 14').run();
  themKhieuNai(1);
  const r = await goi(HANDLER, 'GET', '/chat/khieu-nai');
  assert.deepEqual(r.body[0].tinLienQuan.map((t) => t.tracking_code), ['COTEN10']);
  khongCoDauVetAnDanh(r.body[0]);
  assert.ok(!r.text.includes('KHONGRO14'));
});

/* ------------------------------------------------------------------------ */
/* N1–N3: các thao tác theo máy (khoá, dọn theo lô) không được bắc cầu giữa  */
/* đơn ẩn danh và đơn có tên trong bất cứ thứ gì cán bộ đọc được             */
/* ------------------------------------------------------------------------ */

const bayGio = () => norm(new Date(Date.now() - 60 * 60 * 1000)); // gửi 1 giờ trước — trong cửa sổ 24 giờ

/** Một máy gửi: đơn có tên #20, tố giác ẩn danh #21, thêm #22 ẩn danh và #23 có tên — đều đang chờ, chưa phân công */
function mayGuiHonHop() {
  dungCsdl();
  themDon(20, { ma: 'COTEN20', status: 'received', assigned: null, luc: bayGio() });
  themDon(21, { an: 1, ma: 'ANDANH21', status: 'pending_review', assigned: null, luc: bayGio(), noiDung: 'Tố giác ổ đánh bạc' });
  themDon(22, { an: 1, ma: 'ANDANH22', status: 'pending_review', assigned: null, luc: bayGio() });
  themDon(23, { ma: 'COTEN23', status: 'received', assigned: null, luc: bayGio() });
}
const hang = (id) => db.prepare('SELECT * FROM submissions WHERE id = ?').get(id);

for (const [ten, duong, body, cungLoai, khacLoai] of [
  ['mark-spam đơn CÓ TÊN', '/submissions/20/mark-spam', { reason: 'bịa' }, 23, [21, 22]],
  ['mark-spam đơn ẨN DANH', '/submissions/21/mark-spam', {}, 22, [20, 23]],
  ['review spam đơn ẨN DANH', '/submissions/21/review', { action: 'spam' }, 22, [20, 23]],
]) {
  test(`N2/N3 ${ten} -> dọn theo lô chỉ cuốn đơn CÙNG LOẠI, không ghi mã hồ sơ nào vào đơn bị cuốn`, { skip: BO_QUA }, async () => {
    mayGuiHonHop();
    const r = await goi(HANDLER, 'POST', duong, body);
    assert.equal(r.status, 200, r.text);
    /* Không hồi quy: vẫn dọn đơn cùng loại cùng máy */
    assert.ok(hang(cungLoai).deleted_at, `Đơn cùng loại #${cungLoai} cùng máy không được dọn — hỏng tính năng dọn theo lô`);
    /* N3: đơn khác loại không bị cuốn -> thùng rác không có cặp ẩn danh/có tên xoá cùng một giây */
    for (const id of khacLoai) {
      assert.equal(hang(id).deleted_at, null, `Đơn khác loại #${id} bị cuốn theo — thùng rác nối được hai đơn`);
    }
    /* N2: lý do ghi vào đơn bị cuốn không trỏ tới hồ sơ nào */
    const lyDo = hang(cungLoai).rejection_reason || '';
    for (const ma of ['COTEN20', 'ANDANH21', 'ANDANH22', 'COTEN23']) {
      assert.ok(!lyDo.includes(ma), `rejection_reason của #${cungLoai} trỏ tới hồ sơ ${ma}: "${lyDo}"`);
    }
    const chiTiet = await goi(HANDLER, 'GET', `/submissions/${cungLoai}`);
    assert.ok(!/(COTEN|ANDANH)2\d/.test(chiTiet.body.rejection_reason || ''), 'GET /:id của đơn bị cuốn trỏ tới hồ sơ khác');
    /* Không hồi quy: máy vẫn bị khoá */
    assert.ok(db.prepare(`SELECT 1 FROM blacklists WHERE kind = 'device' AND identifier = ?`).get(MA_MAY), 'Không khoá máy');
  });
}

for (const [ten, cb] of [['handler', HANDLER], ['admin', ADMIN]]) {
  test(`N1 ${ten} xem danh sách khoá sau khi đánh rác một đơn ẩn danh -> không mã máy, không mã hồ sơ`, { skip: BO_QUA }, async () => {
    mayGuiHonHop();
    const d = await goi(HANDLER, 'POST', '/submissions/21/mark-spam', { reason: 'bịa' });
    assert.equal(d.status, 200, d.text);
    /* Máy không có mã -> khoá theo địa chỉ; cũng không được ghi mã hồ sơ */
    themDon(30, { an: 1, ma: 'ANDANH30', may: null, ip: 'ip-khong-ma-may', status: 'pending_review', assigned: null });
    const d2 = await goi(HANDLER, 'POST', '/submissions/30/mark-spam', {});
    assert.equal(d2.status, 200, d2.text);

    const r = await goi(cb, 'GET', '/chat/blacklist');
    assert.equal(r.status, 200);
    assert.ok(r.body.length >= 2, 'Danh sách khoá phải có dòng khoá máy và dòng khoá địa chỉ');
    for (const dong of r.body) {
      assert.equal(dong.identifier, undefined, 'Danh sách khoá trả mã máy/địa chỉ — nối được với khiếu nại');
      assert.ok(dong.id && dong.kind, 'Vẫn phải có id (để gỡ) và loại khoá');
    }
    for (const chuoi of ['ANDANH21', 'ANDANH30', 'ip-khong-ma-may', ...cacKhuc(MA_MAY)]) {
      assert.ok(!r.text.includes(chuoi), `Danh sách khoá lộ "${chuoi}"`);
    }
  });
}

test('N1 khiếu nại vẫn xử lý được theo id sau khi bỏ mã máy khỏi response (gỡ khoá thật)', { skip: BO_QUA }, async () => {
  mayGuiHonHop();
  /* Đơn CÓ TÊN gây khoá: từ BUG-015 khiếu nại chỉ gắn với khoá loại có tên —
     khiếu nại ký tên về khoá loại ẩn danh là tự khai danh tính (khieu-nai.js). */
  await goi(HANDLER, 'POST', '/submissions/20/mark-spam', {});
  themKhieuNai(1);
  const ds = await goi(ADMIN, 'GET', '/chat/khieu-nai');
  assert.equal(ds.body[0].con_bi_khoa, true);
  const r = await goi(ADMIN, 'POST', `/chat/khieu-nai/${ds.body[0].id}/xu-ly`, { quyetDinh: 'go_khoa' });
  assert.equal(r.status, 200, r.text);
  assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM blacklists WHERE kind = 'device'`).get().n, 0, 'Gỡ khoá không xoá dòng khoá');
});

/* ------------------------------------------------------------------------ */
/* Canh: route chi tiết chỉ được nhắc tới mã thiết bị dưới dạng cờ           */
/* ------------------------------------------------------------------------ */

test('GET /:id chỉ được lấy (s.device_id IS NOT NULL) AS co_ma_thiet_bi — không lấy cột trần', async () => {
  const nguon = await readFile(new URL('../src/routes/admin/submissions.js', import.meta.url), 'utf8');
  const moc = nguon.indexOf("router.get('/:id'");
  assert.ok(moc > -1, 'Không tìm thấy route GET /:id');
  const het = nguon.indexOf('\nrouter.', moc + 10);
  const than = nguon.slice(moc, het > -1 ? het : undefined)
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    .replace(/\(\s*s\.device_id\s+IS\s+NOT\s+NULL\s*\)\s+AS\s+co_ma_thiet_bi/i, '');
  assert.ok(!/device_id/i.test(than), 'Route GET /:id còn nhắc tới device_id ngoài biểu thức cờ');
});
