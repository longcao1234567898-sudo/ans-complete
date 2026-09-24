/**
 * BUG-001 — Vé của công dân dùng được làm token đăng nhập cán bộ.
 *
 * Hệ thống ký BA loại vé công dân bằng đúng khoá ký phiên cán bộ:
 *   - vé OTP email      routes/otp.js   {emailHash, purpose:'submit'}
 *   - vé OTP ẩn danh    routes/otp.js   {emailHash, purpose:'submit_anon'}
 *   - vé chat           routes/chat.js  {sub:<id đơn>, purpose:'chat_reporter'}
 * Người ngoài lấy được cả ba mà không cần tài khoản. Nếu requireAuth chỉ kiểm
 * chữ ký thì vé nào cũng lọt, và vé chat mang `sub` là SỐ — trùng id một cán
 * bộ có thật là chuyện mặc định, không phải hiếm (hai bảng cùng đếm từ 1).
 *
 * ⚠️ POOL GIẢ Ở ĐÂY TRẢ "ĐANG HOẠT ĐỘNG" CHO MỌI ID — CỐ Ý.
 * Trước bản vá, hai vé OTP bị chặn chỉ vì tai nạn: vé không có `sub` ->
 * `WHERE id = NaN` -> MySQL báo lỗi cột -> nhánh catch trả false. Test mà để
 * pool giả báo lỗi như MySQL thì sẽ xanh nhờ đúng cái tai nạn đó, và lần dọn
 * dẹp sau (`if (!Number.isFinite(id)) return false`) mở lại lỗ hổng mà không
 * test nào đỏ. Truy vấn is_active là kiểm KHOÁ TÀI KHOẢN, không phải kiểm LOẠI
 * VÉ — test này bắt lớp kiểm loại vé phải tự đứng được.
 */
import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import express from 'express';
import jwt from 'jsonwebtoken';
import { datBienMoiTruongHopLe, resGia, TEST_JWT_SECRET } from './helpers-test.js';

datBienMoiTruongHopLe();

const { signAccessToken, verifyAccessToken } = await import('../src/lib/token.js');
const { requireAuth, xoaDemTrangThai } = await import('../src/middleware/auth.js');
const { authorize } = await import('../src/middleware/authorize.js');
const { default: adminRouter } = await import('../src/routes/admin/index.js');
const { pool } = await import('../src/db.js');

/* Id cán bộ có thật trong bảng staff giả. Vé chat mang đúng số này làm `sub`
   — mô phỏng đơn thứ 3 của hệ thống trùng id cán bộ thứ 3. */
const ID_CAN_BO = 3;

/* Ký y hệt nơi cấp vé thật — chép hình dạng payload, khoá và hạn dùng. */
const VE = {
  'kịch bản gốc — vé OTP email (otp.js)':
    () => jwt.sign({ emailHash: 'a'.repeat(64), purpose: 'submit' }, TEST_JWT_SECRET, { expiresIn: '15m' }),
  'biến thể (a) — vé OTP ẩn danh (otp.js)':
    () => jwt.sign({ emailHash: 'b'.repeat(64), purpose: 'submit_anon' }, TEST_JWT_SECRET, { expiresIn: '15m' }),
  'biến thể (e) — vé chat, sub trùng id cán bộ (chat.js)':
    () => jwt.sign({ sub: ID_CAN_BO, purpose: 'chat_reporter' }, process.env.JWT_SECRET, { expiresIn: '2h' }),
  'biến thể (b) — vé cùng khoá, thiếu hẳn trường phân loại, sub = id cán bộ':
    () => jwt.sign({ sub: ID_CAN_BO }, TEST_JWT_SECRET, { expiresIn: '1h' }),
  'biến thể (b) — vé cùng khoá, đủ sub/role như access token nhưng không mang dấu access':
    () => jwt.sign({ sub: ID_CAN_BO, username: 'x', role: 'admin', name: 'X' }, TEST_JWT_SECRET, { expiresIn: '1h' }),
  'biến thể (f) — sub dạng chuỗi "3"':
    () => jwt.sign({ sub: String(ID_CAN_BO), purpose: 'chat_reporter' }, TEST_JWT_SECRET, { expiresIn: '1h' }),
};

let queryCu;
beforeEach(() => {
  queryCu = pool.query;
  // Mọi id đều "đang hoạt động"; mọi truy vấn khác trả rỗng.
  pool.query = async (sql) => (/is_active/.test(sql) ? [[{ is_active: 1 }]] : [[]]);
  xoaDemTrangThai();
});
afterEach(() => { pool.query = queryCu; xoaDemTrangThai(); });

async function quaRequireAuth(token) {
  const req = { headers: { authorization: `Bearer ${token}` } };
  const res = resGia();
  let daGoiNext = false;
  await requireAuth(req, res, () => { daGoiNext = true; });
  return { req, res, daGoiNext };
}

describe('BUG-001 — lib/token.js: verifyAccessToken chỉ nhận vé đăng nhập cán bộ', () => {
  for (const [ten, kyVe] of Object.entries(VE)) {
    test(`${ten} -> verifyAccessToken NÉM LỖI`, () => {
      assert.throws(() => verifyAccessToken(kyVe()), 'vé công dân không được xác minh như access token');
    });
  }

  test('đối chứng: access token cán bộ thật -> xác minh được', () => {
    const p = verifyAccessToken(signAccessToken({ id: ID_CAN_BO, username: 'canbo', role: 'handler', full_name: 'Cán Bộ' }));
    assert.equal(p.sub, ID_CAN_BO);
    assert.equal(p.role, 'handler');
  });
});

