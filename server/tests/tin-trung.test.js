/**
 * VIỆC 18–20 (ADR-003) — TIN TRÙNG
 *
 *   18. Danh mục Tin trùng ở sàng lọc: nhóm hiện thành một hàng; mở ra có ô
 *       đánh dấu để xác nhận / đánh tin giả HÀNG LOẠT, hoặc xử lý từng tin.
 *       Gộp chỉ để hiển thị: mỗi tin giữ mã tra cứu, phòng trao đổi, người phụ
 *       trách, ghi chú riêng; thao tác hàng loạt ghi nhật ký TỪNG tin.
 *   19. Tin trùng ở phần xử lý: cùng danh mục, theo phần.
 *   20. Không gộp với tin đã xử lý xong hoặc đã từ chối.
 */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { datBienMoiTruongHopLe } from './helpers-test.js';
import { BO_QUA, dungCsdl, goi as goiGoc, donCoTen, TRUONG, CAN_BO, MAY_A } from './khung-sqlite.js';

datBienMoiTruongHopLe();

const { pool } = await import('../src/db.js');
const { signAccessToken } = await import('../src/lib/token.js');
const { default: adminRouter } = await import('../src/routes/admin/index.js');
const { default: submissionsRouter } = await import('../src/routes/submissions.js');

let ctl;
beforeEach(() => { if (!BO_QUA) ctl = dungCsdl(pool); });
const goi = (staff, method, duong, body) => goiGoc({
  duongGoc: '/api/admin', router: adminRouter, staff, signAccessToken, method, duong, body,
});
const guiDan = (body) => goiGoc({ duongGoc: '/api/submissions', router: submissionsRouter, method: 'POST', duong: '/', body });
const hang = (id) => ctl.db.prepare('SELECT * FROM submissions WHERE id = ?').get(id);
const dong = (action) => ctl.db.prepare('SELECT * FROM staff_activity_logs WHERE action = ?').all(action);

const VU_CHAY = 'Cháy lớn ở kho hàng cuối ngõ 7 khu phố 1, khói đen bốc cao, nhiều người đang dập lửa bằng xô nước.';
const VU_CHAY_2 = 'Kho hàng cuối ngõ 7 khu phố 1 đang cháy lớn, khói đen nhiều lắm, bà con dùng xô nước dập lửa.';

/* ---- Việc 20: chỉ gộp với tin còn mở -------------------------------------- */

for (const trangThai of ['resolved', 'rejected']) {
  test(`tin mới không gộp vào tin đã ${trangThai === 'resolved' ? 'xử lý xong' : 'từ chối'}`, { skip: BO_QUA }, async () => {
    ctl.db.prepare(`INSERT INTO submissions (id, tracking_code, original_content, category_id, status, ward_id, created_at)
                    VALUES (1, 'HS0001', ?, 3, ?, 1, ?)`).run(VU_CHAY, trangThai, ctl.luc(5));
    const r = await guiDan(donCoTen(0, { content: VU_CHAY_2, wardId: 1 }));
    assert.equal(r.status, 201, r.text.slice(0, 200));
    const moi = ctl.db.prepare('SELECT incident_group_id FROM submissions WHERE tracking_code = ?').get(r.body.trackingCode);
    assert.equal(moi.incident_group_id, null, 'tin mới bị chôn theo vụ đã đóng');
    assert.equal(ctl.db.prepare('SELECT COUNT(*) AS n FROM incident_groups').get().n, 0);
  });
}

test('không hồi quy: tin mới vẫn gộp với tin cùng vụ đang chờ sàng lọc', { skip: BO_QUA }, async () => {
  ctl.db.prepare(`INSERT INTO submissions (id, tracking_code, original_content, category_id, status, ward_id, created_at)
                  VALUES (1, 'HS0001', ?, 3, 'received', 1, ?)`).run(VU_CHAY, ctl.luc(5));
  const r = await guiDan(donCoTen(0, { content: VU_CHAY_2, wardId: 1 }));
  const moi = ctl.db.prepare('SELECT incident_group_id FROM submissions WHERE tracking_code = ?').get(r.body.trackingCode);
  assert.ok(moi.incident_group_id);
  assert.equal(hang(1).incident_group_id, moi.incident_group_id);
});

