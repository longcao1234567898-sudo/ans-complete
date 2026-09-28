/**
 * BUG-009 biến thể (g) — CSDL chưa chạy nang_cap_v14.sql (không có cột
 * security_level). Không đọc được mức thì coi là Mật (luật 1, chính sách P38 #4):
 * chỉ admin và người đang được giao xem được; manager không phân công được.
 *
 * Tách tệp riêng vì kết quả dò cột được nhớ trong tiến trình: node --test chạy
 * mỗi tệp một tiến trình, nên tệp này luôn bắt đầu với CSDL thiếu cột.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { datBienMoiTruongHopLe } from './helpers-test.js';
import { dungCsdl, goi as goiGoc, ADMIN, MGR, H, H2 } from './gia-lap/csdl-cap-do.js';

datBienMoiTruongHopLe();

const { pool } = await import('../src/db.js');
const { signAccessToken } = await import('../src/lib/token.js');
const { default: adminRouter } = await import('../src/routes/admin/index.js');

const sqlite = await import('node:sqlite').catch(() => null);
const BO_QUA = sqlite ? false : 'cần node:sqlite (Node ≥ 22) để chạy câu SQL thật';

const goi = (staff, method, duong, body) => goiGoc(adminRouter, signAccessToken, staff, method, duong, body);

let db;
function napDuLieu() {
  db = dungCsdl(sqlite, pool, { coCot: false });
  const them = db.prepare(`INSERT INTO submissions (id, tracking_code, original_content, category_id, status,
      urgency, is_anonymous, assigned_to) VALUES (?,?,?,1,'processing','normal',1,?)`);
  them.run(50, 'HS0050', 'NOIDUNG-50 chưa phân công', null);
  them.run(51, 'HS0051', 'NOIDUNG-51 giao cho handler H', H.id);
}

test('(g) thiếu cột: handler và manager không đọc hồ sơ không giao cho mình; admin đọc, mức hiện là mat', { skip: BO_QUA }, async () => {
  napDuLieu();
  for (const staff of [MGR, H, H2]) {
    const r = await goi(staff, 'GET', '/submissions/50');
    assert.equal(r.status, 404, `${staff.role}#${staff.id} đọc được hồ sơ không rõ mức: ${r.status}`);
    const ds = await goi(staff, 'GET', '/submissions?status=all');
    assert.equal(ds.status, 200, ds.text.slice(0, 200));
    assert.ok(!ds.text.includes('NOIDUNG-50'), `${staff.role}#${staff.id}: danh sách lộ hồ sơ không rõ mức`);
  }
  const a = await goi(ADMIN, 'GET', '/submissions/50');
  assert.equal(a.status, 200);
  assert.equal(a.body.security_level, 'mat', 'không đọc được mức thì phải báo là mat, không phải thuong');

  assert.equal((await goi(H, 'GET', '/submissions/51')).status, 200, 'người đang được giao vẫn làm việc được');
  const dsH = await goi(H, 'GET', '/submissions?status=all');
  assert.equal(dsH.body.total, 1);
});

test('(g) thiếu cột: manager không phân công được (mọi hồ sơ coi là Mật)', { skip: BO_QUA }, async () => {
  napDuLieu();
  const r = await goi(MGR, 'PATCH', '/submissions/50/assign', { staffId: H2.id });
  assert.ok(r.status === 404 || r.status === 403, `manager giao được hồ sơ không rõ mức: ${r.status}`);
  assert.equal(db.prepare('SELECT assigned_to AS g FROM submissions WHERE id = 50').get().g, null);
});
