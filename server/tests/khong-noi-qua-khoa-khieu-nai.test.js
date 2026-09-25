/**
 * BUG-014 vòng 2 — cán bộ không được nối tố giác ẨN DANH với người CÓ TÊN qua
 * chuỗi "khiếu nại ký tên -> dòng khoá -> đơn gây khoá" (M1), qua dữ liệu ghi
 * trước bản vá vòng 1 (M2), hay qua thông báo tái phạm (M3).
 *
 * Cách kiểm M1/M3: KHÔNG soi từng trường, mà chạy HAI kịch bản chỉ khác đúng một
 * điều — tố giác ẩn danh B gửi từ CÙNG máy với ông P (có tên) hay từ máy KHÁC —
 * rồi so mọi thứ cán bộ đọc được: phản hồi thao tác, danh sách khoá, khiếu nại,
 * thùng rác. Khác nhau ở bất kỳ đâu (kể cả thứ tự, số dòng, một cờ) là cán bộ
 * phân biệt được hai kịch bản, tức là nối được B với P. Mốc thời gian thay bằng
 * nhãn theo THỨ TỰ xuất hiện: giờ do chính cán bộ bấm nên giống nhau ở hai kịch
 * bản, nhưng giờ nào trùng giờ nào (J2) thì vẫn giữ được.
 *
 * Mã biến thể theo buglogs/bugs/BUG-014.md, Phần 2, mục "Còn hở".
 *
 * Câu SQL của route chạy NGUYÊN VĂN trên node:sqlite, bảng blacklists theo lược
 * đồ SAU database/nang_cap_v19.sql. Node < 22 -> BỎ QUA (hiện rõ trong output).
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
const { default: khieuNaiRouter } = await import('../src/routes/khieu-nai.js');

const sqlite = await import('node:sqlite').catch(() => null);
const BO_QUA = sqlite ? false : 'cần node:sqlite (Node ≥ 22) để chạy câu SQL thật của route';

const ADMIN   = { id: 1, username: 'admin', role: 'admin',   full_name: 'Quản trị' };
const HANDLER = { id: 4, username: 'cb4',   role: 'handler', full_name: 'Cán bộ xử lý' };
const MAY_P   = '3f9c2a71-5b4e-4d8a-9c1f-7e2b6a0d4c95';
const MAY_Q   = 'b81d0e46-2c7a-4f93-8e05-19a4c6f2d7b3';

/* ------------------------------------------------------------------------ */
/* CSDL thật trong bộ nhớ                                                    */
/* ------------------------------------------------------------------------ */

let db;
/* ĐỒNG HỒ ẢO. Mọi "bây giờ" trong SQL (NOW(), mặc định cột, hạn khoá) đọc mốc
   này; mỗi lượt gọi route tiến 60 giây. Hai kịch bản vì thế có mốc thời gian
   GIỐNG HỆT nhau. Dùng đồng hồ thật thì thứ tự sắp theo giây đổi tuỳ lần chạy
   có vắt qua ranh giới giây hay không — test chập chờn mà không nói lên gì. */
const GOC_DONG_HO = Date.parse('2026-09-25T08:00:00Z');
let dongHo = GOC_DONG_HO;
const norm = (v) => (v instanceof Date ? v.toISOString().slice(0, 19).replace('T', ' ')
  : typeof v === 'boolean' ? Number(v) : v === undefined ? null : v);

/* Dịch đúng các cú pháp MySQL mà route khoá/khiếu nại/thùng rác dùng — không
   dịch gì khác. Câu nào còn cú pháp lạ thì SQLite ném lỗi, test đỏ. */
