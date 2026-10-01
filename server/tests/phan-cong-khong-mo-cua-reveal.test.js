/**
 * BUG-008 — Quyền PHÂN CÔNG không được là cửa sau vào /reveal.
 *
 * /reveal cho manager xem danh tính khi `assigned_to` trỏ vào chính họ (H2).
 * Nhưng `assigned_to` do /assign ghi — và manager gọi được /assign. Người bị
 * kiểm và người ghi dữ liệu để kiểm là một: tự giao cho mình, /reveal, giao
 * trả lại người cũ. reveal-scope.test.js không thấy vì nó chỉ canh /reveal
 * đứng một mình với `assigned_to` dựng sẵn.
 *
 * Bài này canh CHUỖI HAI BƯỚC /assign -> /reveal, theo danh sách biến thể
 * (a)–(j) trong hồ sơ BUG. Quy tắc nghiệp vụ đã chốt (hướng A, SEC-DEC-007):
 * chỉ admin giao hồ sơ cho lãnh đạo (admin/manager); manager chỉ giao được
 * cho handler — vai trò vốn không /reveal được (H1) — hoặc bỏ giao.
 *
 * Câu SQL của route chạy NGUYÊN VĂN trên node:sqlite (bài học P23: pool giả trả
 * nguyên hàng bất kể câu SQL thì test nói sai). Tham số đi qua một lớp bắt
 * chước cách mysql2 định dạng giá trị — mảng một phần tử thành giá trị trần,
 * true thành 1 — vì đó chính là đường lách kiểu dữ liệu ở biến thể (f).
 * Node < 22 không có node:sqlite -> BỎ QUA, hiện rõ trong output.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { datBienMoiTruongHopLe } from './helpers-test.js';

datBienMoiTruongHopLe();

const { pool } = await import('../src/db.js');
const { signAccessToken } = await import('../src/lib/token.js');
const { encrypt } = await import('../src/lib/crypto.js');
const { default: adminRouter } = await import('../src/routes/admin/index.js');

const sqlite = await import('node:sqlite').catch(() => null);
const BO_QUA = sqlite ? false : 'cần node:sqlite (Node ≥ 22) để chạy câu SQL thật của route';

const ADMIN   = { id: 1, username: 'admin', role: 'admin',   full_name: 'Trưởng công an' };
const MGR_A   = { id: 2, username: 'mgr2',  role: 'manager', full_name: 'Phó An — được admin giao' };
const MGR_B   = { id: 3, username: 'mgr3',  role: 'manager', full_name: 'Phó Bình — kẻ tấn công' };
const HANDLER = { id: 4, username: 'cb4',   role: 'handler', full_name: 'Cán bộ Dũng' };
const MGR_C   = { id: 5, username: 'mgr5',  role: 'manager', full_name: 'Phó Cường — thông đồng' };
const HANDLER_KHOA = 6;   // handler đã bị khoá
const KHONG_CO = 99;      // id không tồn tại

/* ------------------------------------------------------------------------ */
/* CSDL thật trong bộ nhớ                                                    */
/* ------------------------------------------------------------------------ */

let db;

/* Bắt chước mysql2 (pool.query định dạng phía client bằng sqlstring):
   [x] -> x, true/false -> 1/0. Object -> để nguyên, SQLite ném lỗi như MySQL
   ném lỗi cú pháp. Không bắt chước thì biến thể (f) "xanh" chỉ vì SQLite từ
   chối bind mảng — tức xanh nhờ engine, không nhờ bản vá. */
const theoMysql2 = (v) => (Array.isArray(v) && v.length === 1 ? theoMysql2(v[0])
  : typeof v === 'boolean' ? Number(v) : v === undefined ? null : v);

