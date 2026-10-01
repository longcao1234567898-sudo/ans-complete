/**
 * VIỆC 24 (ADR-003) — NHẬN DIỆN NGƯỜI THẬT HAY MÁY QUA THỜI GIAN ĐIỀN ĐƠN
 *
 * Máy chủ ghi thời điểm mở form bằng một phiếu CÓ CHỮ KÝ của máy chủ, và so
 * với lúc gửi. Thời gian phải do máy chủ đo — giờ trình duyệt tự báo thì máy
 * tự động sửa được. Điền quá nhanh (dưới 15 giây) thì GẮN CỜ "nghi máy tự
 * động"; tin KHÔNG bị từ chối, vẫn vào sàng lọc kèm cờ — tránh chặn nhầm người
 * gõ nhanh. Ngưỡng sẽ đo lại từ thời gian điền thật sau vài tuần chạy.
 */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { datBienMoiTruongHopLe } from './helpers-test.js';
import { BO_QUA, dungCsdl, goi, donCoTen } from './khung-sqlite.js';

datBienMoiTruongHopLe();

const { pool } = await import('../src/db.js');
const { default: submissionsRouter } = await import('../src/routes/submissions.js');

let ctl;
beforeEach(() => { if (!BO_QUA) ctl = dungCsdl(pool); });

const gui = (body) => goi({ duongGoc: '/api/submissions', router: submissionsRouter, method: 'POST', duong: '/', body });
const phieuCach = (giay) => jwt.sign({ purpose: 'mo_form', iat: Math.floor(Date.now() / 1000) - giay },
  process.env.JWT_SECRET, { expiresIn: '1d' });
const hang = (ma) => ctl.db.prepare('SELECT is_flagged, flag_reason, status FROM submissions WHERE tracking_code = ?').get(ma);

test('lấy phiếu mở form: phiếu có chữ ký của máy chủ, ghi giờ mở', { skip: BO_QUA }, async () => {
  const r = await goi({ duongGoc: '/api/submissions', router: submissionsRouter, method: 'GET', duong: '/phieu-mo-form' });
  assert.equal(r.status, 200, r.text);
  const p = jwt.verify(r.body.phieu, process.env.JWT_SECRET);
  assert.equal(p.purpose, 'mo_form');
  assert.ok(Math.abs(p.iat - Date.now() / 1000) < 5);
});

test('điền xong trong 3 giây -> vẫn nhận, gắn cờ nghi máy tự động kèm số giây', { skip: BO_QUA }, async () => {
  const r = await gui(donCoTen(0, { phieuMoForm: phieuCach(3) }));
  assert.equal(r.status, 201, r.text.slice(0, 200));
  const h = hang(r.body.trackingCode);
  assert.equal(h.is_flagged, 1);
  assert.match(h.flag_reason, /nghi máy tự động/);
  assert.match(h.flag_reason, /\d+ giây/);
  assert.equal(h.status, 'received', 'tin nghi máy vẫn vào hàng sàng lọc');
});

test('điền trong 2 phút 30 giây -> không gắn cờ', { skip: BO_QUA }, async () => {
  const r = await gui(donCoTen(0, { phieuMoForm: phieuCach(150) }));
  assert.equal(r.status, 201, r.text.slice(0, 200));
  assert.equal(hang(r.body.trackingCode).is_flagged, 0);
});

test('không có phiếu, phiếu giả, phiếu sai mục đích -> vẫn nhận, gắn cờ', { skip: BO_QUA }, async () => {
  const gia = jwt.sign({ purpose: 'mo_form', iat: Math.floor(Date.now() / 1000) - 600 }, 'khoa-khac', { expiresIn: '1d' });
  const saiMucDich = jwt.sign({ purpose: 'cong_vao', iat: Math.floor(Date.now() / 1000) - 600 }, process.env.JWT_SECRET, { expiresIn: '1d' });
  for (const [i, phieu] of [undefined, gia, saiMucDich, 12345].entries()) {
    const r = await gui(donCoTen(i, phieu === undefined ? {} : { phieuMoForm: phieu }));
    assert.equal(r.status, 201, r.text.slice(0, 200));
    const h = hang(r.body.trackingCode);
    assert.equal(h.is_flagged, 1, `phiếu ${i}`);
    assert.match(h.flag_reason, /phiếu mở form/i);
  }
});

test('máy tự đặt thời gian ở trình duyệt không có tác dụng', { skip: BO_QUA }, async () => {
  const r = await gui(donCoTen(0, { phieuMoForm: phieuCach(2), thoiGianDien: 600, giayDien: 600 }));
  assert.equal(hang(r.body.trackingCode).is_flagged, 1);
});