function sangSqlite(sql) {
  const dv = (d) => `${d.toLowerCase()}s`;
  let s = sql.replace(/DATE_(ADD|SUB)\(NOW\(\),\s*INTERVAL\s+(\?|\d+)\s+(HOUR|DAY|YEAR)\)/gi,
    (_m, huong, n, d) => `datetime(NOW(), '${huong.toUpperCase() === 'ADD' ? '+' : '-'}' || ${n} || ' ${dv(d)}')`);
  s = s.replace(/NOW\(\)\s*-\s*INTERVAL\s+(\?|\d+)\s+(HOUR|DAY|MINUTE)/gi,
    (_m, n, d) => `datetime(NOW(), '-' || ${n} || ' ${dv(d)}')`);
  /* Thùng rác: số ngày còn lại */
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
    /* Bản SQLite của view trong database/nang_cap_v12.sql — cùng cột, cùng điều kiện */
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
    `INSERT INTO categories VALUES (1, 'to_giac', 'Tố giác', 15), (3, 'phan_anh', 'Phản ánh', 15)`,
    `INSERT INTO staff (id, full_name) VALUES (1, 'Quản trị'), (2, 'Lãnh đạo'), (4, 'Cán bộ xử lý')`,
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

/** an: 1 ẩn danh · 0 có tên */
function themDon(id, { an = 0, may = MAY_P, status = 'processing', tao = luc(120), ...x } = {}) {
  db.prepare(`INSERT INTO submissions (id, tracking_code, original_content, category_id, status, urgency,
      is_anonymous, sender_name, sender_phone, created_at, updated_at, deadline_at, assigned_to,
      device_id, ip_address, is_spam, deleted_at, rejection_reason)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    id, `MA${id}`, `Nội dung đơn ${id}`, an ? 1 : 3, status, 'normal',
    an, an ? null : encrypt('Phạm Văn Phúc'), an ? null : encrypt('0916284735'),
    tao, tao, '2026-12-01 00:00:00', x.assigned ?? null, may, x.ip ?? 'ip-da-bam',
    x.spam ?? 0, x.deletedAt ?? null, x.rejectionReason ?? null);
}

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
const canBo   = (m, d, b) => goi('/api/admin', adminRouter, HANDLER, m, d, b);
const quanTri = (m, d, b) => goi('/api/admin', adminRouter, ADMIN, m, d, b);
const nguoiDan = (m, d, b) => goi('/api/khieu-nai', khieuNaiRouter, null, m, d, b);

/* ------------------------------------------------------------------------ */
/* Những gì cán bộ đọc được                                                  */
/* ------------------------------------------------------------------------ */

/* Mốc thời gian -> nhãn theo thứ tự xuất hiện trong toàn bộ ảnh chụp. Hai giá
   trị bằng nhau nhận cùng nhãn, nên phép trùng giờ (J2) vẫn còn nguyên để so. */
const LA_GIO = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}/;
const TRUONG_DEM_LUI = new Set(['con_lai_phut', 'days_left', 'daysLeft']);
function chuanHoa(anh) {
  const nhan = new Map();
  const di = (v, k) => {
    if (Array.isArray(v)) return v.map((x) => di(x));
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([kk, vv]) => [kk, di(vv, kk)]));
    if (TRUONG_DEM_LUI.has(k)) return typeof v === 'number' ? Math.round(v / 60) : v; // phút -> giờ, bỏ nhiễu chạy test
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

/* Chạy cùng một kịch bản hai lần, B cùng máy P / khác máy P, rồi so từng bước.
   Mỗi bước trả về thứ cán bộ vừa thấy (phản hồi thao tác, hoặc ảnh chụp). */
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

const pick = (r, ghiChu) => ({ ghiChu, status: r.status, body: r.body });

const LOI_KHIEU_NAI = 'Tôi là Phạm Văn Phúc, số 0916284735, thôn Đông. Tôi gửi phản ánh đèn đường thật, xin mở khoá.';

/* P khiếu nại. Route công khai giới hạn 5 lượt/10 phút mỗi IP và bộ giới hạn
   sống suốt tệp test, nên chỉ ca M1 đầy đủ đi route thật (2 lượt); các ca khác
   chèn ĐÚNG hàng mà routes/khieu-nai.js ghi cho khoá thiết bị loại có tên. */
function pKhieuNai() {
  /* 'khong_ro' chỉ sinh ra ở mã trước v19 (một dòng khoá mọi loại) — để chạy
     được tệp này trên bản trước vá mà chứng minh test không mù */
  const k = db.prepare(`SELECT identifier, kind FROM blacklists WHERE kind = 'device' AND identifier = ?
    AND loai_don IN ('co_ten', 'khong_ro') AND expires_at > NOW()`).get(MAY_P);
  assert.ok(k, 'P không có khoá loại có tên — route thật sẽ từ chối khiếu nại');
  db.prepare(`INSERT INTO unlock_appeals (identifier, kind, content, device_id, ip_address) VALUES (?,?,?,?,?)`)
    .run(k.identifier, k.kind, LOI_KHIEU_NAI, MAY_P, '127.0.0.1');
}

/* Dòng khoá do đơn `id` gây ra — test biết, cán bộ thì tự suy bằng J2 (giờ khoá
   trùng giờ xoá ở thùng rác, người khoá trùng người xoá). */
function dongKhoaCuaDon(anDanh, may) {
  return db.prepare(`SELECT id FROM blacklists WHERE kind = 'device' AND identifier = ? AND loai_don IN (?, 'khong_ro')`)
    .get(may, anDanh ? 'an_danh' : 'co_ten');
}

/* ======================================================================== */
/* M1 — khiếu nại ký tên -> dòng khoá -> đơn gây khoá                        */
/* ======================================================================== */

test('M1 — chuỗi đầy đủ: rác đơn có tên A của P + rác tố giác ẩn danh B + P khiếu nại ký tên + chấp nhận khiếu nại → mọi màn hình y hệt dù B cùng hay khác máy P', { skip: BO_QUA }, async () => {
  await soHaiKichBan(async (mayB) => {
    themDon(1, { an: 0, may: MAY_P });
    themDon(2, { an: 1, may: mayB, status: 'pending_review', tao: luc(60) });
    const buoc = [];
    buoc.push(pick(await canBo('POST', '/submissions/1/mark-spam', { reason: 'bịa đặt' }), 'mark-spam A'));
    buoc.push(pick(await canBo('POST', '/submissions/2/review', { action: 'spam' }), 'review=spam B'));
    const kn = await nguoiDan('POST', '/', { deviceId: MAY_P, noiDung: LOI_KHIEU_NAI });
    assert.equal(kn.status, 201, `P không khiếu nại được: ${kn.text}`);
    buoc.push(await chupManHinh('sau khi P khiếu nại'));
    const idKn = db.prepare('SELECT id FROM unlock_appeals').get().id;
    buoc.push(pick(await quanTri('POST', `/chat/khieu-nai/${idKn}/xu-ly`, { quyetDinh: 'go_khoa' }), 'chấp nhận khiếu nại'));
    buoc.push(await chupManHinh('sau khi chấp nhận khiếu nại'));
    return buoc;
  });
});

test('M1(1) — cờ "còn bị khoá" của khiếu nại: gỡ tay dòng khoá do tố giác ẩn danh B gây ra → khiếu nại của P không đổi, dù B cùng hay khác máy', { skip: BO_QUA }, async () => {
  await soHaiKichBan(async (mayB) => {
    themDon(1, { an: 0, may: MAY_P });
    themDon(2, { an: 1, may: mayB, status: 'pending_review', tao: luc(60) });
    await canBo('POST', '/submissions/1/mark-spam', { reason: 'bịa đặt' });
    await canBo('POST', '/submissions/2/review', { action: 'spam' });
    pKhieuNai();
    const buoc = [await chupManHinh('trước khi gỡ dòng khoá của B')];
    const dong = dongKhoaCuaDon(true, mayB);
    assert.ok(dong, 'review=spam B phải tạo dòng khoá loại ẩn danh');
    buoc.push(pick(await quanTri('DELETE', `/chat/blacklist/${dong.id}`), 'gỡ dòng khoá của B'));
    buoc.push(await chupManHinh('sau khi gỡ dòng khoá của B'));
    return buoc;
  });
});

test('M1(1) — dòng khoá của B hết hạn tự nhiên → khiếu nại của P không đổi, dù B cùng hay khác máy', { skip: BO_QUA }, async () => {
  await soHaiKichBan(async (mayB) => {
    themDon(1, { an: 0, may: MAY_P });
    themDon(2, { an: 1, may: mayB, status: 'pending_review', tao: luc(60) });
    await canBo('POST', '/submissions/1/mark-spam', { reason: 'bịa đặt' });
    await canBo('POST', '/submissions/2/review', { action: 'spam' });
    pKhieuNai();
    const buoc = [await chupManHinh('trước khi khoá của B hết hạn')];
    db.prepare(`UPDATE blacklists SET expires_at = datetime(NOW(), '-1 minutes') WHERE id = ?`)
      .run(dongKhoaCuaDon(true, mayB).id);
    buoc.push(await chupManHinh('sau khi khoá của B hết hạn'));
    return buoc;
  });
});

test('M1(1) — suy luận thiểu số: khoá có tên của P đã hết, danh sách chỉ còn MỘT dòng khoá (của B) cạnh khiếu nại ký tên → y hệt dù B cùng hay khác máy', { skip: BO_QUA }, async () => {
  await soHaiKichBan(async (mayB) => {
    themDon(1, { an: 0, may: MAY_P });
    themDon(2, { an: 1, may: mayB, status: 'pending_review', tao: luc(60) });
    await canBo('POST', '/submissions/1/mark-spam', { reason: 'bịa đặt' });
    pKhieuNai();
    db.prepare(`UPDATE blacklists SET expires_at = datetime(NOW(), '-1 minutes') WHERE loai_don IN ('co_ten', 'khong_ro')`).run();
    const buoc = [pick(await canBo('POST', '/submissions/2/review', { action: 'spam' }), 'review=spam B sau khi khoá của P hết')];
    buoc.push(await chupManHinh('một khiếu nại ký tên, một dòng khoá'));
    return buoc;
  });
});

test('M1(2) — đường mark-spam (lý do cán bộ gõ lặp ở dòng khoá, J1): rác tố giác ẩn danh B bằng mark-spam thay vì review → y hệt dù B cùng hay khác máy', { skip: BO_QUA }, async () => {
  await soHaiKichBan(async (mayB) => {
    themDon(1, { an: 0, may: MAY_P });
    themDon(2, { an: 1, may: mayB, tao: luc(60) });
    const buoc = [];
    buoc.push(pick(await canBo('POST', '/submissions/1/mark-spam', { reason: 'bịa đặt' }), 'mark-spam A'));
    pKhieuNai();
    buoc.push(pick(await canBo('POST', '/submissions/2/mark-spam', { reason: 'vu khống cán bộ thôn' }), 'mark-spam B'));
    buoc.push(await chupManHinh('sau khi rác B bằng mark-spam'));
    return buoc;
  });
});

test('M1(3) — nhóm tin liên quan của khiếu nại ký tên không đổi khi B (ẩn danh, bị rác) cùng hay khác máy', { skip: BO_QUA }, async () => {
  await soHaiKichBan(async (mayB) => {
    themDon(1, { an: 0, may: MAY_P });
    themDon(2, { an: 1, may: mayB, tao: luc(60) });
    await canBo('POST', '/submissions/2/mark-spam', { reason: 'x' });
    await canBo('POST', '/submissions/1/mark-spam', { reason: 'x' });
    pKhieuNai();
    return [await chupManHinh('khiếu nại kèm tin liên quan')];
  });
});

/* ======================================================================== */
/* M3 — thông báo tái phạm đếm chéo loại                                     */
/* ======================================================================== */

test('M3 — hai tố giác ẩn danh bị rác rồi rác một đơn có tên của P: phản hồi (có/không "khoá 30 ngày") y hệt dù hai tố giác cùng hay khác máy P', { skip: BO_QUA }, async () => {
  await soHaiKichBan(async (mayB) => {
    themDon(2, { an: 1, may: mayB, tao: luc(300) });
    themDon(3, { an: 1, may: mayB, tao: luc(200) });
    themDon(1, { an: 0, may: MAY_P, tao: luc(100) });
    const buoc = [];
    buoc.push(pick(await canBo('POST', '/submissions/2/mark-spam', { reason: 'x' }), 'rác B1'));
    buoc.push(pick(await canBo('POST', '/submissions/3/mark-spam', { reason: 'x' }), 'rác B2'));
    buoc.push(pick(await canBo('POST', '/submissions/1/mark-spam', { reason: 'x' }), 'rác đơn có tên A'));
    buoc.push(await chupManHinh('sau ba lần rác'));
    return buoc;
  });
});

test('M3 — chiều ngược: hai đơn có tên của P bị rác rồi rác tố giác ẩn danh B: phản hồi y hệt dù B cùng hay khác máy P', { skip: BO_QUA }, async () => {
  await soHaiKichBan(async (mayB) => {
    themDon(1, { an: 0, may: MAY_P, tao: luc(300) });
    themDon(4, { an: 0, may: MAY_P, tao: luc(250) });
    themDon(2, { an: 1, may: mayB, tao: luc(100) });
    const buoc = [];
    buoc.push(pick(await canBo('POST', '/submissions/1/mark-spam', { reason: 'x' }), 'rác A1'));
    buoc.push(pick(await canBo('POST', '/submissions/4/mark-spam', { reason: 'x' }), 'rác A2'));
    buoc.push(pick(await canBo('POST', '/submissions/2/mark-spam', { reason: 'x' }), 'rác B'));
    buoc.push(await chupManHinh('sau ba lần rác'));
    return buoc;
  });
});

/* ======================================================================== */
/* M2 — dữ liệu ghi TRƯỚC bản vá vòng 1 (69e8c00)                            */
/* ======================================================================== */

/* Đúng chuỗi mà mã trước 69e8c00 ghi (git show 69e8c00 -- server/src):
   dọn theo lô cuốn cả hai loại và trỏ tới mã hồ sơ gây dọn; lý do khoá trỏ tới
   mã hồ sơ gây khoá. Dòng khoá cũ mang loai_don 'khong_ro' (nang_cap_v19). */
function dungDuLieuCu() {
  /* updated_at trên MySQL là ON UPDATE CURRENT_TIMESTAMP (TRON_BO_DATABASE_V5.sql):
     sửa bất kỳ cột nào thì tự đóng giờ, TRỪ KHI câu UPDATE gán updated_at tường
     minh. SQLite không có — giả lập bằng trigger, không thì tệp dọn đóng dấu giờ
     chạy lên đúng các đơn nó dọn mà test không thấy (trọng tài vòng 2, N1).
     Trigger BEFORE ... OF updated_at chỉ chạy khi updated_at nằm trong SET. */
  db.exec(`CREATE TABLE _gan_updated_at (id INT)`);
  db.exec(`CREATE TRIGGER _gan_tay BEFORE UPDATE OF updated_at ON submissions
           BEGIN INSERT INTO _gan_updated_at VALUES (NEW.id); END`);
  db.exec(`CREATE TRIGGER _tu_dong_gio AFTER UPDATE ON submissions
           BEGIN
             UPDATE submissions SET updated_at = NOW()
              WHERE id = NEW.id AND NOT EXISTS (SELECT 1 FROM _gan_updated_at WHERE id = NEW.id);
             DELETE FROM _gan_updated_at WHERE id = NEW.id;
           END`);
  themDon(1, { an: 0, may: MAY_P, status: 'spam', spam: 1, deletedAt: luc(60), rejectionReason: 'bịa đặt' });
  /* B bị cuốn theo A rồi được khôi phục: rejection_reason ở lại vĩnh viễn */
  themDon(2, { an: 1, may: MAY_P, status: 'received', spam: 1,
    rejectionReason: 'Dọn theo lô cùng thiết bị với hồ sơ MA1' });
  /* C còn nằm thùng rác */
  themDon(3, { an: 1, may: MAY_P, status: 'spam', spam: 1, deletedAt: luc(60),
    rejectionReason: 'Dọn theo lô cùng thiết bị với hồ sơ MA1' });
  const them = db.prepare(`INSERT INTO blacklists (identifier, kind, loai_don, reason, created_by, expires_at)
    VALUES (?, ?, 'khong_ro', ?, 4, datetime(NOW(), '+20 days'))`);
  them.run(MAY_P, 'device', 'Tin rác — hồ sơ MA1: bịa đặt');
  them.run('ip-da-bam', 'ip', 'Tin rác — hồ sơ MA5: x (hồ sơ không có mã thiết bị)');

  /* H1 (trọng tài vòng 2): /review cũ cũng dọn CHÉO loại, lý do không có mã hồ
     sơ nhưng nói thủ phạm nằm ở hàng chờ — nơi gần như toàn đơn ẩn danh. Đơn CÓ
     TÊN mang chuỗi này = có tố giác ẩn danh cùng máy bị rác trong 24 giờ. */
  themDon(4, { an: 0, may: MAY_Q, status: 'received', spam: 1,
    rejectionReason: 'Dọn theo lô cùng thiết bị với một tin bị đánh dấu rác ở hàng chờ' });
  themDon(5, { an: 0, may: MAY_Q, status: 'spam', spam: 1, deletedAt: luc(30),
    rejectionReason: 'Dọn theo lô cùng thiết bị với một tin bị đánh dấu rác ở hàng chờ' });
  /* H2: lý do đã chung chung, nhưng đơn ẨN DANH đã khôi phục vẫn mang dấu "từng
     bị cuốn theo lô" — cộng cửa sổ 24 giờ là lần ra đơn có tên gây dọn. */
  themDon(6, { an: 1, may: MAY_Q, status: 'pending_review', spam: 1,
    rejectionReason: 'Dọn theo lô cùng thiết bị với một hồ sơ bị đánh dấu tin rác' });
}

/* Chuỗi chung duy nhất được phép còn lại trên đơn CÒN trong thùng rác */
const LY_DO_DON_CHUNG = 'Dọn theo lô cùng thiết bị với một hồ sơ bị đánh dấu tin rác';
const DAU_DON_THEO_LO = /Dọn theo lô/;

/* Chạy tệp dọn dữ liệu như người vận hành chạy trong HeidiSQL. Chỉ lấy các câu
   UPDATE — phần USE/ghi chú là của MySQL. Câu UPDATE phải chạy được nguyên văn. */
async function chayTepDonDuLieu() {
  const sql = await readFile(new URL('../../database/nang_cap_v20.sql', import.meta.url), 'utf8');
  const cau = sql.replace(/--.*$/gm, '').split(';').map((c) => c.trim()).filter((c) => /^UPDATE\b/i.test(c));
  assert.ok(cau.length > 0, 'nang_cap_v20.sql không có câu UPDATE nào');
  for (const c of cau) db.exec(c);
  return cau;
}

const MA_HO_SO = /\bMA\d+\b/;

test('M2 — kịch bản dựng đúng: dữ liệu cũ đang nối đơn ẩn danh với mã hồ sơ đơn có tên (đối chứng, không phải kiểm bản vá)', { skip: BO_QUA }, async () => {
  dungCsdl();
  dungDuLieuCu();
  const ct = await canBo('GET', '/submissions/2');
  assert.equal(ct.status, 200, ct.text.slice(0, 200));
  assert.match(String(ct.body.rejection_reason), MA_HO_SO, 'dữ liệu dựng sai — trang chi tiết không lộ mã hồ sơ thì test M2 không kiểm gì');
});

test('M2 — sau khi chạy tệp dọn dữ liệu: trang chi tiết đơn ẩn danh (đã khôi phục / còn trong thùng rác) không còn trỏ tới mã hồ sơ nào', { skip: BO_QUA }, async () => {
  dungCsdl();
  dungDuLieuCu();
  await chayTepDonDuLieu();
  for (const id of [2, 3]) {
    const ct = await canBo('GET', `/submissions/${id}`);
    assert.equal(ct.status, 200, ct.text.slice(0, 200));
    assert.doesNotMatch(JSON.stringify(ct.body), /MA1\b/, `đơn ẩn danh #${id} còn trỏ tới hồ sơ khác`);
  }
  /* Đơn còn trong thùng rác giữ một lý do chung để cán bộ biết vì sao nó ở đó */
  assert.equal((await canBo('GET', '/submissions/3')).body.rejection_reason, LY_DO_DON_CHUNG);
});

