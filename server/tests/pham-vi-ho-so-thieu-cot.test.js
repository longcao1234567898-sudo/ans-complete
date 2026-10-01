/**
 * PHẠM VI XEM HỒ SƠ — CSDL chưa chạy nang_cap_v26.sql (không có hai cột cờ
 * to_giac_mat, ngoai_tham_quyen). Không đọc được cờ thì coi như mọi hồ sơ đều
 * mang cờ (luật 1, ADR-003 §4): cán bộ không thấy gì, kể cả hồ sơ đang giao cho
 * mình; lãnh đạo vẫn làm việc bình thường; không giao được hồ sơ cho cán bộ.
 *
 * Thay bài (g) của BUG-009 (cap-do-bao-mat-thieu-cot.test.js) — cùng ý fail-safe,
 * đổi theo chính sách hai cờ.
 *
 * Tách tệp riêng vì kết quả dò cột được nhớ trong tiến trình: node --test chạy
 * mỗi tệp một tiến trình, nên tệp này luôn bắt đầu với CSDL thiếu cột.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { datBienMoiTruongHopLe } from './helpers-test.js';
import { dungCsdl, goi as goiGoc, ADMIN, MGR, MGR2, H, H2 } from './gia-lap/csdl-pham-vi.js';

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
  them.run(51, 'HS0051', 'NOIDUNG-51 giao cho cán bộ H', H.id);
}

test('thiếu cột: cán bộ không đọc được hồ sơ nào, kể cả hồ sơ đang giao cho mình', { skip: BO_QUA }, async () => {
  napDuLieu();
  for (const staff of [H, H2]) {
    for (const id of [50, 51]) {
      const r = await goi(staff, 'GET', `/submissions/${id}`);
      assert.equal(r.status, 404, `cán bộ #${staff.id} đọc được hồ sơ ${id} không rõ cờ: ${r.status}`);
    }
    const ds = await goi(staff, 'GET', '/submissions?status=all');
    assert.equal(ds.status, 200, ds.text.slice(0, 200));
    assert.ok(!ds.text.includes('NOIDUNG-'), `cán bộ #${staff.id}: danh sách lộ hồ sơ không rõ cờ`);
  }
});

test('thiếu cột: mọi lãnh đạo vẫn đọc được, danh sách đủ, cờ hiện 0 (route không sập)', { skip: BO_QUA }, async () => {
  napDuLieu();
  for (const staff of [ADMIN, MGR, MGR2]) {
    const r = await goi(staff, 'GET', '/submissions/50');
    assert.equal(r.status, 200, `${staff.role}#${staff.id}: ${r.status} ${r.text.slice(0, 200)}`);
    assert.equal(Number(r.body.to_giac_mat), 0);
    assert.equal(Number(r.body.ngoai_tham_quyen), 0);
    const ds = await goi(staff, 'GET', '/submissions?status=all');
    assert.equal(ds.status, 200, ds.text.slice(0, 200));
    assert.equal(ds.body.total, 2);
  }
});

test('thiếu cột: không giao được hồ sơ cho cán bộ; giao cho lãnh đạo vẫn được', { skip: BO_QUA }, async () => {
  napDuLieu();
  const r = await goi(MGR, 'PATCH', '/submissions/50/assign', { staffId: H2.id });
  assert.equal(r.status, 400, `giao được hồ sơ không rõ cờ cho cán bộ: ${r.status} ${r.text}`);
  assert.equal(db.prepare('SELECT assigned_to AS g FROM submissions WHERE id = 50').get().g, null);

  const ok = await goi(MGR, 'PATCH', '/submissions/50/assign', { staffId: ADMIN.id });
  assert.equal(ok.status, 200, ok.text);
  assert.equal(db.prepare('SELECT assigned_to AS g FROM submissions WHERE id = 50').get().g, ADMIN.id);
});
