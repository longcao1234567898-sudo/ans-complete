/**
 * PHÂN CÔNG VÀ XEM DANH TÍNH THEO HAI CẤP VAI TRÒ (ADR-003 §1, §3, §5)
 *
 * Thay bài canh BUG-008 (phan-cong-khong-mo-cua-reveal.test.js). Luật cũ
 * "Phó chỉ giao cho cán bộ" tồn tại vì phân công mở cửa /reveal; ADR-003 tách
 * danh tính khỏi phân công nên luật đó bỏ. Những gì VẪN phải đứng:
 *   · cán bộ không gọi được /assign, không bao giờ /reveal được
 *   · staffId phải đúng kiểu, là người có thật, đang hoạt động — với MỌI vai trò
 *   · tin mang cờ chỉ lãnh đạo (tố giác mật, ngoài thẩm quyền) không giao được
 *     cho cán bộ
 *   · mỗi lần giao và mỗi lượt xem danh tính ghi nhật ký đích danh
 *
 * Câu SQL của route chạy NGUYÊN VĂN trên node:sqlite. Tham số đi qua một lớp bắt
 * chước cách mysql2 định dạng giá trị — mảng một phần tử thành giá trị trần,
 * true thành 1 — vì đó là đường lách kiểu dữ liệu.
 */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { datBienMoiTruongHopLe } from './helpers-test.js';
import { BO_QUA, dungCsdl, goi as goiGoc, TRUONG, PHO, CAN_BO, CAN_BO_5 } from './khung-sqlite.js';

datBienMoiTruongHopLe();

const { pool } = await import('../src/db.js');
const { signAccessToken } = await import('../src/lib/token.js');
const { encrypt } = await import('../src/lib/crypto.js');
const { default: adminRouter } = await import('../src/routes/admin/index.js');

const KHOA = 6;        // cán bộ đã bị khoá
const KHONG_CO = 99;   // id không tồn tại