test('H1 — sau khi chạy tệp dọn dữ liệu: đơn CÓ TÊN không còn lý do dọn nói thủ phạm nằm ở hàng chờ kiểm duyệt (đã khôi phục lẫn còn trong thùng rác)', { skip: BO_QUA }, async () => {
  dungCsdl();
  dungDuLieuCu();
  await chayTepDonDuLieu();
  for (const id of [4, 5]) {
    const ct = await canBo('GET', `/submissions/${id}`);
    assert.equal(ct.status, 200, ct.text.slice(0, 200));
    assert.doesNotMatch(String(ct.body.rejection_reason), /hàng chờ/, `đơn có tên #${id} còn lộ đơn gây dọn nằm ở hàng chờ`);
  }
  assert.equal((await canBo('GET', '/submissions/5')).body.rejection_reason, LY_DO_DON_CHUNG);
});

test('H2 — sau khi chạy tệp dọn dữ liệu: đơn ĐÃ KHÔI PHỤC không còn dấu "từng bị cuốn theo lô" ở trang chi tiết, bất kể chuỗi cũ hay mới, loại nào', { skip: BO_QUA }, async () => {
  dungCsdl();
  dungDuLieuCu();
  await chayTepDonDuLieu();
  for (const id of [2, 4, 6]) {
    const ct = await canBo('GET', `/submissions/${id}`);
    assert.equal(ct.status, 200, ct.text.slice(0, 200));
    assert.equal(ct.body.deleted_at, null, `dữ liệu dựng sai — #${id} phải là đơn đã khôi phục`);
    assert.doesNotMatch(String(ct.body.rejection_reason ?? ''), DAU_DON_THEO_LO,
      `đơn đã khôi phục #${id} còn dấu "từng bị cuốn theo lô": ${ct.body.rejection_reason}`);
  }
});

