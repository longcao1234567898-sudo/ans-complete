/**
 * VIỆC 9 (ADR-003) — GHI NHẬT KÝ MỌI HOẠT ĐỘNG CỦA CÁN BỘ
 *
 * Ba lớp canh:
 *   1. Quét mã nguồn: mọi route GHI/XOÁ của cán bộ phải ghi nhật ký; mọi mã
 *      hành động ghi ra phải có trong lib/danh-muc-nhat-ky.js. Thêm route mới
 *      mà quên thì đỏ ở đây — rải kiểm từng route là cách đã để sót (BUG-009).
 *   2. Chạy thật từng thao tác trước đây không để lại dấu vết.
 *   3. Việc xem/mang ra thứ nhạy cảm và việc không hoàn tác được: không ghi
 *      được nhật ký thì KHÔNG làm (ghiNhatKyTruoc).
 */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import express from 'express';
import cookieParser from 'cookie-parser';
import { datBienMoiTruongHopLe } from './helpers-test.js';
import { BO_QUA, dungCsdl, goi as goiGoc, TRUONG, PHO, CAN_BO, MAY_A } from './khung-sqlite.js';

datBienMoiTruongHopLe();

const { pool } = await import('../src/db.js');
const { signAccessToken, hashRefreshToken } = await import('../src/lib/token.js');
const { default: adminRouter } = await import('../src/routes/admin/index.js');
const { default: authRouter } = await import('../src/routes/auth.js');
const { MOI_HANH_DONG } = await import('../src/lib/danh-muc-nhat-ky.js');

/* ======================================================================== */
/* 1. Quét mã nguồn                                                          */
/* ======================================================================== */

