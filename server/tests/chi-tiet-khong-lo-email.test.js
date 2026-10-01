/**
 * BUG-010 — Trang chi tiết hồ sơ KHÔNG được trả email người gửi.
 *
 * Danh tính người gửi chỉ có MỘT cửa ra: POST /:id/reveal, với ba lớp (vai trò,
 * phân công, ghi nhật ký trước). GET /:id từng che tên và SĐT nhưng lại giải mã
 * email rồi trả nguyên văn, kèm cờ is_masked: true — nên mọi cán bộ, kể cả
 * handler mà /reveal chặn tuyệt đối, đọc được email của mọi người gửi chỉ bằng
 * cách mở hồ sơ, và không để lại một dòng nhật ký nào.
 *
 * Test kiểm theo RESPONSE, không theo tên cột: admin-detail-columns.test.js chỉ
 * quét chuỗi SQL, nên đã xanh suốt thời gian lỗi này tồn tại.
 *
 * Pool giả ở đây mô phỏng PHÉP CHIẾU của MySQL: chỉ trả những cột câu SELECT
 * thật sự chọn. Bản giả trả nguyên hàng bất kể SELECT sẽ làm test nói sai về
 * việc route có kéo cột nào lên hay không.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { readFile, readdir } from 'node:fs/promises';
import { datBienMoiTruongHopLe } from './helpers-test.js';

datBienMoiTruongHopLe();

const { pool } = await import('../src/db.js');
const { signAccessToken } = await import('../src/lib/token.js');
const { encrypt } = await import('../src/lib/crypto.js');
const { default: adminRouter } = await import('../src/routes/admin/index.js');

const TEN_THAT = 'Nguyễn Văn An';
const SDT_THAT = '0901234567';
const EMAIL_THAT = 'nguyenvanan1990@gmail.com';

const ADMIN   = { id: 1, username: 'admin', role: 'admin',   full_name: 'Quản trị' };
const MGR_CO  = { id: 2, username: 'mgr2',  role: 'manager', full_name: 'Được phân công' };
const MGR_KO  = { id: 3, username: 'mgr3',  role: 'manager', full_name: 'Không phân công' };
const HANDLER = { id: 4, username: 'cb4',   role: 'handler', full_name: 'Cán bộ xử lý' };

/** Hàng đầy đủ trong bảng submissions (đã JOIN), như MySQL đang lưu. */
function hangGoc({ email = EMAIL_THAT, ...them } = {}) {
  const h = {
    id: 10, tracking_code: 'ABC123', original_content: 'Phản ánh đèn đường hỏng.',
    ai_processed_content: null, category_id: 1, status: 'processing', urgency: 'normal',
    security_level: 'thuong', is_anonymous: 0, is_flagged: 0, flag_reason: null,
    sender_name: encrypt(TEN_THAT), sender_phone: encrypt(SDT_THAT), sender_email: encrypt(email),
    created_at: new Date(), updated_at: new Date(), deadline_at: new Date(Date.now() + 5 * 86400000),
    resolved_at: null, assigned_to: 2, resolved_by: null, reviewed_by: null, reviewed_at: null,
    rejection_reason: null, resolution_note: null, ward_id: null,
    incident_lat: null, incident_lng: null,
    identity_erased: 0, identity_erased_at: null, deleted_at: null,
    incident_group_id: null, device_id: 'thiet-bi-ngau-nhien',
    category_code: 'ha_tang', category_name: 'Hạ tầng', sla_days: 15,
    assigned_name: 'Được phân công', resolved_by_name: null, ward_name: null,
    ...them,
  };
  return h;
}

/**
 * Chiếu một hàng theo câu SELECT: giữ cột được chọn TRẦN (`s.cot,` hoặc `cot,` không
 * tiền tố) hoặc qua bí danh (`... AS cot`). Cố ý chiếu RỘNG tay: tên cột xuất hiện ở
 * đâu ngoài biểu thức `IS NOT NULL` cũng tính là được chọn — giả lập sai về phía
 * nghiêm hơn thì an toàn, sai về phía lỏng hơn thì test xanh oan. Biểu thức như `(s.cot IS NOT NULL) AS co_x`
 * cho ra `co_x`, không cho ra `cot`. Giá trị của bí danh tính theo đúng biểu
 * thức MySQL — chỉ hỗ trợ dạng `(s.cot IS NOT NULL) AS bi_danh`, dạng khác thì
 * báo lỗi để người viết bản vá biết mà mở rộng, không âm thầm trả sai.
 */