test('N1 — đối chứng giả lập: UPDATE thường tự đóng giờ lên updated_at, UPDATE gán updated_at tường minh thì không (đúng ngữ nghĩa MySQL ON UPDATE CURRENT_TIMESTAMP)', { skip: BO_QUA }, async () => {
  dungCsdl();
  dungDuLieuCu();
  const gio = (id) => db.prepare('SELECT updated_at FROM submissions WHERE id = ?').get(id).updated_at;
  const truoc = gio(2);
  dongHo += 3_600_000;
  db.exec(`UPDATE submissions SET urgency = 'high' WHERE id = 2`);
  assert.notEqual(gio(2), truoc, 'giả lập hỏng: UPDATE thường phải tự đóng giờ');
  const giua = gio(2);
  dongHo += 3_600_000;
  db.exec(`UPDATE submissions SET urgency = 'normal', updated_at = updated_at WHERE id = 2`);
  assert.equal(gio(2), giua, 'giả lập hỏng: gán updated_at tường minh thì không được tự đóng giờ');
});

test('N1 — tệp dọn dữ liệu không đóng dấu giờ chạy lên các đơn nó sửa: updated_at của mọi đơn giữ nguyên', { skip: BO_QUA }, async () => {
  dungCsdl();
  dungDuLieuCu();
  const doc = () => db.prepare('SELECT id, updated_at FROM submissions ORDER BY id').all().map((r) => ({ ...r }));
  const truoc = doc();
  dongHo += 86_400_000; // người vận hành chạy tệp một ngày sau
  await chayTepDonDuLieu();
  assert.deepEqual(doc(), truoc, 'tệp dọn đóng giờ chạy lên đơn nó sửa — cán bộ gom được nhóm đơn "từng bị cuốn theo lô" theo updated_at trùng nhau');
});

