/**
 * HÀNG SÀNG LỌC KHI CSDL CHƯA CHẠY nang_cap_v28.sql (ADR-003 việc 13–16)
 *
 * Fail-safe (luật 1): nút sàng lọc và ghi chú báo rõ "chạy nang_cap_v28.sql"
 * (503) thay vì làm nửa vời; danh sách và trang chi tiết vẫn chạy; thùng rác
 * vẫn tự dọn như cũ. Tách tệp vì kết quả dò cột được nhớ trong tiến trình khi
 * đã thấy cột — tệp này phải bắt đầu với CSDL thiếu cột.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { datBienMoiTruongHopLe } from './helpers-test.js';
import { BO_QUA, dungCsdl, goi as goiGoc, TRUONG, CAN_BO } from './khung-sqlite.js';

datBienMoiTruongHopLe();

const { pool } = await import('../src/db.js');
const { signAccessToken } = await import('../src/lib/token.js');
const { default: adminRouter } = await import('../src/routes/admin/index.js');

const goi = (staff, method, duong, body) => goiGoc({
  duongGoc: '/api/admin', router: adminRouter, staff, signAccessToken, method, duong, body,
});

function dungThieuCot() {
  const ctl = dungCsdl(pool);
  for (const cot of ['chua_xac_minh_luc', 'sang_loc_boi', 'sang_loc_luc', 'giu_cho_lanh_dao']) {
    ctl.db.exec(`ALTER TABLE submissions DROP COLUMN ${cot}`);
  }
  ctl.db.exec('DROP TABLE ghi_chu_noi_bo');
  ctl.db.exec(`INSERT INTO submissions (id, tracking_code, original_content, category_id, status, is_anonymous)
               VALUES (10, 'HS0010', 'Phản ánh đèn đường', 3, 'received', 0)`);
  return ctl;
}

test('thiếu cột v28: nút sàng lọc và ghi chú -> 503 kèm hướng dẫn, không đổi gì', { skip: BO_QUA }, async () => {
  const ctl = dungThieuCot();
  const r = await goi(CAN_BO, 'POST', '/submissions/10/sang-loc', { hanhDong: 'xac_nhan' });
  assert.equal(r.status, 503);
  assert.match(r.body.error, /nang_cap_v28\.sql/);
  assert.equal((await goi(CAN_BO, 'POST', '/submissions/10/ghi-chu', { noiDung: 'thử' })).status, 503);
  assert.equal(ctl.db.prepare('SELECT status FROM submissions WHERE id = 10').get().status, 'received');
});

test('thiếu cột v28: danh sách, chi tiết, thùng rác vẫn chạy', { skip: BO_QUA }, async () => {
  dungThieuCot();
  const ds = await goi(CAN_BO, 'GET', '/submissions?phan=sang_loc');
  assert.equal(ds.status, 200, ds.text);
  assert.equal(ds.body.data[0].chua_xac_minh_luc, null);
  const ct = await goi(CAN_BO, 'GET', '/submissions/10');
  assert.equal(ct.status, 200, ct.text);
  assert.deepEqual(ct.body.ghi_chu, []);
  assert.equal((await goi(TRUONG, 'GET', '/trash')).status, 200);
});
