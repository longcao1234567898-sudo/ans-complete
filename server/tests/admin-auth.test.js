/**
 * C1 — MỌI router dưới /api/admin phải chặn request không kèm token.
 *
 * Lỗ hổng đã vá: `app.use('/api/admin', adminRouter)` không gắn middleware nào,
 * mỗi sub-router tự gọi requireAuth — và kiosk.js với trash.js QUÊN gọi.
 * Khai thác được ngay, không cần credential:
 *     curl https://<backend>/api/admin/trash          -> đọc toàn bộ thùng rác
 *     curl -X POST .../api/admin/kiosk/submit         -> chèn tin "đã xác minh"
 *
 * Test này dựng app Express THẬT (không cần MySQL vì request bị chặn ở tầng
 * middleware, chưa kịp chạm tới pool).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import express from 'express';
import { datBienMoiTruongHopLe, resGia } from './helpers-test.js';

datBienMoiTruongHopLe();

const { default: adminRouter } = await import('../src/routes/admin/index.js');
const { requireAuth } = await import('../src/middleware/auth.js');

/** Gọi thẳng vào app bằng http, không cần thư viện supertest */
async function goi(app, duongDan, method = 'GET') {
  const server = app.listen(0);
  try {
    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}${duongDan}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: method === 'GET' ? undefined : '{}',
    });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  } finally {
    server.close();
  }
}

/* Danh sách phải liệt kê ĐỦ mọi router con. Test đếm file bên dưới sẽ đỏ nếu
   ai đó thêm router mới mà quên thêm vào đây — nếu không, test này thành vô dụng
   đúng vào lúc cần nhất. */
const CAC_DUONG_DAN = [
  ['/api/admin/submissions', 'GET'],
  ['/api/admin/dashboard/stats', 'GET'],
  ['/api/admin/banned-words', 'GET'],
  ['/api/admin/staff', 'GET'],
  ['/api/admin/reports/summary', 'GET'],
  ['/api/admin/logs', 'GET'],
  ['/api/admin/kiosk/submit', 'POST'],
  ['/api/admin/trash', 'GET'],
  // V10 — mã QR định vị; V11 — nhóm sự kiện trùng lặp
  ['/api/admin/qr-points', 'GET'],
  ['/api/admin/incident-groups', 'GET'],
  // V12 — chat với người tố giác + danh sách khoá thiết bị
  ['/api/admin/chat/blacklist', 'GET'],
];

for (const [duongDan, method] of CAC_DUONG_DAN) {
  test(`${method} ${duongDan} không token -> 401`, async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/admin', adminRouter);

    const { status, body } = await goi(app, duongDan, method);
    assert.equal(status, 401, `${duongDan} phải bị chặn TRƯỚC khi chạm database`);
    assert.match(String(body.error), /đăng nhập/i);
  });
}

test('danh sách trên phủ ĐỦ số router con trong routes/admin/', async () => {
  const files = (await readdir(new URL('../src/routes/admin/', import.meta.url)))
    .filter((f) => f.endsWith('.js') && f !== 'index.js');

  assert.equal(
    files.length, CAC_DUONG_DAN.length,
    `routes/admin/ có ${files.length} router con nhưng test chỉ kiểm ${CAC_DUONG_DAN.length}. `
    + `Thêm đường dẫn của router mới (${files.join(', ')}) vào CAC_DUONG_DAN.`
  );
});

test('routes/admin/index.js gắn requireAuth ở TẦNG CHA', async () => {
  const { readFile } = await import('node:fs/promises');
  const nguon = await readFile(new URL('../src/routes/admin/index.js', import.meta.url), 'utf8');
  assert.match(
    nguon, /router\.use\(requireAuth\)/,
    'Bảo vệ phải nằm ở nơi không thể quên, không giao cho từng router con tự nhớ'
  );
});

test('requireAuth: không có header Authorization -> 401 và KHÔNG gọi next', () => {
  const res = resGia();
  let daGoiNext = false;

  requireAuth({ headers: {} }, res, () => { daGoiNext = true; });

  assert.equal(res.statusCode, 401);
  assert.equal(daGoiNext, false, 'next() bị gọi nghĩa là request đi tiếp tới database');
});

test('requireAuth: token rác -> 401 và KHÔNG gọi next', () => {
  const res = resGia();
  let daGoiNext = false;

  requireAuth({ headers: { authorization: 'Bearer khong-phai-token' } }, res, () => { daGoiNext = true; });

  assert.equal(res.statusCode, 401);
  assert.equal(daGoiNext, false);
});

test('requireAuth: token hợp lệ -> gắn req.staff và gọi next', async () => {
  const { signAccessToken } = await import('../src/lib/token.js');
  const token = signAccessToken({ id: 3, username: 'ql', role: 'manager', full_name: 'Lê C' });

  const req = { headers: { authorization: `Bearer ${token}` } };
  const res = resGia();
  let daGoiNext = false;

  requireAuth(req, res, () => { daGoiNext = true; });

  assert.equal(daGoiNext, true);
  assert.deepEqual(req.staff, { id: 3, username: 'ql', role: 'manager', name: 'Lê C' });
});