test('H1/H2 — sau khi chạy tệp dọn dữ liệu: mọi đơn còn trong thùng rác bị cuốn theo lô chỉ mang MỘT lý do chung, không phân biệt được đường dọn hay hồ sơ gây dọn', { skip: BO_QUA }, async () => {
  dungCsdl();
  dungDuLieuCu();
  await chayTepDonDuLieu();
  const conTrongThung = db.prepare(`SELECT id, rejection_reason FROM submissions
    WHERE deleted_at IS NOT NULL AND rejection_reason LIKE 'Dọn theo lô%'`).all();
  assert.ok(conTrongThung.length >= 2, 'dữ liệu dựng sai — cần đơn bị cuốn còn trong thùng rác');
  for (const d of conTrongThung) assert.equal(d.rejection_reason, LY_DO_DON_CHUNG, `#${d.id}`);
});

test('M2 — sau khi chạy tệp dọn dữ liệu: danh sách khoá không còn mã hồ sơ gây khoá (khoá thiết bị lẫn khoá IP)', { skip: BO_QUA }, async () => {
  dungCsdl();
  dungDuLieuCu();
  await chayTepDonDuLieu();
  const ds = await canBo('GET', '/chat/blacklist');
  assert.equal(ds.status, 200);
  assert.equal(ds.body.length, 2);
  for (const d of ds.body) assert.doesNotMatch(String(d.reason), MA_HO_SO, `lý do khoá còn mã hồ sơ: ${d.reason}`);
});

