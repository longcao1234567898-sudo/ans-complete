/**
 * H2 — Xem danh tính phải kiểm tra PHẠM VI PHÂN CÔNG.
 *
 * Kể cả sau H1, một `manager` vẫn xem được danh tính của MỌI hồ sơ, không chỉ hồ
 * sơ mình phụ trách. Trong hệ thống tố giác, CÁN BỘ THA HOÁ là mô hình đe doạ
 * chính — nên cần lớp ngăn chặn TRƯỚC, không chỉ nhật ký phát hiện SAU.
 *
 * Test chạy route THẬT qua HTTP, KHÔNG cần MySQL: thay `pool.query` bằng hàm
 * giả trả dữ liệu dựng sẵn (mysql2 createPool không kết nối cho tới lần truy vấn
 * đầu tiên, nên nạp module là an toàn).
 */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { datBienMoiTruongHopLe } from './helpers-test.js';

datBienMoiTruongHopLe();

const { pool } = await import('../src/db.js');
const { signAccessToken } = await import('../src/lib/token.js');
const { default: adminRouter } = await import('../src/routes/admin/index.js');

/** Hồ sơ giả: có danh tính, đã phân công cho cán bộ id = 2 */
const HO_SO_MAC_DINH = {
  assigned_to: 2,
  sender_name: 'Nguyễn Văn An',
  sender_phone: '0901234567',
  sender_email: 'an@example.com',
  is_anonymous: 0,
};

let cacTruyVan = [];

function gaPool(hoSo) {
  cacTruyVan = [];
  pool.query = async (sql, params) => {
    cacTruyVan.push({ sql, params });
    if (/FROM submissions/i.test(sql)) return [hoSo ? [hoSo] : []];
    return [{ affectedRows: 1 }];   // INSERT nhật ký
  };
}

beforeEach(() => gaPool(HO_SO_MAC_DINH));

const veCua = (staff) => signAccessToken(staff);

const ADMIN   = { id: 1, username: 'admin', role: 'admin',   full_name: 'Quản trị' };
const MGR_CO  = { id: 2, username: 'mgr2',  role: 'manager', full_name: 'Được phân công' };
const MGR_KO  = { id: 3, username: 'mgr3',  role: 'manager', full_name: 'Không phân công' };
const HANDLER = { id: 4, username: 'cb4',   role: 'handler', full_name: 'Cán bộ xử lý' };

async function goiReveal(staff, id = 10) {
  const app = express();
  app.use(express.json());
  app.use('/api/admin', adminRouter);

  const server = app.listen(0);
  try {
    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}/api/admin/submissions/${id}/reveal`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(staff ? { Authorization: `Bearer ${veCua(staff)}` } : {}),
      },
    });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  } finally {
    server.close();
  }
}

test('admin -> cho qua, trả danh tính đầy đủ', async () => {
  const { status, body } = await goiReveal(ADMIN);
  assert.equal(status, 200);
  assert.equal(body.sender_name, 'Nguyễn Văn An');
  assert.equal(body.sender_phone, '0901234567');
});

test('manager ĐƯỢC phân công -> cho qua', async () => {
  const { status, body } = await goiReveal(MGR_CO);
  assert.equal(status, 200);
  assert.equal(body.sender_name, 'Nguyễn Văn An');
});

test('manager KHÔNG được phân công -> 403, không lộ gì', async () => {
  const { status, body } = await goiReveal(MGR_KO);
  assert.equal(status, 403);
  assert.match(String(body.error), /phân công/i);
  assert.equal(body.sender_name, undefined, 'Vẫn trả danh tính kèm lỗi thì vá vô nghĩa');
  assert.equal(body.sender_phone, undefined);
});

test('handler -> 403 ngay ở tầng phân quyền (H1)', async () => {
  const { status, body } = await goiReveal(HANDLER);
  assert.equal(status, 403);
  assert.equal(body.sender_name, undefined);
});

test('không đăng nhập -> 401', async () => {
  const { status } = await goiReveal(null);
  assert.equal(status, 401);
});

test('tin ẨN DANH -> 400, kể cả với admin', async () => {
  gaPool({ ...HO_SO_MAC_DINH, is_anonymous: 1, assigned_to: 1 });
  const { status, body } = await goiReveal(ADMIN);
  assert.equal(status, 400);
  assert.match(String(body.error), /ẨN DANH/i);
});

test('không tìm thấy hồ sơ -> 404', async () => {
  gaPool(null);
  const { status } = await goiReveal(ADMIN);
  assert.equal(status, 404);
});

/* G7 — điểm tốt phải giữ: ghi nhật ký TRƯỚC khi trả dữ liệu */
test('G7: ghi nhật ký reveal_identity TRƯỚC khi trả danh tính', async () => {
  const { status } = await goiReveal(ADMIN);
  assert.equal(status, 200);

  const nhatKy = cacTruyVan.find((t) => /INSERT INTO staff_activity_logs/i.test(t.sql));
  assert.ok(nhatKy, 'Không ghi nhật ký -> mất khả năng phát hiện cán bộ lạm dụng');
  assert.ok(nhatKy.params.includes('reveal_identity'));
  assert.equal(nhatKy.params[0], ADMIN.id, 'Phải ghi ĐÍCH DANH ai đã xem');
});

test('bị 403 thì KHÔNG ghi nhật ký reveal (chưa hề xem được gì)', async () => {
  await goiReveal(MGR_KO);
  assert.ok(
    !cacTruyVan.some((t) => /INSERT INTO staff_activity_logs/i.test(t.sql)),
    'Chặn trước rồi thì không có lượt xem nào để ghi'
  );
});