function chieu(sql, hang) {
  const sach = sql.replace(/\/\*[\s\S]*?\*\//g, ' ');
  const ra = {};
  for (const [cot, gt] of Object.entries(hang)) {
    const tran = new RegExp(`(?<![\\w.])(?:[a-z]+\\.)?${cot}\\b(?!\\s+IS\\b)`).test(sach);
    const biDanhCungTen = new RegExp(`\\b[a-z]+\\.[a-z_]+\\s+AS\\s+${cot}\\b`).test(sach);
    if (tran || biDanhCungTen) ra[cot] = gt;
  }
  for (const m of sach.matchAll(/\(\s*[a-z]+\.([a-z_]+)\s+IS\s+NOT\s+NULL\s*\)\s+AS\s+([a-z_]+)/gi)) {
    ra[m[2]] = hang[m[1]] === null || hang[m[1]] === undefined ? 0 : 1;
  }
  for (const m of sach.matchAll(/NULL AS ([a-z_]+)/g)) ra[m[1]] = null;
  return ra;
}

let hoSo;
let cacTruyVan;

function gaPool(hang) {
  hoSo = hang;
  cacTruyVan = [];
  pool.query = async (sql, params) => {
    cacTruyVan.push({ sql, params });
    if (/SELECT is_active FROM staff/i.test(sql)) return [[{ is_active: 1 }]];
    if (/information_schema\.columns/i.test(sql)) return [[{ 1: 1 }]];
    if (/WHERE s\.id = \?/.test(sql)) return [hoSo ? [chieu(sql, hoSo)] : []];
    if (/FROM submission_images|FROM status_history/i.test(sql)) return [[]];
    if (/SELECT assigned_to, sender_name, sender_phone, sender_email, is_anonymous FROM submissions/i.test(sql)) {
      return [hoSo ? [{ assigned_to: hoSo.assigned_to, sender_name: hoSo.sender_name,
        sender_phone: hoSo.sender_phone, sender_email: hoSo.sender_email, is_anonymous: hoSo.is_anonymous }] : []];
    }
    return [{ affectedRows: 1 }];
  };
}

async function goi(staff, method, duong) {
  const app = express();
  app.use(express.json());
  app.use('/api/admin', adminRouter);
  const server = app.listen(0);
  try {
    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}/api/admin${duong}`, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${signAccessToken(staff)}` },
    });
    const text = await res.text();
    let body = {};
    try { body = JSON.parse(text); } catch { /* để trống */ }
    return { status: res.status, body, text };
  } finally {
    server.close();
  }
}

/* Đếm dòng nhật ký XEM DANH TÍNH. Từ ADR-003 việc 9, mở chi tiết hồ sơ có ghi
   một dòng view_submission (lượt mở, không phải lượt xem danh tính) — dòng đó
   không tính ở đây. */
const soDongNhatKy = () => cacTruyVan.filter((t) => /INSERT INTO staff_activity_logs/i.test(t.sql)
  && (t.params || []).includes('reveal_identity')).length;

/** Khẳng định response không chứa bất kỳ mảnh danh tính nào — kể cả bản mã. */
function khongLoDanhTinh(r, { ten = TEN_THAT, sdt = SDT_THAT, email = EMAIL_THAT, manh = [] } = {}) {
  for (const chuoi of [ten, sdt, email, ...manh]) {
    if (!chuoi) continue;
    assert.ok(!r.text.includes(chuoi), `Response lộ "${chuoi}"`);
  }
  for (const banMa of [hoSo.sender_name, hoSo.sender_phone, hoSo.sender_email]) {
    if (!banMa) continue;
    assert.ok(!r.text.includes(banMa), 'Response chứa bản mã danh tính — không có lý do gì để trả ra');
  }
}

/* ---- (a) Kịch bản gốc ------------------------------------------------- */

for (const [ten, cb] of [['handler', HANDLER], ['manager KHÔNG phân công', MGR_KO],
                         ['manager ĐƯỢC phân công', MGR_CO], ['admin', ADMIN]]) {
  test(`(a) ${ten} GET /submissions/10 -> không thấy email, không thấy bản mã`, async () => {
    gaPool(hangGoc());
    const r = await goi(cb, 'GET', '/submissions/10');
    assert.equal(r.status, 200);
    assert.equal(r.body.sender_email, undefined, 'GET /:id không được có trường sender_email');
    khongLoDanhTinh(r);
    assert.equal(soDongNhatKy(), 0, 'GET /:id không xem danh tính nên không có dòng reveal_identity');
  });
}

test('(a) giao diện vẫn biết hồ sơ CÓ email hay không (co_email)', async () => {
  gaPool(hangGoc());
  const co = await goi(HANDLER, 'GET', '/submissions/10');
  assert.equal(co.body.co_email, true);

  gaPool(hangGoc({ email: null, sender_email: null }));
  const khong = await goi(HANDLER, 'GET', '/submissions/10');
  assert.equal(khong.status, 200);
  assert.equal(khong.body.co_email, false);
});

/* ---- (c) Chất lượng lớp che: email không có khoảng trắng là MỘT từ với maskName -- */

