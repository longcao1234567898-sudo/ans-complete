/**
 * VIỆC 12 (ADR-003) — PHẦN TIN TỐ GIÁC MẬT
 *
 * Tin tố cáo cán bộ / người nhà nước vào THẲNG phần chỉ lãnh đạo xem ngay lúc
 * nhận, không qua sàng lọc (người sàng lọc có thể là người bị tố cáo). Cán bộ
 * chuyển tin vào được, không chuyển ra được; lãnh đạo đưa ra được khi bộ từ
 * khoá bắt dư. Mọi lần chuyển ghi nhật ký.
 */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { datBienMoiTruongHopLe } from './helpers-test.js';
import { BO_QUA, dungCsdl, goi as goiGoc, donCoTen, TRUONG, PHO, CAN_BO } from './khung-sqlite.js';

datBienMoiTruongHopLe();

const { pool } = await import('../src/db.js');
const { signAccessToken } = await import('../src/lib/token.js');
const { default: submissionsRouter } = await import('../src/routes/submissions.js');
const { default: adminRouter } = await import('../src/routes/admin/index.js');
const { nhanDienToGiacMat } = await import('../src/lib/to-giac-mat.js');

/* ---- Bộ nhận diện ---------------------------------------------------- */

const MAT = [
  'Công an xã nhận tiền của chủ quán karaoke mỗi tháng nên quán mở tới sáng không ai xử lý.',
  'can bo dia chinh voi tien moi lam so do cho dan, khong dua thi de ho so do',
  'Trưởng thôn bảo kê cho bãi cát lậu ven sông, xe tải chạy cả đêm.',
  'Tôi tố cáo việc tham nhũng tiền hỗ trợ lũ lụt ở thôn Đông.',
  'Có người nói phải chạy án mới được giảm nhẹ, đã đưa 50 triệu.',
  'Chủ tịch UBND xã làm ngơ cho nhà hàng xóm lấn chiếm đất công.',
];
const THUONG = [
  'Tôi muốn báo công an về vụ trộm xe máy tối qua ở ngõ 5.',
  'Nhà hàng xóm đòi tiền nợ, đe doạ đánh con tôi.',
  'Đèn đường hỏng hai tuần, mong cán bộ phường xem giúp. Quán bên cạnh mở nhạc to, đòi tiền khách quá giá.',
];

for (const c of MAT) {
  test(`nhận diện tố giác mật: "${c.slice(0, 40)}…"`, () => {
    const kq = nhanDienToGiacMat(c);
    assert.equal(kq.mat, true);
    assert.ok(kq.lyDo.length > 0);
  });
}
for (const c of THUONG) {
  test(`không bắt nhầm câu thường: "${c.slice(0, 40)}…"`, () => {
    assert.equal(nhanDienToGiacMat(c).mat, false, JSON.stringify(nhanDienToGiacMat(c).lyDo));
  });
}

/* ---- Luồng thật ------------------------------------------------------ */

let ctl;
beforeEach(() => { if (!BO_QUA) ctl = dungCsdl(pool); });
const guiDan = (body) => goiGoc({ duongGoc: '/api/submissions', router: submissionsRouter, method: 'POST', duong: '/', body });
const goi = (staff, method, duong, body) => goiGoc({
  duongGoc: '/api/admin', router: adminRouter, staff, signAccessToken, method, duong, body,
});
const hang = (ma) => ctl.db.prepare('SELECT * FROM submissions WHERE tracking_code = ?').get(ma);
const dong = (action) => ctl.db.prepare('SELECT * FROM staff_activity_logs WHERE action = ?').all(action);

test('tin có danh tính tố cáo cán bộ -> gắn cờ ngay lúc nhận; cán bộ không thấy, lãnh đạo thấy', { skip: BO_QUA }, async () => {
  const r = await guiDan(donCoTen(0, { content: MAT[0], category: 'khieu_nai' }));
  assert.equal(r.status, 201, r.text.slice(0, 200));
  const h = hang(r.body.trackingCode);
  assert.equal(h.to_giac_mat, 1);
  assert.equal((await goi(CAN_BO, 'GET', `/submissions/${h.id}`)).status, 404);
  const ds = await goi(CAN_BO, 'GET', '/submissions?status=all');
  assert.ok(!ds.text.includes(r.body.trackingCode));
  const ld = await goi(PHO, 'GET', `/submissions/${h.id}`);
  assert.equal(ld.status, 200);
  assert.ok(ld.body.to_giac_mat_nhan_dien?.length > 0, 'lãnh đạo phải thấy vì sao tin vào phần mật');
});