let ctl;
beforeEach(() => {
  if (BO_QUA) return;
  ctl = dungCsdl(pool, { themCau: [`INSERT INTO staff (id, username, full_name, role, is_active) VALUES (6, 'cu', 'Cán bộ đã nghỉ', 'handler', 0)`] });
  /* Bắt chước mysql2: [x] -> x, true/false -> 1/0 */
  const queryCsdl = pool.query;
  const theoMysql2 = (v) => (Array.isArray(v) && v.length === 1 ? theoMysql2(v[0])
    : typeof v === 'boolean' ? Number(v) : v);
  pool.query = (sql, p = []) => queryCsdl(sql, p.map(theoMysql2));

  const them = ctl.db.prepare(`INSERT INTO submissions (id, tracking_code, original_content, category_id, status,
      sender_name, sender_phone, sender_email, is_anonymous, assigned_to, to_giac_mat, ngoai_tham_quyen)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
  them.run(10, 'HS0010', 'Phản ánh đèn đường', 3, 'processing', encrypt('Nguyễn Thị Người Tố Giác'),
    encrypt('0987654321'), encrypt('ntg@example.com'), 0, CAN_BO.id, 0, 0);
  them.run(11, 'HS0011', 'Phản ánh ổ gà', 3, 'processing', encrypt('Trần Văn Tố Giác'),
    encrypt('0912345678'), null, 0, null, 0, 0);
  them.run(12, 'HS0012', 'Tố cáo cán bộ nhận tiền', 1, 'processing', encrypt('Lê Văn Báo'),
    encrypt('0933333333'), null, 0, null, 1, 0);
  them.run(13, 'HS0013', 'Việc ngoài thẩm quyền', 3, 'pending_review', encrypt('Phan Thị Hỏi'),
    encrypt('0944444444'), null, 0, null, 0, 1);
  them.run(14, 'HS0014', 'Tố giác ẩn danh', 1, 'processing', null, null, null, 1, null, 0, 0);
});

const goi = (staff, method, duong, body) => goiGoc({
  duongGoc: '/api/admin', router: adminRouter, staff, signAccessToken, method, duong, body,
});
const giao = (staff, id, staffId) => goi(staff, 'PATCH', `/submissions/${id}/assign`, { staffId });
const xem = (staff, id) => goi(staff, 'POST', `/submissions/${id}/reveal`);
const phuTrach = (id) => ctl.db.prepare('SELECT assigned_to AS g FROM submissions WHERE id = ?').get(id).g;
const nhatKy = (action) => ctl.db.prepare('SELECT * FROM staff_activity_logs WHERE action = ?').all(action);

/* ------------------------------------------------------------------------ */
/* Phân công                                                                 */
/* ------------------------------------------------------------------------ */

for (const lanhDao of [TRUONG, PHO]) {
  test(`${lanhDao.role} giao cho cán bộ, cho lãnh đạo, cho chính mình, bỏ giao -> đều được, ghi nhật ký`, { skip: BO_QUA }, async () => {
    for (const staffId of [CAN_BO_5.id, TRUONG.id, PHO.id, lanhDao.id, null]) {
      const g = await giao(lanhDao, 11, staffId);
      assert.equal(g.status, 200, `staffId=${staffId}: ${g.status} ${g.text}`);
      assert.equal(phuTrach(11), staffId);
    }
    assert.equal(nhatKy('assign').length, 5);
    assert.ok(nhatKy('assign').every((d) => d.staff_id === lanhDao.id), 'phải ghi đích danh người giao');
  });
}

test('cán bộ không gọi được /assign, kể cả tự nhận việc', { skip: BO_QUA }, async () => {
  const g = await giao(CAN_BO, 11, CAN_BO.id);
  assert.equal(g.status, 403);
  assert.equal(phuTrach(11), null);
});

test('tin tố giác mật / ngoài thẩm quyền không giao được cho cán bộ; giao cho lãnh đạo được', { skip: BO_QUA }, async () => {
  for (const id of [12, 13]) {
    const g = await giao(TRUONG, id, CAN_BO.id);
    assert.equal(g.status, 400, `hồ sơ ${id}: ${g.status} ${g.text}`);
    assert.equal(phuTrach(id), null);
    const ok = await giao(TRUONG, id, PHO.id);
    assert.equal(ok.status, 200, ok.text);
  }
});

const KIEU_SAI = [
  ['chuỗi "3"', '3'], ['chuỗi " 3"', ' 3'], ['chuỗi "3abc"', '3abc'], ['mảng [3]', [3]],
  ['mảng ["3"]', ['3']], ['object', { id: 3 }], ['true', true], ['false', false],
  ['số thực 3.5', 3.5], ['0', 0], ['âm -3', -3], ['chuỗi rỗng', ''],
];
for (const [ten, giaTri] of KIEU_SAI) {
  test(`staffId = ${ten} -> 400, không đổi người phụ trách (mọi lãnh đạo)`, { skip: BO_QUA }, async () => {
    for (const lanhDao of [TRUONG, PHO]) {
      const g = await giao(lanhDao, 11, giaTri);
      assert.equal(g.status, 400, `${lanhDao.role}: ${g.status} ${g.text}`);
      assert.equal(phuTrach(11), null);
    }
  });
}

test('thiếu hẳn trường staffId -> 400', { skip: BO_QUA }, async () => {
  const g = await goi(PHO, 'PATCH', '/submissions/11/assign', {});
  assert.equal(g.status, 400);
  assert.equal(phuTrach(11), null);
});

for (const [ten, id] of [['không tồn tại', KHONG_CO], ['đã bị khoá', KHOA]]) {
  test(`giao cho cán bộ ${ten} -> 400, không đổi người phụ trách`, { skip: BO_QUA }, async () => {
    const g = await giao(PHO, 11, id);
    assert.equal(g.status, 400, `${g.status} ${g.text}`);
    assert.equal(phuTrach(11), null);
  });
}

test('trường thừa trong body (vai trò) không đổi quyết định', { skip: BO_QUA }, async () => {
  const g = await goi(CAN_BO, 'PATCH', '/submissions/11/assign', { staffId: CAN_BO.id, role: 'admin' });
  assert.equal(g.status, 403);
});

/* ------------------------------------------------------------------------ */
/* Xem danh tính                                                             */
/* ------------------------------------------------------------------------ */

test('mọi lãnh đạo xem được danh tính, không cần được giao; mỗi lượt ghi nhật ký đích danh', { skip: BO_QUA }, async () => {
  for (const lanhDao of [TRUONG, PHO]) {
    const r = await xem(lanhDao, 11);
    assert.equal(r.status, 200, r.text);
    assert.equal(r.body.sender_name, 'Trần Văn Tố Giác');
  }
  const ds = nhatKy('reveal_identity');
  assert.deepEqual(ds.map((d) => d.staff_id), [TRUONG.id, PHO.id]);
});

test('lãnh đạo xem được danh tính tin tố giác mật', { skip: BO_QUA }, async () => {
  const r = await xem(PHO, 12);
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.sender_name, 'Lê Văn Báo');
});

test('cán bộ không xem được danh tính, kể cả hồ sơ đang giao cho chính mình', { skip: BO_QUA }, async () => {
  const r = await xem(CAN_BO, 10);
  assert.equal(r.status, 403);
  for (const manh of ['Người Tố Giác', '0987654321', 'ntg@example.com']) {
    assert.ok(!r.text.includes(manh), `lộ ${manh}`);
  }
  assert.equal(nhatKy('reveal_identity').length, 0);
});

test('tin ẩn danh: không có danh tính để xem (400), kể cả với Trưởng', { skip: BO_QUA }, async () => {
  const r = await xem(TRUONG, 14);
  assert.equal(r.status, 400);
});
