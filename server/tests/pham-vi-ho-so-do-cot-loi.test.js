/**
 * PHẠM VI XEM HỒ SƠ — lần dò cột cờ lỗi thoáng qua (mất kết nối) phải nghiêng về
 * phía chặt: cán bộ không thấy hồ sơ, không giao được hồ sơ cho cán bộ. Và lỗi
 * đó KHÔNG được nhớ: kết nối lành lại thì cán bộ làm việc tiếp, không phải khởi
 * động lại máy chủ (ADR-003 §4; tinh thần trọng tài P44 vòng 2, PH-6).
 *
 * Tách tệp riêng: kết quả dò cột được nhớ trong tiến trình khi thành công, nên
 * lần dò ĐẦU TIÊN của tiến trình phải là lần bị tiêm lỗi.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { datBienMoiTruongHopLe } from './helpers-test.js';
import { dungCsdl, goi as goiGoc, ADMIN, H } from './gia-lap/csdl-pham-vi.js';

datBienMoiTruongHopLe();

const { pool } = await import('../src/db.js');
const { signAccessToken } = await import('../src/lib/token.js');
const { default: adminRouter } = await import('../src/routes/admin/index.js');

const sqlite = await import('node:sqlite').catch(() => null);
const BO_QUA = sqlite ? false : 'cần node:sqlite (Node ≥ 22) để chạy câu SQL thật';

const goi = (staff, method, duong, body) => goiGoc(adminRouter, signAccessToken, staff, method, duong, body);

test('dò cột lỗi: cán bộ bị chặn, không giao được cho cán bộ; lành lại thì làm việc tiếp', { skip: BO_QUA }, async () => {
  const db = dungCsdl(sqlite, pool);
  db.prepare(`INSERT INTO submissions (id, tracking_code, original_content, category_id, status, urgency,
      to_giac_mat, ngoai_tham_quyen, is_anonymous, assigned_to) VALUES (50, 'HS0050', 'NOIDUNG-50 thuong',
      1, 'processing', 'normal', 0, 0, 1, NULL)`).run();

  /* Mọi câu dò cột ném lỗi cho tới khi tắt cờ — như mất kết nối thoáng qua;
     các câu còn lại chạy bình thường */
  const goc = pool.query;
  let loiDo = true;
  pool.query = async (sql, p) => {
    if (loiDo && /SELECT to_giac_mat, ngoai_tham_quyen FROM submissions LIMIT 0/i.test(String(sql))) {
      throw new Error('ECONNRESET (giả lập)');
    }
    return goc(sql, p);
  };

  assert.equal((await goi(H, 'GET', '/submissions/50')).status, 404, 'không đọc được cờ mà cán bộ vẫn xem được');
  const ds = await goi(H, 'GET', '/submissions?status=all');
  assert.ok(!ds.text.includes('NOIDUNG-50'), 'danh sách lộ hồ sơ khi không đọc được cờ');

  const giao = await goi(ADMIN, 'PATCH', '/submissions/50/assign', { staffId: H.id });
  assert.equal(giao.status, 400, `giao được cho cán bộ khi không đọc được cờ: ${giao.status}`);
  assert.equal(db.prepare('SELECT assigned_to AS g FROM submissions WHERE id = 50').get().g, null);

  loiDo = false;
  assert.equal((await goi(ADMIN, 'PATCH', '/submissions/50/assign', { staffId: H.id })).status, 200,
    'kết nối lành lại mà vẫn coi như thiếu cột — lỗi thoáng qua bị nhớ');
  assert.equal((await goi(H, 'GET', '/submissions/50')).status, 200);
});
