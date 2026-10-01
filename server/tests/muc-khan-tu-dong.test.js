/**
 * VIỆC 10 (ADR-003) — MỨC KHẨN DO HỆ THỐNG TỰ ĐÁNH GIÁ THEO TỪ KHOÁ
 *
 * Người gửi không còn tự chọn Bình thường / Quan trọng / Khẩn cấp. Máy chủ đọc
 * nội dung bằng bộ từ khoá có sẵn (lib/phan-loai.js) và tự xếp mức. Lợi ích phụ
 * về an ninh: kẻ phá không tự gắn "khẩn cấp" cho tin rác để chen lên đầu hàng.
 * Trường `urgency` gửi lên bị BỎ QUA (kiểm ở backend, luật 2).
 */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { datBienMoiTruongHopLe } from './helpers-test.js';
import { BO_QUA, dungCsdl, goi, donCoTen, CAN_BO } from './khung-sqlite.js';

datBienMoiTruongHopLe();

const { pool } = await import('../src/db.js');
const { signAccessToken } = await import('../src/lib/token.js');
const { default: submissionsRouter } = await import('../src/routes/submissions.js');
const { default: adminRouter } = await import('../src/routes/admin/index.js');
const { danhGiaMucKhan } = await import('../src/lib/phan-loai.js');

let ctl;
beforeEach(() => { if (!BO_QUA) ctl = dungCsdl(pool); });

const gui = (body) => goi({ duongGoc: '/api/submissions', router: submissionsRouter, method: 'POST', duong: '/', body });
const mucDaLuu = (ma) => ctl.db.prepare('SELECT urgency FROM submissions WHERE tracking_code = ?').get(ma).urgency;

const BINH_THUONG = 'Đèn đường ở ngõ 5 khu phố 1 bị hỏng đã hai tuần, buổi tối đi lại khó nhìn đường, mong sửa giúp.';
const KHAN = 'Ngay lúc này đang xảy ra đánh nhau trước quán nước đầu hẻm 12, có người bị chảy máu đầu nằm dưới đất.';

test('hàm đánh giá: nội dung bình thường -> normal; đang xảy ra, chảy máu -> urgent kèm lý do', () => {
  assert.equal(danhGiaMucKhan(BINH_THUONG).muc, 'normal');
  const k = danhGiaMucKhan(KHAN);
  assert.equal(k.muc, 'urgent');
  assert.ok(k.lyDo.length > 0);
  assert.ok(k.tuKhoa.length > 0, 'phải chỉ ra từ khoá nào khớp');
});

test('người gửi tự gắn "urgent" cho tin bình thường -> lưu normal', { skip: BO_QUA }, async () => {
  const r = await gui(donCoTen(0, { content: BINH_THUONG, urgency: 'urgent' }));
  assert.equal(r.status, 201, r.text.slice(0, 200));
  assert.equal(mucDaLuu(r.body.trackingCode), 'normal');
});

test('tin khẩn thật mà người gửi chọn "normal" -> vẫn lưu urgent', { skip: BO_QUA }, async () => {
  const r = await gui(donCoTen(1, { content: KHAN, urgency: 'normal' }));
  assert.equal(r.status, 201, r.text.slice(0, 200));
  assert.equal(mucDaLuu(r.body.trackingCode), 'urgent');
});

test('giá trị urgency lạ không làm hỏng việc nhận tin', { skip: BO_QUA }, async () => {
  const r = await gui(donCoTen(2, { urgency: { $ne: 1 } }));
  assert.equal(r.status, 201, r.text.slice(0, 200));
});

test('trang chi tiết cho cán bộ biết vì sao hệ thống xếp mức đó', { skip: BO_QUA }, async () => {
  const g = await gui(donCoTen(3, { content: KHAN }));
  const id = ctl.db.prepare('SELECT id FROM submissions WHERE tracking_code = ?').get(g.body.trackingCode).id;
  const r = await goi({ duongGoc: '/api/admin', router: adminRouter, staff: CAN_BO, signAccessToken,
    method: 'GET', duong: `/submissions/${id}` });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.urgency, 'urgent');
  assert.ok(r.body.muc_khan?.lyDo, 'thiếu lý do xếp mức');
  assert.ok(Array.isArray(r.body.muc_khan?.tuKhoa));
});

test('nhập hộ tại trụ sở: mức khẩn cũng tự đánh giá, bỏ qua giá trị gửi lên', { skip: BO_QUA }, async () => {
  const r = await goi({ duongGoc: '/api/admin', router: adminRouter, staff: CAN_BO, signAccessToken,
    method: 'POST', duong: '/kiosk/submit',
    body: { content: BINH_THUONG, category: 'phan_anh', fullName: 'Phạm Văn Phúc', phone: '0916284735', urgency: 'urgent' } });
  assert.equal(r.status, 201, r.text);
  assert.equal(mucDaLuu(r.body.trackingCode), 'normal');
});
