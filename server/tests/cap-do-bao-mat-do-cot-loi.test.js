/**
 * BUG-009 — lần dò cột security_level lỗi thoáng qua (mất kết nối) không được
 * làm việc "nâng lên Mật thì gỡ người được giao" im lặng bỏ qua (trọng tài P44
 * vòng 2, PH-6). Không đọc được mức thì phải nghiêng về phía chặt, không phía lỏng.
 *
 * Tách tệp riêng: kết quả dò cột được nhớ trong tiến trình khi thành công, nên
 * lần dò ĐẦU TIÊN của tiến trình phải là lần bị tiêm lỗi.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { datBienMoiTruongHopLe } from './helpers-test.js';
import { dungCsdl, goi as goiGoc, ADMIN, H } from './gia-lap/csdl-cap-do.js';

datBienMoiTruongHopLe();

const { pool } = await import('../src/db.js');
const { signAccessToken } = await import('../src/lib/token.js');
const { default: adminRouter } = await import('../src/routes/admin/index.js');

const sqlite = await import('node:sqlite').catch(() => null);
const BO_QUA = sqlite ? false : 'cần node:sqlite (Node ≥ 22) để chạy câu SQL thật';

const goi = (staff, method, duong, body) => goiGoc(adminRouter, signAccessToken, staff, method, duong, body);

test('dò cột lỗi đúng lúc admin nâng lên Mật: người được giao cũ vẫn bị gỡ, không đọc được hồ sơ', { skip: BO_QUA }, async () => {
  const db = dungCsdl(sqlite, pool);
  db.prepare(`INSERT INTO submissions (id, tracking_code, original_content, category_id, status, urgency,
      security_level, is_anonymous, assigned_to) VALUES (50, 'HS0050', 'BIMAT-50 noi dung', 1, 'processing',
      'normal', 'thuong', 1, ?)`).run(H.id);

  /* Mọi câu dò cột ném lỗi cho tới khi xong lượt PATCH — như mất kết nối
     thoáng qua đúng lúc đó; các câu còn lại chạy bình thường */
  const goc = pool.query;
  let loiDo = true;
  pool.query = async (sql, p) => {
    if (loiDo && /SELECT security_level FROM submissions LIMIT 0/i.test(String(sql))) {
      throw new Error('ECONNRESET (giả lập)');
    }
    return goc(sql, p);
  };

  const r = await goi(ADMIN, 'PATCH', '/submissions/50/security-level', { level: 'mat' });
  loiDo = false;
  assert.equal(r.status, 200, r.text);
  const hang = db.prepare('SELECT security_level AS m, assigned_to AS g FROM submissions WHERE id = 50').get();
  assert.equal(hang.m, 'mat');
  assert.equal(hang.g, null, 'nâng lên Mật mà người được giao cũ (có thể do manager chọn) còn giữ hồ sơ');
  assert.equal((await goi(H, 'GET', '/submissions/50')).status, 404);
});