for (const [email, manh] of [
  ['nguyenvanan1990@gmail.com', ['nguyenvanan1990']],
  ['a@b.vn', []],
  ['an@congty-cua-an.vn', ['congty-cua-an']],
  ['nguyen van an@xa-phuong.vn', ['nguyen van an', 'xa-phuong']],
  ['Trần.Thị.Bình+tố-giác@mail.vn', ['Trần.Thị.Bình']],
]) {
  test(`(c) email "${email}" không lọt ra dưới bất kỳ dạng nào`, async () => {
    gaPool(hangGoc({ email }));
    const r = await goi(HANDLER, 'GET', '/submissions/10');
    assert.equal(r.status, 200);
    khongLoDanhTinh(r, { email, manh });
  });
}

/* ---- (e) Tham số id bị MySQL ép kiểu ----------------------------------- */

for (const id of ['10abc', '010', '10%20']) {
  test(`(e) GET /submissions/${id} cũng không lộ email`, async () => {
    gaPool(hangGoc());
    const r = await goi(HANDLER, 'GET', `/submissions/${id}`);
    khongLoDanhTinh(r);
  });
}

/* ---- (g) is_masked: true phải đúng sự thật với MỌI trường danh tính ---- */

test('(g) is_masked: true -> không trường nào trong response mang danh tính giải mã đầy đủ', async () => {
  gaPool(hangGoc());
  const r = await goi(HANDLER, 'GET', '/submissions/10');
  assert.equal(r.body.is_masked, true);
  for (const [k, v] of Object.entries(r.body)) {
    if (typeof v !== 'string') continue;
    for (const chuoi of [TEN_THAT, SDT_THAT, EMAIL_THAT]) {
      assert.ok(!v.includes(chuoi), `Trường ${k} mang danh tính đầy đủ trong khi is_masked = true`);
    }
  }
});

/* ---- (h) Hồ sơ đã xoá danh tính / trong thùng rác / ẩn danh ------------ */

test('(h) identity_erased: danh tính NULL -> 200, không chuỗi rác, co_email = false', async () => {
  gaPool(hangGoc({ email: null, sender_name: null, sender_phone: null, sender_email: null,
    identity_erased: 1, identity_erased_at: new Date() }));
  const r = await goi(HANDLER, 'GET', '/submissions/10');
  assert.equal(r.status, 200);
  assert.equal(r.body.co_email, false);
  assert.ok(!/Không giải mã được|Dữ liệu hỏng/.test(r.text), 'Không được trả chuỗi lỗi giải mã');
});

test('(h) hồ sơ trong thùng rác -> 200, không lộ email', async () => {
  gaPool(hangGoc({ deleted_at: new Date() }));
  const r = await goi(HANDLER, 'GET', '/submissions/10');
  assert.equal(r.status, 200);
  khongLoDanhTinh(r);
});

test('(h) hồ sơ ẩn danh -> co_email = false', async () => {
  gaPool(hangGoc({ email: null, sender_name: null, sender_phone: null, sender_email: null, is_anonymous: 1 }));
  const r = await goi(HANDLER, 'GET', '/submissions/10');
  assert.equal(r.status, 200);
  assert.equal(r.body.co_email, false);
});

/* ---- (i) Không hồi quy: /reveal vẫn là cửa ra email đầy đủ ------------- */

test('(i) manager ĐƯỢC phân công /reveal vẫn thấy email đầy đủ, có nhật ký', async () => {
  gaPool(hangGoc());
  const r = await goi(MGR_CO, 'POST', '/submissions/10/reveal');
  assert.equal(r.status, 200);
  assert.equal(r.body.sender_email, EMAIL_THAT);
  assert.equal(soDongNhatKy(), 1);
});

test('(i) handler /reveal vẫn 403', async () => {
  gaPool(hangGoc());
  const r = await goi(HANDLER, 'POST', '/submissions/10/reveal');
  assert.equal(r.status, 403);
  assert.ok(!r.text.includes(EMAIL_THAT));
});

/* ---- (d) Đường khác tới cùng cột --------------------------------------- */

/* Cửa ra DUY NHẤT của email giải mã là handler /reveal. Route admin mới nào
   giải mã sender_email là mở thêm một cửa thứ hai không có ba lớp kia. */
test('(d) trong routes/admin, chỉ handler /reveal được giải mã sender_email', async () => {
  const thuMuc = new URL('../src/routes/admin/', import.meta.url);
  const viPham = [];
  for (const ten of await readdir(thuMuc)) {
    if (!ten.endsWith('.js')) continue;
    const ma = await readFile(new URL(ten, thuMuc), 'utf8');
    const reveal = ten === 'submissions.js' ? ma.indexOf("router.post('/:id/reveal'") : -1;
    const hetReveal = reveal > -1 ? ma.indexOf('router.', reveal + 10) : -1;
    for (const m of ma.matchAll(/decrypt\([^)]*sender_email/g)) {
      const trongReveal = reveal > -1 && m.index > reveal && m.index < hetReveal;
      if (!trongReveal) viPham.push(`${ten}:${ma.slice(0, m.index).split('\n').length}`);
    }
  }
  assert.deepEqual(viPham, [], `Giải mã sender_email ngoài /reveal: ${viPham.join(', ')}`);
});