test('tin ẩn danh tố cáo cán bộ -> gắn cờ; hàng kiểm duyệt ẩn danh của cán bộ không có nó', { skip: BO_QUA }, async () => {
  const r = await guiDan({ isAnonymous: true, category: 'to_giac', content: MAT[2] });
  assert.equal(r.status, 201, r.text.slice(0, 200));
  const h = hang(r.body.trackingCode);
  assert.equal(h.to_giac_mat, 1);
  assert.equal(h.status, 'pending_review');
  const ds = await goi(CAN_BO, 'GET', '/submissions?status=pending_review');
  assert.ok(!ds.text.includes(r.body.trackingCode));
});

test('tin thường -> không gắn cờ', { skip: BO_QUA }, async () => {
  const r = await guiDan(donCoTen(1, { content: THUONG[0] }));
  assert.equal(hang(r.body.trackingCode).to_giac_mat, 0);
});

test('nhập hộ tại trụ sở tố cáo cán bộ -> cũng gắn cờ', { skip: BO_QUA }, async () => {
  const r = await goi(CAN_BO, 'POST', '/kiosk/submit',
    { content: MAT[1], category: 'khieu_nai', fullName: 'Phạm Văn Phúc', phone: '0916284735' });
  assert.equal(r.status, 201, r.text);
  assert.equal(hang(r.body.trackingCode).to_giac_mat, 1);
});

function themThuong(id, assigned = null) {
  ctl.db.prepare(`INSERT INTO submissions (id, tracking_code, original_content, category_id, status, assigned_to)
                  VALUES (?, ?, 'Nội dung bình thường', 3, 'processing', ?)`).run(id, `HS00${id}`, assigned);
}

test('cán bộ chuyển tin vào tố giác mật: cờ bật, bỏ giao cho cán bộ, ghi nhật ký, cán bộ mất quyền đọc', { skip: BO_QUA }, async () => {
  themThuong(40, CAN_BO.id);
  const r = await goi(CAN_BO, 'POST', '/submissions/40/to-giac-mat', { lyDo: 'Nhắc tên một cán bộ phường' });
  assert.equal(r.status, 200, r.text);
  const h = ctl.db.prepare('SELECT to_giac_mat, assigned_to FROM submissions WHERE id = 40').get();
  assert.equal(h.to_giac_mat, 1);
  assert.equal(h.assigned_to, null, 'tin chỉ lãnh đạo xem mà vẫn giao cho cán bộ');
  assert.equal(dong('move_to_secret').length, 1);
  assert.equal(dong('move_to_secret')[0].staff_id, CAN_BO.id);
  assert.equal((await goi(CAN_BO, 'GET', '/submissions/40')).status, 404);
});

test('giao cho lãnh đạo thì chuyển vào vẫn giữ người phụ trách', { skip: BO_QUA }, async () => {
  themThuong(41, PHO.id);
  assert.equal((await goi(TRUONG, 'POST', '/submissions/41/to-giac-mat', {})).status, 200);
  assert.equal(ctl.db.prepare('SELECT assigned_to FROM submissions WHERE id = 41').get().assigned_to, PHO.id);
});

test('cán bộ không đưa tin ra khỏi tố giác mật được; lãnh đạo đưa ra được, có nhật ký', { skip: BO_QUA }, async () => {
  themThuong(42);
  ctl.db.exec('UPDATE submissions SET to_giac_mat = 1 WHERE id = 42');
  assert.equal((await goi(CAN_BO, 'DELETE', '/submissions/42/to-giac-mat')).status, 403);
  assert.equal(ctl.db.prepare('SELECT to_giac_mat FROM submissions WHERE id = 42').get().to_giac_mat, 1);
  const r = await goi(TRUONG, 'DELETE', '/submissions/42/to-giac-mat');
  assert.equal(r.status, 200, r.text);
  assert.equal(ctl.db.prepare('SELECT to_giac_mat FROM submissions WHERE id = 42').get().to_giac_mat, 0);
  assert.equal(dong('release_secret').length, 1);
});

test('cán bộ chuyển tin mình không xem được -> 404, không đổi gì', { skip: BO_QUA }, async () => {
  themThuong(43);
  ctl.db.exec('UPDATE submissions SET ngoai_tham_quyen = 1 WHERE id = 43');
  assert.equal((await goi(CAN_BO, 'POST', '/submissions/43/to-giac-mat', {})).status, 404);
  assert.equal(ctl.db.prepare('SELECT to_giac_mat FROM submissions WHERE id = 43').get().to_giac_mat, 0);
});