/* ---- Việc 18, 19: danh mục Tin trùng theo phần ---------------------------- */

/** Nhóm 7: ba tin chờ sàng lọc (một gần như giống hệt). Nhóm 8: hai tin đang xử lý.
    Nhóm 9: có một tin tố giác mật — cán bộ không được thấy cả nhóm. */
function dungNhom() {
  const g = ctl.db.prepare(`INSERT INTO incident_groups (id, ward_id, category_id, first_submission_id, submission_count,
      first_reported_at, last_reported_at) VALUES (?, 1, 3, ?, ?, ?, ?)`);
  g.run(7, 10, 3, ctl.luc(30), ctl.luc(10));
  g.run(8, 20, 2, ctl.luc(300), ctl.luc(290));
  g.run(9, 30, 2, ctl.luc(60), ctl.luc(50));
  const s = ctl.db.prepare(`INSERT INTO submissions (id, tracking_code, original_content, category_id, status, is_anonymous,
      device_id, ward_id, incident_group_id, to_giac_mat, assigned_to, created_at) VALUES (?,?,?,3,?,?,?,1,?,?,?,?)`);
  s.run(10, 'HS0010', VU_CHAY, 'received', 0, MAY_A, 7, 0, null, ctl.luc(30));
  s.run(11, 'HS0011', VU_CHAY_2, 'received', 0, null, 7, 0, null, ctl.luc(20));
  s.run(12, 'HS0012', `${VU_CHAY} `, 'received', 0, null, 7, 0, CAN_BO.id, ctl.luc(10));
  s.run(20, 'HS0020', 'Ổ gà lớn trước cổng trường tiểu học thôn Đông', 'processing', 0, null, 8, 0, null, ctl.luc(300));
  s.run(21, 'HS0021', 'Trước cổng trường tiểu học thôn Đông có ổ gà lớn', 'processing', 0, null, 8, 0, null, ctl.luc(290));
  s.run(30, 'HS0030', 'Tin thường trong nhóm', 'received', 0, null, 9, 0, null, ctl.luc(60));
  s.run(31, 'HS0031', 'Tố cáo công an xã nhận tiền', 'received', 0, null, 9, 1, null, ctl.luc(50));
  s.run(32, 'HS0032', 'Tin thường thứ hai trong nhóm', 'received', 0, null, 9, 0, null, ctl.luc(40));
}

test('Tin trùng ở sàng lọc: nhóm hiện một hàng, đếm số tin đang chờ, báo nội dung gần như giống hệt', { skip: BO_QUA }, async () => {
  dungNhom();
  const r = await goi(CAN_BO, 'GET', '/submissions/tin-trung?phan=sang_loc');
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(r.body.data.map((g) => g.id), [7]);
  assert.equal(r.body.data[0].so_tin, 3);
  assert.equal(r.body.data[0].gan_nhu_giong, true);
});

test('Tin trùng ở phần xử lý: chỉ nhóm có tin đang xử lý', { skip: BO_QUA }, async () => {
  dungNhom();
  const r = await goi(CAN_BO, 'GET', '/submissions/tin-trung?phan=xu_ly');
  assert.deepEqual(r.body.data.map((g) => g.id), [8]);
});

test('nhóm có tin cán bộ không được xem thì ẩn cả nhóm; lãnh đạo vẫn thấy', { skip: BO_QUA }, async () => {
  dungNhom();
  assert.ok(!(await goi(CAN_BO, 'GET', '/submissions/tin-trung?phan=sang_loc')).body.data.some((g) => g.id === 9),
    'nhóm chứa tin tố giác mật lộ ra cho cán bộ');
  assert.equal((await goi(CAN_BO, 'GET', '/incident-groups/9')).status, 404);
  const ld = (await goi(TRUONG, 'GET', '/submissions/tin-trung?phan=sang_loc')).body.data.find((g) => g.id === 9);
  assert.equal(ld?.so_tin, 2, 'lãnh đạo thấy nhóm, đếm hai tin đang chờ sàng lọc (tin mật ở phần riêng)');
});

