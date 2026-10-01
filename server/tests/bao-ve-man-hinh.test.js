/**
 * VIỆC 26 (ADR-003) — HẠN CHẾ CHỤP, QUAY MÀN HÌNH TRANG CÁN BỘ
 *
 * Trang web KHÔNG chặn tuyệt đối được việc chụp/quay màn hình (trình duyệt
 * không cho quyền đó; luôn chụp được bằng một điện thoại khác). Mục tiêu thực
 * tế là RĂN ĐE và TRUY VẾT: chữ chìm mang tên người xem trên nội dung, và ghi
 * nhật ký khi bắt được phím chụp màn hình hoặc lệnh in. Phần máy chủ: một
 * route ghi nhật ký, kiểu sự kiện là allow-list.
 */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { datBienMoiTruongHopLe } from './helpers-test.js';
import { BO_QUA, dungCsdl, goi as goiGoc, CAN_BO } from './khung-sqlite.js';

datBienMoiTruongHopLe();

const { pool } = await import('../src/db.js');
const { signAccessToken } = await import('../src/lib/token.js');
const { default: adminRouter } = await import('../src/routes/admin/index.js');

let ctl;
beforeEach(() => { if (!BO_QUA) ctl = dungCsdl(pool); });
const goi = (staff, body) => goiGoc({
  duongGoc: '/api/admin', router: adminRouter, staff, signAccessToken, method: 'POST', duong: '/su-kien-man-hinh', body,
});
const dong = () => ctl.db.prepare(`SELECT * FROM staff_activity_logs WHERE action = 'screen_capture_attempt'`).all();

test('bắt được phím chụp màn hình -> ghi nhật ký đích danh, kèm trang đang xem', { skip: BO_QUA }, async () => {
  const r = await goi(CAN_BO, { loai: 'phim_chup_man_hinh', duong: '/quan-tri/y-kien/12' });
  assert.equal(r.status, 204, r.text);
  const d = dong();
  assert.equal(d.length, 1);
  assert.equal(d[0].staff_id, CAN_BO.id);
  assert.deepEqual(JSON.parse(d[0].details), { loai: 'phim_chup_man_hinh', duong: '/quan-tri/y-kien/12' });
});

test('lệnh in trang -> ghi nhật ký', { skip: BO_QUA }, async () => {
  assert.equal((await goi(CAN_BO, { loai: 'in_trang', duong: '/quan-tri' })).status, 204);
  assert.equal(dong().length, 1);
});

test('bấm liên tục trong 1 phút -> gộp thành một dòng', { skip: BO_QUA }, async () => {
  for (let i = 0; i < 5; i++) await goi(CAN_BO, { loai: 'phim_chup_man_hinh', duong: '/quan-tri' });
  assert.equal(dong().length, 1);
});

test('kiểu sự kiện lạ, đường dẫn không phải trang cán bộ -> 400, không ghi', { skip: BO_QUA }, async () => {
  assert.equal((await goi(CAN_BO, { loai: 'xoa_nhat_ky' })).status, 400);
  assert.equal((await goi(CAN_BO, { loai: 'in_trang', duong: 'https://evil.example/x' })).status, 400);
  assert.equal((await goi(CAN_BO, { loai: 'in_trang', duong: { a: 1 } })).status, 400);
  assert.equal(dong().length, 0);
});

test('không đăng nhập -> 401', { skip: BO_QUA }, async () => {
  assert.equal((await goi(null, { loai: 'in_trang', duong: '/quan-tri' })).status, 401);
});
