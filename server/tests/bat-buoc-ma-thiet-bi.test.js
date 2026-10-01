/**
 * VIỆC 5 (ADR-003 §6) — TIN CÓ DANH TÍNH BẮT BUỘC MANG MÃ THIẾT BỊ
 *
 * Nút "Tin rác" của cán bộ khoá đúng máy đã gửi bằng mã thiết bị. Đơn có danh
 * tính mà không có mã thì không khoá được gì: một đoạn mã tự động chỉ cần bỏ
 * trường deviceId là gửi tiếp mãi sau khi bị đánh dấu. Giao diện của hệ thống
 * luôn gửi mã, nên chỉ yêu cầu dựng tay mới thiếu.
 *
 * Tin ẩn danh KHÔNG đổi: máy chủ không đọc mã máy của đơn ẩn danh (BUG-014,
 * M-B) — bắt mã ở đây là dựng lại đúng cái khoá nối đã gỡ.
 */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { datBienMoiTruongHopLe } from './helpers-test.js';
import { BO_QUA, dungCsdl, goi, donCoTen, MAY_A } from './khung-sqlite.js';

datBienMoiTruongHopLe();

const { pool } = await import('../src/db.js');
const { default: submissionsRouter } = await import('../src/routes/submissions.js');

let ctl;
beforeEach(() => { if (!BO_QUA) ctl = dungCsdl(pool); });

const gui = (body) => goi({ duongGoc: '/api/submissions', router: submissionsRouter, method: 'POST', duong: '/', body });
const soDon = () => ctl.db.prepare('SELECT COUNT(*) AS n FROM submissions').get().n;

const TO_GIAC = 'Tối thứ bảy tuần trước khoảng 22 giờ, tại bến sông khu phố 2 có nhóm người dùng hai tàu hút '
  + 'cát trái phép rồi chở đi bằng xe tải không biển số.';
const TO_GIAC_2 = 'Nhà ông T ở cuối hẻm chợ tổ chức đánh bạc ăn tiền vào các tối thứ bảy, có người canh ở đầu '
  + 'ngõ và dùng xe máy chở con bạc từ phường bên sang.';

const THIEU = [
  ['không có trường deviceId', undefined],
  ['chuỗi rỗng', ''],
  ['chỉ có khoảng trắng', '   '],
  ['không đúng dạng UUID', 'may-cua-toi'],
  ['UUID cắt cụt', MAY_A.slice(0, 30)],
  ['số', 12345],
  ['mảng chứa mã đúng', [MAY_A]],
  ['object', { id: MAY_A }],
];

for (const [ten, giaTri] of THIEU) {
  test(`tin có danh tính, mã thiết bị ${ten} -> 400, không lưu gì`, { skip: BO_QUA }, async () => {
    const don = donCoTen(0);
    if (giaTri === undefined) delete don.deviceId; else don.deviceId = giaTri;
    const r = await gui(don);
    assert.equal(r.status, 400, `${r.status} ${r.text.slice(0, 200)}`);
    assert.equal(r.body?.code, 'THIEU_MA_THIET_BI');
    assert.match(r.body?.error || '', /113/, 'lời từ chối phải chỉ đường gọi 113 cho việc khẩn cấp');
    assert.equal(soDon(), 0);
    assert.equal(ctl.db.prepare('SELECT COUNT(*) AS n FROM khoa_gui_tam').get().n, 0, 'còn chỗ giữ treo');
  });
}

test('tin có danh tính, mã thiết bị hợp lệ (cả chữ hoa) -> nhận, lưu mã đã chuẩn hoá', { skip: BO_QUA }, async () => {
  const r = await gui(donCoTen(0, { deviceId: `  ${MAY_A.toUpperCase()} ` }));
  assert.equal(r.status, 201, r.text.slice(0, 200));
  assert.equal(ctl.db.prepare('SELECT device_id AS m FROM submissions').get().m, MAY_A);
});

test('tin ẩn danh không cần mã thiết bị, và không lưu mã dù có gửi', { skip: BO_QUA }, async () => {
  const r1 = await gui({ isAnonymous: true, category: 'to_giac', content: TO_GIAC });
  assert.equal(r1.status, 201, r1.text.slice(0, 200));
  const r2 = await gui({ isAnonymous: true, category: 'to_giac', deviceId: MAY_A,
    content: TO_GIAC_2 });
  assert.equal(r2.status, 201, r2.text.slice(0, 200));
  const ds = ctl.db.prepare('SELECT device_id AS m FROM submissions').all();
  assert.equal(ds.length, 2);
  assert.ok(ds.every((d) => d.m == null), 'đơn ẩn danh không được mang mã máy (BUG-014)');
});