describe('BUG-001 — requireAuth chặn vé công dân KỂ CẢ khi DB báo id đang hoạt động', () => {
  for (const [ten, kyVe] of Object.entries(VE)) {
    test(`${ten} -> 401, KHÔNG gọi next, KHÔNG gắn req.staff`, async () => {
      const { req, res, daGoiNext } = await quaRequireAuth(kyVe());
      assert.equal(res.statusCode, 401);
      assert.equal(daGoiNext, false, 'next() bị gọi nghĩa là vé công dân chạm được API quản trị');
      assert.equal(req.staff, undefined);
    });
  }

  test('đối chứng: access token cán bộ thật -> cho qua, req.staff đủ id/role', async () => {
    const token = signAccessToken({ id: ID_CAN_BO, username: 'canbo', role: 'handler', full_name: 'Cán Bộ' });
    const { req, daGoiNext } = await quaRequireAuth(token);
    assert.equal(daGoiNext, true);
    assert.deepEqual(req.staff, { id: ID_CAN_BO, username: 'canbo', role: 'handler', name: 'Cán Bộ' });
  });
});

describe('BUG-001 biến thể (c) — authorize() không tham số phải tự đứng vững', () => {
  /* Lớp thứ hai: kể cả khi requireAuth hở, authorize() không được coi một
     object thiếu id/role là "đã đăng nhập". */
  const HONG = {
    'req.staff = {} (vé OTP trước bản vá)': {},
    'req.staff chỉ có id, không role (vé chat trước bản vá)': { id: ID_CAN_BO },
    'id là chuỗi': { id: '3', role: 'admin' },
    'id không phải số nguyên dương': { id: 0, role: 'admin' },
    'role ngoài danh sách vai trò cán bộ': { id: ID_CAN_BO, role: 'chat_reporter' },
  };
  for (const [ten, staff] of Object.entries(HONG)) {
    test(`${ten} -> authorize() KHÔNG gọi next`, () => {
      const res = resGia();
      let daGoiNext = false;
      authorize()({ staff }, res, () => { daGoiNext = true; });
      assert.equal(daGoiNext, false);
      assert.ok(res.statusCode === 401 || res.statusCode === 403, `mã trả về ${res.statusCode}`);
    });
  }

  for (const role of ['admin', 'manager', 'handler']) {
    test(`đối chứng: cán bộ hợp lệ role=${role} -> authorize() cho qua`, () => {
      let daGoiNext = false;
      authorize()({ staff: { id: ID_CAN_BO, role } }, resGia(), () => { daGoiNext = true; });
      assert.equal(daGoiNext, true);
    });
  }
});

describe('BUG-001 — đường thật qua HTTP: vé chat vào /api/admin', () => {
  async function goi(duongDan, token) {
    const app = express();
    app.use(express.json());
    app.use('/api/admin', adminRouter);
    const server = app.listen(0);
    try {
      const { port } = server.address();
      const r = await fetch(`http://127.0.0.1:${port}${duongDan}`, {
        headers: { authorization: `Bearer ${token}` },
      });
      return r.status;
    } finally {
      server.close();
    }
  }

  for (const duongDan of ['/api/admin/trash', '/api/admin/submissions', '/api/admin/staff', '/api/admin/dashboard/stats']) {
    test(`GET ${duongDan} với vé chat sub trùng id cán bộ -> 401`, async () => {
      const token = VE['biến thể (e) — vé chat, sub trùng id cán bộ (chat.js)']();
      assert.equal(await goi(duongDan, token), 401);
    });
  }
});

describe('BUG-001 biến thể (d) — ba biến thể khởi động dùng chung đúng một lớp chặn', () => {
  /* Bản vá nằm ở lib/token.js + middleware. Chỉ phủ được cả ba máy chủ nếu cả
     ba cùng mount /api/admin từ routes/admin/index.js (nơi gắn requireAuth),
     không máy chủ nào tự dựng lớp xác thực riêng. */
  for (const tep of ['index.js', 'may-chu-can-bo.js', 'may-chu-cong-khai.js']) {
    test(`${tep}: /api/admin (nếu có) mount adminRouter từ routes/admin/index.js`, async () => {
      const nguon = await readFile(new URL(`../src/${tep}`, import.meta.url), 'utf8');
      const cacMount = [...nguon.matchAll(/app\.use\(\s*['"]\/api\/admin['"]\s*,\s*([^)]+)\)/g)].map((m) => m[1].trim());
      for (const m of cacMount) {
        assert.equal(m, 'adminRouter', `${tep} mount /api/admin bằng "${m}" — không qua requireAuth dùng chung`);
      }
      if (cacMount.length > 0) {
        assert.match(nguon, /import adminRouter from '\.\/routes\/admin\/index\.js'/);
      }
    });
  }

  test('req.staff chỉ được gắn ở middleware/auth.js — không có lớp xác thực song song', async () => {
    const { readdir } = await import('node:fs/promises');
    const goc = new URL('../src/', import.meta.url);
    const cacTep = (await readdir(goc, { recursive: true })).filter((f) => f.endsWith('.js'));
    const vi = [];
    for (const f of cacTep) {
      // Bỏ chú thích: trích dẫn trong chú thích không phải mã đang chạy.
      const nguon = (await readFile(new URL(f.replaceAll('\\', '/'), goc), 'utf8'))
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/[^\n]*/g, '');
      // Gán req.staff ở đâu ngoài requireAuth là một lớp xác thực song song.
      if (/req\.staff\s*=/.test(nguon) && !f.replaceAll('\\', '/').endsWith('middleware/auth.js')) vi.push(f);
    }
    assert.deepEqual(vi, [], 'req.staff chỉ được gắn ở middleware/auth.js');
  });
});