test('Tin trùng: phần lạ hoặc phần chỉ lãnh đạo -> 400', { skip: BO_QUA }, async () => {
  assert.equal((await goi(TRUONG, 'GET', '/submissions/tin-trung?phan=khong_co')).status, 400);
  assert.equal((await goi(TRUONG, 'GET', '/submissions/tin-trung?phan=to_giac_mat')).status, 400);
});

test('mở nhóm: từng tin kèm trạng thái sàng lọc, người phụ trách giữ nguyên', { skip: BO_QUA }, async () => {
  dungNhom();
  const r = await goi(CAN_BO, 'GET', '/incident-groups/7');
  assert.equal(r.status, 200, r.text);
  const m = Object.fromEntries(r.body.members.map((x) => [x.tracking_code, x]));
  assert.equal(m.HS0010.dang_cho_sang_loc, true);
  assert.equal(m.HS0012.assigned_name, 'Cán bộ Bốn');
});

/* ---- Thao tác hàng loạt ------------------------------------------------- */

const hangLoat = (staff, body) => goi(staff, 'POST', '/submissions/sang-loc-hang-loat', body);

test('xác nhận hàng loạt: mỗi tin vào xử lý, mỗi tin một dòng nhật ký; tin không ở hàng sàng lọc báo riêng', { skip: BO_QUA }, async () => {
  dungNhom();
  const r = await hangLoat(CAN_BO, { ids: [10, 11, 20], hanhDong: 'xac_nhan' });
  assert.equal(r.status, 200, r.text);
  const kq = Object.fromEntries(r.body.ketQua.map((k) => [k.id, k.status]));
  assert.deepEqual(kq, { 10: 200, 11: 200, 20: 409 });
  assert.equal(hang(10).status, 'processing');
  assert.equal(hang(11).status, 'processing');
  assert.equal(dong('sang_loc_xac_nhan').length, 2);
  assert.equal(hang(10).incident_group_id, 7, 'gộp chỉ để hiển thị — tin vẫn nằm trong nhóm');
});

test('đánh tin giả hàng loạt: bắt lý do, không khoá máy', { skip: BO_QUA }, async () => {
  dungNhom();
  assert.equal((await hangLoat(CAN_BO, { ids: [10, 11], hanhDong: 'tin_gia' })).status, 400);
  const r = await hangLoat(CAN_BO, { ids: [10, 11], hanhDong: 'tin_gia', ghiChu: 'Một người gửi lặp lại, nội dung bịa' });
  assert.equal(r.status, 200, r.text);
  assert.ok(hang(10).deleted_at && hang(11).deleted_at);
  assert.equal(ctl.db.prepare('SELECT COUNT(*) AS n FROM blacklists').get().n, 0);
  assert.equal(dong('sang_loc_tin_gia').length, 2);
});

test('hàng loạt: tin cán bộ không xem được -> 404 riêng tin đó, không đổi gì', { skip: BO_QUA }, async () => {
  dungNhom();
  const r = await hangLoat(CAN_BO, { ids: [31, 30], hanhDong: 'xac_nhan' });
  assert.deepEqual(Object.fromEntries(r.body.ketQua.map((k) => [k.id, k.status])), { 31: 404, 30: 200 });
  assert.equal(hang(31).status, 'received');
});

for (const [ten, body] of [
  ['không có danh sách', { hanhDong: 'xac_nhan' }],
  ['danh sách rỗng', { ids: [], hanhDong: 'xac_nhan' }],
  ['quá 50 tin', { ids: Array.from({ length: 51 }, (_, i) => i + 1), hanhDong: 'xac_nhan' }],
  ['mã không phải số nguyên', { ids: [10, '11; DROP'], hanhDong: 'xac_nhan' }],
  ['thao tác không cho làm hàng loạt', { ids: [10], hanhDong: 'ngoai_tham_quyen' }],
]) {
  test(`hàng loạt: ${ten} -> 400, không đổi gì`, { skip: BO_QUA }, async () => {
    dungNhom();
    assert.equal((await hangLoat(CAN_BO, body)).status, 400);
    assert.equal(hang(10).status, 'received');
  });
}