function dungCsdl() {
  db = new sqlite.DatabaseSync(':memory:');
  for (const q of [
    `CREATE TABLE staff (id INT PRIMARY KEY, full_name TEXT, role TEXT, is_active INT DEFAULT 1)`,
    /* security_level: cột có từ nang_cap_v14.sql. Thiếu cột thì máy chủ coi mọi
       hồ sơ là Mật (BUG-009, fail-safe) và trả 404 trước khi tới luật phân công
       mà tệp này kiểm — nên lược đồ giả phải có cột như CSDL thật. */
    `CREATE TABLE submissions (id INTEGER PRIMARY KEY, sender_name TEXT, sender_phone TEXT,
       sender_email TEXT, is_anonymous INT, assigned_to INT, security_level TEXT DEFAULT 'thuong')`,
    `CREATE TABLE staff_activity_logs (staff_id INT, action TEXT, target_type TEXT, target_id TEXT,
       details TEXT, ip_address TEXT)`,
    `INSERT INTO staff VALUES (1, 'Trưởng công an', 'admin', 1), (2, 'Phó An', 'manager', 1),
       (3, 'Phó Bình', 'manager', 1), (4, 'Cán bộ Dũng', 'handler', 1),
       (5, 'Phó Cường', 'manager', 1), (6, 'Cán bộ đã nghỉ', 'handler', 0)`,
  ]) db.exec(q);

  const them = db.prepare(`INSERT INTO submissions
    (id, sender_name, sender_phone, sender_email, is_anonymous, assigned_to) VALUES (?,?,?,?,?,?)`);
  // #10: có tên, admin đã giao cho Phó An
  them.run(10, encrypt('Nguyễn Thị Người Tố Giác'), encrypt('0987654321'), encrypt('ntg@example.com'), 0, MGR_A.id);
  // #11: có tên, CHƯA TỪNG giao cho ai — biến thể (e), tình huống phổ biến nhất
  them.run(11, encrypt('Trần Văn Tố Giác'), encrypt('0912345678'), null, 0, null);

  pool.query = async (sql, p = []) => {
    const st = db.prepare(String(sql));
    const thamSo = p.map(theoMysql2);
    if (/^\s*SELECT/i.test(String(sql))) return [st.all(...thamSo).map((r) => ({ ...r })), []];
    const r = st.run(...thamSo);
    return [{ affectedRows: Number(r.changes), insertId: Number(r.lastInsertRowid) }, []];
  };
}

const phuTrach = (id) => db.prepare('SELECT assigned_to FROM submissions WHERE id = ?').get(id).assigned_to;
const nhatKy = (action) => db.prepare('SELECT * FROM staff_activity_logs WHERE action = ?').all(action);

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
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let json = {};
    try { json = JSON.parse(text); } catch { /* để trống */ }
    return { status: res.status, body: json, text };
  } finally {
    server.close();
  }
}

const giao = (staff, id, staffId) => goi(staff, 'PATCH', `/submissions/${id}/assign`, { staffId });
const xem = (staff, id) => goi(staff, 'POST', `/submissions/${id}/reveal`);

/** /reveal bị chặn VÀ không có mảnh danh tính nào trong response */
function khongLoDanhTinh(r, loiNhan = '') {
  assert.equal(r.status, 403, `${loiNhan} /reveal phải 403, nhận ${r.status}`);
  for (const manh of ['Người Tố Giác', 'Tố Giác', '0987654321', '0912345678', 'ntg@example.com']) {
    assert.ok(!r.text.includes(manh), `${loiNhan} response lộ danh tính: ${manh}`);
  }
}

/* ------------------------------------------------------------------------ */
/* (a) Kịch bản gốc                                                          */
/* ------------------------------------------------------------------------ */

test('(a) manager tự giao hồ sơ người khác phụ trách cho mình -> bị từ chối, /reveal vẫn 403', { skip: BO_QUA }, async () => {
  dungCsdl();
  khongLoDanhTinh(await xem(MGR_B, 10), 'Đối chứng trước khi giao:');

  const g = await giao(MGR_B, 10, MGR_B.id);
  assert.equal(g.status, 403, `Tự giao cho mình phải 403, nhận ${g.status}`);
  assert.equal(phuTrach(10), MGR_A.id, 'Người phụ trách không được đổi');

  khongLoDanhTinh(await xem(MGR_B, 10), 'Sau khi thử tự giao:');
  assert.equal(nhatKy('reveal_identity').length, 0, 'Không được có lượt xem danh tính nào');
});

/* ------------------------------------------------------------------------ */
/* (b) Hai manager thông đồng — bản vá chỉ cấm "tự giao" sẽ hở ở đây         */
/* ------------------------------------------------------------------------ */

test('(b) manager giao cho manager khác -> bị từ chối, cả hai chiều', { skip: BO_QUA }, async () => {
  dungCsdl();
  for (const [nguoiGiao, nguoiNhan] of [[MGR_B, MGR_C], [MGR_C, MGR_B]]) {
    const g = await giao(nguoiGiao, 11, nguoiNhan.id);
    assert.equal(g.status, 403, `${nguoiGiao.username} giao cho ${nguoiNhan.username} phải 403, nhận ${g.status}`);
    assert.equal(phuTrach(11), null);
    khongLoDanhTinh(await xem(nguoiNhan, 11), `${nguoiNhan.username} sau khi được đồng nghiệp giao:`);
  }
});

