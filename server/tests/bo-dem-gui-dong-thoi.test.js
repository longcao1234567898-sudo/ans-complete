/**
 * VIỆC 1 (ADR-003) — GIỚI HẠN GỬI TIN KHÔNG LÁCH ĐƯỢC BẰNG GỬI DỒN CÙNG LÚC
 *
 * Luật 6: mọi giới hạn đếm phải atomic. Route gửi ý kiến đếm "thiết bị/mạng
 * này đã gửi mấy tin trong một giờ" bằng SELECT COUNT, rồi mãi sau mới INSERT.
 * Bắn nhiều yêu cầu cùng một lúc thì yêu cầu nào cũng đếm thấy "chưa đủ" trước
 * khi yêu cầu nào kịp ghi — giới hạn 5 tin/giờ, 2 tin ẩn danh/ngày thành vô
 * nghĩa, một máy tự động làm ngập hàng chờ cán bộ.
 *
 * Câu SQL của route chạy nguyên văn trên node:sqlite qua HTTP thật. Hai yêu
 * cầu đan xen ở mọi chỗ `await` — đúng như hai yêu cầu song song trên MySQL.
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

const TO_GIAC = [
  'Tối thứ bảy tuần trước khoảng 22 giờ, tại bến sông khu phố 2 có nhóm người dùng hai tàu hút cát trái phép rồi chở đi bằng xe tải không biển số.',
  'Nhà ông T ở cuối hẻm chợ tổ chức đánh bạc ăn tiền vào các tối thứ bảy, có người canh ở đầu ngõ và dùng xe máy chở con bạc từ phường bên sang.',
  'Một nhóm người lạ thường xuyên tụ tập ở quán nước gần cổng trường vào buổi chiều, có dấu hiệu mua bán chất cấm, học sinh đi qua rất sợ hãi.',
  'Tại bãi giữ xe sau chợ có người cho vay nặng lãi, đòi nợ bằng cách đe doạ và đập phá đồ đạc của các tiểu thương bán hàng khu đó.',
];

test('gửi dồn 8 tin có danh tính cùng lúc từ một mạng: không quá 5 tin được nhận', { skip: BO_QUA }, async () => {
  const ketQua = await Promise.all(Array.from({ length: 8 }, (_, i) => gui(donCoTen(i))));
  const nhan = ketQua.filter((r) => r.status === 201).length;
  const soDon = ctl.db.prepare('SELECT COUNT(*) AS n FROM submissions').get().n;
  assert.ok(nhan <= 5, `nhận ${nhan}/8 tin gửi cùng lúc — vượt giới hạn 5 tin/giờ`);
  assert.equal(soDon, nhan, 'số đơn trong CSDL phải khớp số lần báo thành công');
  for (const r of ketQua.filter((x) => x.status !== 201)) {
    assert.equal(r.status, 429, `yêu cầu bị chặn phải trả 429, nhận ${r.status} ${r.text.slice(0, 200)}`);
  }
});

test('gửi dồn 4 tin ẩn danh cùng lúc từ một mạng: không quá 2 tin được nhận', { skip: BO_QUA }, async () => {
  const ketQua = await Promise.all(TO_GIAC.map((content) => gui({ isAnonymous: true, category: 'to_giac', content })));
  const nhan = ketQua.filter((r) => r.status === 201).length;
  assert.ok(nhan <= 2, `nhận ${nhan}/4 tin ẩn danh gửi cùng lúc — vượt giới hạn 2 tin/ngày`);
});

test('không hồi quy: gửi lần lượt thì đúng 5 tin đầu được nhận, tin thứ 6 bị chặn', { skip: BO_QUA }, async () => {
  for (let i = 0; i < 5; i++) {
    const r = await gui(donCoTen(i));
    assert.equal(r.status, 201, `tin thứ ${i + 1}: ${r.status} ${r.text.slice(0, 200)}`);
  }
  const r6 = await gui(donCoTen(5));
  assert.equal(r6.status, 429);
});

test('chỗ giữ được trả lại sau mỗi lần gửi, kể cả khi bị từ chối', { skip: BO_QUA }, async () => {
  await gui(donCoTen(0));
  await gui({ ...donCoTen(1), content: '' });   // 400: không có nội dung
  const conLai = ctl.db.prepare('SELECT COUNT(*) AS n FROM khoa_gui_tam').get().n;
  assert.equal(conLai, 0, 'còn chỗ giữ treo -> lần gửi sau từ cùng mạng bị chặn oan');
  const r = await gui(donCoTen(2, { deviceId: MAY_A }));
  assert.equal(r.status, 201, r.text.slice(0, 200));
});
