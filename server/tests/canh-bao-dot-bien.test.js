/**
 * VIỆC 25 (ADR-003) — THEO DÕI SỐ ĐƠN BẤT THƯỜNG THEO ĐỊA BÀN
 *
 * So số tin mỗi địa bàn trong 30 phút với mức thường (7 ngày trước); vượt
 * ngưỡng thì hiện cảnh báo cho cán bộ kèm danh sách các tin. Đột biến có thể
 * là phá hoại, cũng có thể là sự việc thật nhiều người cùng báo — nên CHỈ
 * CẢNH BÁO, không chặn. Cảnh báo ghi vào nhật ký — KHÔNG kèm IP người gửi
 * (cảnh báo sinh ra trong lúc nhận tin của người dân).
 */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { datBienMoiTruongHopLe } from './helpers-test.js';
import { BO_QUA, dungCsdl, goi as goiGoc, donCoTen, TRUONG, CAN_BO } from './khung-sqlite.js';

datBienMoiTruongHopLe();

const { pool } = await import('../src/db.js');
const { signAccessToken } = await import('../src/lib/token.js');
const { default: submissionsRouter } = await import('../src/routes/submissions.js');
const { default: adminRouter } = await import('../src/routes/admin/index.js');

let ctl;
beforeEach(() => { if (!BO_QUA) ctl = dungCsdl(pool); });

const gui = (body) => goiGoc({ duongGoc: '/api/submissions', router: submissionsRouter, method: 'POST', duong: '/', body });
const goi = (staff, duong) => goiGoc({ duongGoc: '/api/admin', router: adminRouter, staff, signAccessToken, method: 'GET', duong });
const canhBao = () => ctl.db.prepare('SELECT * FROM canh_bao_dot_bien').all();

let soMa = 0;
function themTin(soLuong, { ward = 1, phutTruoc = 10, mat = 0 } = {}) {
  const them = ctl.db.prepare(`INSERT INTO submissions (tracking_code, original_content, category_id, status, ward_id,
      to_giac_mat, created_at) VALUES (?, 'Tin đã có', 3, 'received', ?, ?, ?)`);
  for (let i = 0; i < soLuong; i++) them.run(`ZZ${String(soMa++).padStart(4, '0')}`, ward, mat, ctl.luc(phutTruoc + i * 0.1));
}

test('5 tin cùng địa bàn trong 30 phút (mức thường 0) -> một cảnh báo, ghi nhật ký không kèm IP', { skip: BO_QUA }, async () => {
  themTin(4);
  const r = await gui(donCoTen(0, { wardId: 1 }));
  assert.equal(r.status, 201, r.text.slice(0, 200));
  const cb = canhBao();
  assert.equal(cb.length, 1);
  assert.equal(cb[0].so_tin, 5);
  assert.equal(cb[0].ward_id, 1);
  const nk = ctl.db.prepare(`SELECT * FROM staff_activity_logs WHERE action = 'canh_bao_dot_bien'`).all();
  assert.equal(nk.length, 1);
  assert.equal(nk[0].staff_id, null);
  assert.ok(!nk[0].ip_address, 'nhật ký cảnh báo ghi IP của người dân vừa gửi');
});

test('tin thứ 6, 7 trong cùng khung 30 phút -> không thêm cảnh báo trùng', { skip: BO_QUA }, async () => {
  themTin(4);
  await gui(donCoTen(0, { wardId: 1 }));
  await gui(donCoTen(1, { wardId: 1 }));
  await gui(donCoTen(2, { wardId: 1 }));
  assert.equal(canhBao().length, 1);
});

test('4 tin -> không cảnh báo', { skip: BO_QUA }, async () => {
  themTin(3);
  await gui(donCoTen(0, { wardId: 1 }));
  assert.equal(canhBao().length, 0);
});

test('địa bàn vốn đông tin: ngưỡng theo mức thường, 6 tin chưa đủ', { skip: BO_QUA }, async () => {
  themTin(700, { phutTruoc: 3 * 24 * 60 });   // ~2 tin / 30 phút trong 7 ngày -> ngưỡng 7
  themTin(5);
  await gui(donCoTen(0, { wardId: 1 }));
  assert.equal(canhBao().length, 0);
});

test('tin không có địa bàn, hoặc địa bàn khác -> không cảnh báo', { skip: BO_QUA }, async () => {
  themTin(4, { ward: 2 });
  await gui(donCoTen(0, { wardId: 1 }));
  await gui(donCoTen(1));
  assert.equal(canhBao().length, 0);
});

test('gửi tin vẫn thành công khi chưa có bảng cảnh báo (chưa chạy v30)', { skip: BO_QUA }, async () => {
  ctl.db.exec('DROP TABLE canh_bao_dot_bien');
  themTin(4);
  const r = await gui(donCoTen(0, { wardId: 1 }));
  assert.equal(r.status, 201, r.text.slice(0, 200));
});

test('cán bộ xem cảnh báo kèm danh sách tin; tin không được xem thì không hiện, cũng không được đếm', { skip: BO_QUA }, async () => {
  themTin(4);
  themTin(2, { mat: 1 });
  await gui(donCoTen(0, { wardId: 1 }));
  assert.equal(canhBao().length, 1);

  const ld = await goi(TRUONG, '/dashboard/canh-bao-dot-bien');
  assert.equal(ld.status, 200, ld.text);
  assert.equal(ld.body.data.length, 1);
  assert.equal(ld.body.data[0].tin.length, 7);
  assert.equal(ld.body.data[0].ward_name, 'Khu phố 1');

  const cb = await goi(CAN_BO, '/dashboard/canh-bao-dot-bien');
  assert.equal(cb.status, 200);
  assert.equal(cb.body.data[0].tin.length, 5, 'cán bộ thấy tin tố giác mật trong danh sách cảnh báo');
  assert.equal(cb.body.data[0].so_tin, 5, 'số đếm lộ ra có tin cán bộ không được xem');
});

/* Ngưỡng tối thiểu là số công khai: cán bộ thấy một cảnh báo mà mình chỉ đọc
   được dưới ngưỡng tin là biết có tin mình không được xem (kiểu rò của BUG-009).
   Nên cán bộ chỉ thấy cảnh báo khi riêng số tin mình xem được đã chạm ngưỡng. */
test('cán bộ: số tin mình xem được chưa chạm ngưỡng -> ẩn cả cảnh báo', { skip: BO_QUA }, async () => {
  themTin(1);
  themTin(3, { mat: 1 });
  await gui(donCoTen(0, { wardId: 1 }));
  assert.equal(canhBao().length, 1);
  assert.equal((await goi(CAN_BO, '/dashboard/canh-bao-dot-bien')).body.data.length, 0);
  assert.equal((await goi(TRUONG, '/dashboard/canh-bao-dot-bien')).body.data.length, 1);
});