const GOC = new URL('../src/', import.meta.url);
async function tepNguon(thuMuc = GOC, ra = []) {
  for (const d of await readdir(thuMuc, { withFileTypes: true })) {
    const u = new URL(d.name + (d.isDirectory() ? '/' : ''), thuMuc);
    if (d.isDirectory()) await tepNguon(u, ra); else if (d.name.endsWith('.js')) ra.push(u);
  }
  return ra;
}
const ten = (u) => u.pathname.split('/src/')[1];
const GHI_LOG = /ghiNhatKy(Truoc)?\(|INSERT INTO staff_activity_logs/;

/** Tách thân từng handler: từ router.xxx( tới router.xxx( kế tiếp */
function cacRoute(nguon) {
  const ms = [...nguon.matchAll(/router\.(get|post|put|patch|delete)\(\s*'([^']*)'/g)];
  return ms.map((m, i) => ({
    method: m[1].toUpperCase(), duong: m[2],
    than: nguon.slice(m.index, i + 1 < ms.length ? ms[i + 1].index : nguon.length),
  }));
}

/* Route ghi/xoá được miễn, kèm lý do. Thêm vào đây phải có lý do chính đáng. */
const MIEN = new Map([
  ['routes/auth.js POST /refresh', 'đổi phiên đăng nhập tự động, không phải thao tác của cán bộ'],
]);
/* Route ĐỌC vẫn phải ghi: mở hồ sơ, mở/xuất nhật ký, xuất dữ liệu, bản đồ */
const DOC_PHAI_GHI = [
  'routes/admin/submissions.js GET /:id',
  'routes/admin/reports.js GET /summary',
  'routes/admin/reports.js GET /details',
];

test('quét: mọi route ghi/xoá của cán bộ đều ghi nhật ký', async () => {
  const thieu = [];
  for (const u of await tepNguon()) {
    const t = ten(u);
    if (!t.startsWith('routes/admin/') && t !== 'routes/auth.js') continue;
    for (const r of cacRoute(await readFile(u, 'utf8'))) {
      const khoa = `${t} ${r.method} ${r.duong}`;
      const phaiGhi = r.method !== 'GET' ? !MIEN.has(khoa) : DOC_PHAI_GHI.includes(khoa);
      if (phaiGhi && !GHI_LOG.test(r.than)) thieu.push(khoa);
    }
  }
  assert.deepEqual(thieu, [], 'các route này làm thay đổi dữ liệu mà không để lại dấu vết');
});

/* Loại đối tượng (target_type) cũng là chuỗi chữ thường trong câu ghi — không phải mã hành động */
const LOAI_DOI_TUONG = new Set(['submission', 'device', 'news', 'traffic_hotspot', 'qr_point',
  'banned_word', 'incident_group', 'staff', 'log']);

test('quét: mọi mã hành động ghi ra đều có trong danh mục nhật ký', async () => {
  const khai = new Set(MOI_HANH_DONG);
  const la = [];
  for (const u of await tepNguon()) {
    const nguon = await readFile(u, 'utf8');
    const doan = [
      ...[...nguon.matchAll(/hanhDong:\s*([^,\n]+)/g)].map((m) => m[1]),
      ...[...nguon.matchAll(/INSERT INTO staff_activity_logs[\s\S]{0,400}?\]/g)].map((m) => m[0]),
    ];
    for (const d of doan) {
      /* Bỏ chuỗi đứng sau phép so (quyetDinh === 'go_khoa' ? ...): đó là giá trị
         đầu vào, không phải mã ghi ra */
      for (const [, so, ma] of d.matchAll(/([!=]==\s*)?'([a-z]+(?:_[a-z]+)*)'/g)) {
        if (!so && !khai.has(ma) && !LOAI_DOI_TUONG.has(ma)) la.push(`${ten(u)}: ${ma}`);
      }
    }
  }
  assert.deepEqual(la, [], 'mã hành động chưa khai ở lib/danh-muc-nhat-ky.js -> trang nhật ký hiện mã trần');
});

/* ======================================================================== */
/* 2. Chạy thật                                                              */
/* ======================================================================== */

let ctl;
const THEM = [
  `CREATE TABLE banned_words (id INTEGER PRIMARY KEY, word TEXT UNIQUE, word_type TEXT, is_active INT DEFAULT 1,
     added_by INT, created_at TEXT DEFAULT (NOW()))`,
  `CREATE TABLE qr_points (id INTEGER PRIMARY KEY, code TEXT UNIQUE, name TEXT, ward_id INT, note TEXT,
     is_active INT DEFAULT 1, created_by INT, created_at TEXT DEFAULT (NOW()))`,
  `CREATE TABLE refresh_tokens (id INTEGER PRIMARY KEY, staff_id INT, token_hash TEXT, expires_at TEXT,
     revoked INT DEFAULT 0, created_at TEXT DEFAULT (NOW()))`,
];
beforeEach(() => {
  if (BO_QUA) return;
  ctl = dungCsdl(pool, { themCau: THEM });
  const them = ctl.db.prepare(`INSERT INTO submissions (id, tracking_code, original_content, category_id, status,
      is_anonymous, to_giac_mat, ngoai_tham_quyen, deleted_at) VALUES (?,?,?,?,?,0,?,?,?)`);
  them.run(10, 'HS0010', 'NOIDUNG-10 phản ánh đèn đường', 3, 'processing', 0, 0, null);
  them.run(12, 'HS0012', 'NOIDUNG-12 tố cáo cán bộ nhận tiền', 1, 'processing', 1, 0, null);
  them.run(30, 'HS0030', 'NOIDUNG-30 trong thùng rác', 3, 'rejected', 0, 0, ctl.luc(60));
  ctl.db.exec(`INSERT INTO incident_groups (id, ward_id, category_id, first_submission_id, submission_count)
               VALUES (7, 1, 3, 10, 2)`);
  ctl.db.exec(`UPDATE submissions SET incident_group_id = 7 WHERE id = 10`);
});

const goi = (staff, method, duong, body) => goiGoc({
  duongGoc: '/api/admin', router: adminRouter, staff, signAccessToken, method, duong, body,
});
const dong = (action) => ctl.db.prepare('SELECT * FROM staff_activity_logs WHERE action = ? ORDER BY id').all(action);
const chiTiet = (d) => (d.details == null ? null : JSON.parse(d.details));

/** Câu ghi nhật ký ném lỗi — như hết chỗ đĩa, mất quyền INSERT */
function hongNhatKy() {
  const goc = pool.query;
  pool.query = async (sql, p) => {
    if (/INSERT INTO staff_activity_logs/i.test(String(sql))) throw new Error('ER_DISK_FULL giả lập');
    return goc(sql, p);
  };
}

test('mở chi tiết hồ sơ -> view_submission; mở lại trong 10 phút không ghi thêm; quá 10 phút ghi tiếp', { skip: BO_QUA }, async () => {
  for (let i = 0; i < 3; i++) assert.equal((await goi(CAN_BO, 'GET', '/submissions/10')).status, 200);
  assert.equal(dong('view_submission').length, 1);
  assert.equal(dong('view_submission')[0].staff_id, CAN_BO.id);
  ctl.troiQua(11);
  await goi(CAN_BO, 'GET', '/submissions/10');
  assert.equal(dong('view_submission').length, 2);
  await goi(TRUONG, 'GET', '/submissions/10');
  assert.equal(dong('view_submission').length, 3, 'người khác mở thì phải có dòng riêng');
});

test('lãnh đạo mở tin tố giác mật -> view_flagged_submission', { skip: BO_QUA }, async () => {
  const r = await goi(PHO, 'GET', '/submissions/12');
  assert.equal(r.status, 200, r.text);
  assert.equal(dong('view_flagged_submission').length, 1);
  assert.equal(dong('view_flagged_submission')[0].staff_id, PHO.id);
  assert.equal(dong('view_submission').length, 0);
});

test('không ghi được nhật ký thì KHÔNG mở tin tố giác mật (500, không lộ nội dung)', { skip: BO_QUA }, async () => {
  hongNhatKy();
  const r = await goi(TRUONG, 'GET', '/submissions/12');
  assert.equal(r.status, 500);
  assert.doesNotMatch(r.text, /NOIDUNG-12/);
});

test('đổi trạng thái -> update_status, ghi trạng thái cũ và mới', { skip: BO_QUA }, async () => {
  const r = await goi(CAN_BO, 'PATCH', '/submissions/10/status', { status: 'resolved', note: 'xong' });
  assert.equal(r.status, 200, r.text);
  const d = dong('update_status');
  assert.equal(d.length, 1);
  assert.equal(d[0].staff_id, CAN_BO.id);
  assert.deepEqual(chiTiet(d[0]), { cu: 'processing', moi: 'resolved' });
});

test('đóng hồ sơ có yêu cầu xoá danh tính -> erase_identity', { skip: BO_QUA }, async () => {
  ctl.db.exec(`INSERT INTO data_deletion_requests (submission_id, status) VALUES (10, 'pending')`);
  const r = await goi(CAN_BO, 'PATCH', '/submissions/10/status', { status: 'resolved' });
  assert.equal(r.status, 200, r.text);
  assert.equal(dong('erase_identity').length, 1);
});

test('thêm, xoá từ cấm -> banned_word_add, banned_word_delete kèm từ', { skip: BO_QUA }, async () => {
  assert.equal((await goi(TRUONG, 'POST', '/banned-words', { word: 'Lừa Đảo' })).status, 201);
  const id = ctl.db.prepare('SELECT id FROM banned_words').get().id;
  assert.equal((await goi(PHO, 'DELETE', `/banned-words/${id}`)).status, 200);
  assert.deepEqual(chiTiet(dong('banned_word_add')[0]), { tu: 'lừa đảo' });
  assert.deepEqual(chiTiet(dong('banned_word_delete')[0]), { tu: 'lừa đảo' });
  assert.equal(dong('banned_word_delete')[0].staff_id, PHO.id);
});

test('tạo, tắt, xoá điểm QR -> qr_create, qr_update, qr_delete', { skip: BO_QUA }, async () => {
  const t = await goi(TRUONG, 'POST', '/qr-points', { name: 'Nhà văn hoá thôn Đông', wardId: 1 });
  assert.equal(t.status, 201, t.text);
  assert.equal((await goi(TRUONG, 'PATCH', `/qr-points/${t.body.id}`, { isActive: false })).status, 200);
  assert.equal((await goi(TRUONG, 'DELETE', `/qr-points/${t.body.id}`)).status, 200);
  for (const a of ['qr_create', 'qr_update', 'qr_delete']) {
    assert.equal(dong(a).length, 1, a);
    assert.equal(Number(dong(a)[0].target_id), t.body.id, a);
  }
  assert.deepEqual(chiTiet(dong('qr_update')[0]), { batTat: false });
});

test('bỏ thiết bị tin cậy -> untrust_device', { skip: BO_QUA }, async () => {
  await goi(TRUONG, 'POST', '/chat/trusted-devices', { deviceId: MAY_A });
  const id = ctl.db.prepare(`SELECT id FROM blacklists WHERE kind = 'trusted_device'`).get().id;
  assert.equal((await goi(TRUONG, 'DELETE', `/chat/trusted-devices/${id}`)).status, 200);
  assert.equal(dong('untrust_device').length, 1);
});

test('đánh dấu đã xem nhóm sự kiện -> ack_incident_group (chỉ khi thật sự đánh dấu)', { skip: BO_QUA }, async () => {
  assert.equal((await goi(CAN_BO, 'POST', '/incident-groups/7/ack')).status, 200);
  assert.equal((await goi(CAN_BO, 'POST', '/incident-groups/999/ack')).status, 200);
  assert.equal(dong('ack_incident_group').length, 1);
  assert.equal(Number(dong('ack_incident_group')[0].target_id), 7);
});

test('xoá vĩnh viễn: ghi nhật ký TRƯỚC; không ghi được thì không xoá', { skip: BO_QUA }, async () => {
  hongNhatKy();
  const r = await goi(TRUONG, 'DELETE', '/trash/30');
  assert.equal(r.status, 500);
  assert.equal(ctl.db.prepare('SELECT COUNT(*) AS n FROM submissions WHERE id = 30').get().n, 1,
    'đã xoá vĩnh viễn mà không có dấu vết');
});

test('dọn sạch thùng rác: không ghi được nhật ký thì không xoá gì', { skip: BO_QUA }, async () => {
  hongNhatKy();
  const r = await goi(TRUONG, 'DELETE', '/trash');
  assert.equal(r.status, 500);
  assert.equal(ctl.db.prepare('SELECT COUNT(*) AS n FROM submissions WHERE deleted_at IS NOT NULL').get().n, 1);
});

test('đăng xuất -> logout, ghi đích danh theo phiên đăng nhập', { skip: BO_QUA }, async () => {
  const raw = 'phien-dang-nhap-thu-nghiem-0123456789abcdef';
  ctl.db.prepare('INSERT INTO refresh_tokens (staff_id, token_hash, expires_at) VALUES (?,?,?)')
    .run(PHO.id, hashRefreshToken(raw), ctl.luc(-600));
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/auth', authRouter);
  const sv = app.listen(0);
  try {
    const r = await fetch(`http://127.0.0.1:${sv.address().port}/api/auth/logout`, {
      method: 'POST', headers: { Cookie: `refreshToken=${raw}` },
    });
    assert.equal(r.status, 200);
  } finally { sv.close(); }
  assert.equal(dong('logout').length, 1);
  assert.equal(dong('logout')[0].staff_id, PHO.id);
});