test('M2 — tệp dọn dữ liệu không đụng lý do do cán bộ gõ ở đơn khác, và chạy lại lần hai không đổi gì', { skip: BO_QUA }, async () => {
  dungCsdl();
  dungDuLieuCu();
  /* Đơn bị rác tay, lý do cán bộ gõ tình cờ có chữ "hồ sơ" — không phải chuỗi máy ghi */
  themDon(9, { an: 0, may: MAY_Q, status: 'spam', spam: 1, deletedAt: luc(5), rejectionReason: 'Trùng hồ sơ đã xử lý' });
  await chayTepDonDuLieu();
  const truoc = db.prepare('SELECT id, rejection_reason FROM submissions ORDER BY id').all().map((r) => ({ ...r }));
  const khoaTruoc = db.prepare('SELECT id, reason FROM blacklists ORDER BY id').all().map((r) => ({ ...r }));
  assert.equal(truoc.find((r) => r.id === 9).rejection_reason, 'Trùng hồ sơ đã xử lý');
  assert.equal(truoc.find((r) => r.id === 1).rejection_reason, 'bịa đặt');
  await chayTepDonDuLieu();
  assert.deepEqual(db.prepare('SELECT id, rejection_reason FROM submissions ORDER BY id').all().map((r) => ({ ...r })), truoc);
  assert.deepEqual(db.prepare('SELECT id, reason FROM blacklists ORDER BY id').all().map((r) => ({ ...r })), khoaTruoc);
});