test('(b) manager giao cho admin -> cũng bị từ chối (chỉ admin giao hồ sơ cho lãnh đạo)', { skip: BO_QUA }, async () => {
  dungCsdl();
  const g = await giao(MGR_B, 11, ADMIN.id);
  assert.equal(g.status, 403, `Nhận ${g.status}`);
  assert.equal(phuTrach(11), null);
});

test('(b) manager ĐANG được admin giao hồ sơ vẫn không chuyển được hồ sơ đó cho manager khác', { skip: BO_QUA }, async () => {
  dungCsdl();
  const g = await giao(MGR_A, 10, MGR_B.id);
  assert.equal(g.status, 403, `Nhận ${g.status}`);
  assert.equal(phuTrach(10), MGR_A.id);
  khongLoDanhTinh(await xem(MGR_B, 10));
});

/* ------------------------------------------------------------------------ */
/* (c) Tài khoản trung gian là handler — được giao, nhưng H1 phải chặn       */
/* ------------------------------------------------------------------------ */

test('(c) manager giao cho handler -> được phép; handler vẫn không /reveal được (H1)', { skip: BO_QUA }, async () => {
  dungCsdl();
  const g = await giao(MGR_B, 11, HANDLER.id);
  assert.equal(g.status, 200, `Giao cho handler là việc hằng ngày của lãnh đạo, phải được. Nhận ${g.status}: ${g.text}`);
  assert.equal(phuTrach(11), HANDLER.id);
  khongLoDanhTinh(await xem(HANDLER, 11), 'Handler được giao:');
  khongLoDanhTinh(await xem(MGR_B, 11), 'Manager đã giao cho handler:');
});

/* ------------------------------------------------------------------------ */
/* (d) Gỡ phân công rồi gán lại                                              */
/* ------------------------------------------------------------------------ */

test('(d) manager bỏ giao được, nhưng gán lại cho mình sau đó vẫn bị từ chối', { skip: BO_QUA }, async () => {
  dungCsdl();
  const bo = await giao(MGR_B, 10, null);
  assert.equal(bo.status, 200, `Bỏ giao phải được. Nhận ${bo.status}: ${bo.text}`);
  assert.equal(phuTrach(10), null);

  const g = await giao(MGR_B, 10, MGR_B.id);
  assert.equal(g.status, 403, `Nhận ${g.status}`);
  assert.equal(phuTrach(10), null);
  khongLoDanhTinh(await xem(MGR_B, 10));
});

/* ------------------------------------------------------------------------ */
/* (e) Hồ sơ chưa từng phân công                                             */
/* ------------------------------------------------------------------------ */

test('(e) hồ sơ chưa từng giao cho ai -> manager tự nhận vẫn bị từ chối', { skip: BO_QUA }, async () => {
  dungCsdl();
  const g = await giao(MGR_B, 11, MGR_B.id);
  assert.equal(g.status, 403, `Nhận ${g.status}`);
  assert.equal(phuTrach(11), null);
  khongLoDanhTinh(await xem(MGR_B, 11));
});

/* ------------------------------------------------------------------------ */
/* (f) Kiểu dữ liệu staffId — MySQL tự ép kiểu khi UPDATE                    */
/* ------------------------------------------------------------------------ */

/* Mọi giá trị không phải số nguyên dương (hoặc null để bỏ giao) đều 400.
   Allow-list kiểu: không liệt kê kiểu xấu, chỉ nhận kiểu tốt. */
const KIEU_LA = [
  ['chuỗi "3"', '3'], ['chuỗi " 3"', ' 3'], ['chuỗi "3abc"', '3abc'], ['chuỗi "03"', '03'],
  ['mảng [3]', [3]], ['mảng ["3"]', ['3']], ['object', { toString: '3' }],
  ['true', true], ['false', false], ['số thực 3.5', 3.5], ['0', 0], ['âm -3', -3],
  ['chuỗi rỗng', ''], ['thiếu hẳn trường staffId', undefined],
];

for (const [ten, giaTri] of KIEU_LA) {
  test(`(f) manager gửi staffId = ${ten} -> 400, không đổi người phụ trách, /reveal vẫn 403`, { skip: BO_QUA }, async () => {
    dungCsdl();
    const body = giaTri === undefined ? {} : { staffId: giaTri };
    const g = await goi(MGR_B, 'PATCH', '/submissions/10/assign', body);
    assert.equal(g.status, 400, `Nhận ${g.status}: ${g.text}`);
    assert.equal(phuTrach(10), MGR_A.id, 'Kiểu lạ không được làm đổi người phụ trách');
    khongLoDanhTinh(await xem(MGR_B, 10));
  });
}

test('(f) admin cũng phải gửi đúng kiểu — kiểm kiểu không phân biệt vai trò', { skip: BO_QUA }, async () => {
  dungCsdl();
  const g = await giao(ADMIN, 11, String(MGR_A.id));
  assert.equal(g.status, 400, `Nhận ${g.status}`);
  assert.equal(phuTrach(11), null);
});

/* staffId phải là cán bộ CÓ THẬT, ĐANG HOẠT ĐỘNG — vai trò đọc từ CSDL, không từ client */
for (const [ten, id] of [['không tồn tại', KHONG_CO], ['đã bị khoá', HANDLER_KHOA]]) {
  for (const cb of [ADMIN, MGR_B]) {
    test(`(f) ${cb.role} giao cho cán bộ ${ten} -> 400, không đổi người phụ trách`, { skip: BO_QUA }, async () => {
      dungCsdl();
      const g = await giao(cb, 11, id);
      assert.equal(g.status, 400, `Nhận ${g.status}: ${g.text}`);
      assert.equal(phuTrach(11), null);
    });
  }
}

/* (g) Không có cột thời điểm phân công do client gửi — không áp dụng. Canh
   để nếu sau này thêm trường nào vào body cũng không làm lệch quyết định. */
test('(g) trường thừa trong body (vai trò, thời điểm) không ảnh hưởng quyết định', { skip: BO_QUA }, async () => {
  dungCsdl();
  const g = await goi(MGR_B, 'PATCH', '/submissions/11/assign',
    { staffId: MGR_B.id, role: 'handler', targetRole: 'handler', assignedAt: '2020-01-01' });
  assert.equal(g.status, 403, `Nhận ${g.status}`);
  assert.equal(phuTrach(11), null);
});

/* ------------------------------------------------------------------------ */
/* (h) Không hồi quy                                                         */
/* ------------------------------------------------------------------------ */

test('(h) admin giao hồ sơ cho manager -> manager đó /reveal được (uỷ quyền hợp lệ)', { skip: BO_QUA }, async () => {
  dungCsdl();
  const g = await giao(ADMIN, 11, MGR_B.id);
  assert.equal(g.status, 200, `Nhận ${g.status}: ${g.text}`);
  assert.equal(phuTrach(11), MGR_B.id);

  const r = await xem(MGR_B, 11);
  assert.equal(r.status, 200);
  assert.equal(r.body.sender_name, 'Trần Văn Tố Giác');
  assert.equal(nhatKy('reveal_identity').length, 1, 'Lượt xem hợp lệ vẫn phải ghi nhật ký');
});

test('(h) manager đã được admin giao từ trước vẫn /reveal được', { skip: BO_QUA }, async () => {
  dungCsdl();
  const r = await xem(MGR_A, 10);
  assert.equal(r.status, 200);
  assert.equal(r.body.sender_phone, '0987654321');
});

test('(h) admin giao cho handler, cho admin khác, bỏ giao -> đều được; nhật ký assign vẫn ghi', { skip: BO_QUA }, async () => {
  dungCsdl();
  for (const staffId of [HANDLER.id, ADMIN.id, null]) {
    const g = await giao(ADMIN, 10, staffId);
    assert.equal(g.status, 200, `staffId=${staffId}: nhận ${g.status}: ${g.text}`);
    assert.equal(phuTrach(10), staffId);
  }
  assert.equal(nhatKy('assign').length, 3);
});

test('(h) handler vẫn không gọi được /assign (H1 không đổi)', { skip: BO_QUA }, async () => {
  dungCsdl();
  const g = await giao(HANDLER, 11, HANDLER.id);
  assert.equal(g.status, 403);
  assert.equal(phuTrach(11), null);
});

/* ------------------------------------------------------------------------ */
/* (j) Lần thử bị từ chối vì vai trò phải để lại dấu vết                    */
/* ------------------------------------------------------------------------ */

test('(j) manager thử giao cho lãnh đạo -> ghi nhật ký đích danh người thử, không ghi như một lần giao thành công', { skip: BO_QUA }, async () => {
  dungCsdl();
  await giao(MGR_B, 10, MGR_B.id);
  await giao(MGR_B, 11, MGR_C.id);

  assert.equal(nhatKy('assign').length, 0, 'Lần bị từ chối không được ghi như một lần giao');
  const tuChoi = nhatKy('assign_denied');
  assert.equal(tuChoi.length, 2, 'Mỗi lần thử bị từ chối phải có một dòng nhật ký');
  assert.ok(tuChoi.every((d) => d.staff_id === MGR_B.id), 'Phải ghi đích danh ai đã thử');
  assert.deepEqual(tuChoi.map((d) => JSON.parse(d.details).assignedTo), [MGR_B.id, MGR_C.id]);
});
