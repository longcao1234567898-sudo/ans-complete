/**
 * BUG-009 — Cấp độ bảo mật hồ sơ phải được THỰC THI ở backend, không chỉ là nhãn.
 *
 * Chính sách (Loc chốt P38 + phiên FIX, ADR-002 §3):
 *   thuong      — mọi cán bộ
 *   can_bao_ve  — admin, manager, và người đang được giao hồ sơ
 *   mat         — CHỈ admin và người admin giao (manager không, trừ khi được giao)
 *   không đọc được mức (NULL, giá trị lạ, thiếu cột) — coi là mat
 * Người không đủ quyền: không hiện trong danh sách, không tính vào total, truy
 * cập trực tiếp trả 404 như hồ sơ không tồn tại. Chặn cả ĐỌC lẫn GHI.
 *
 * Bảng mong đợi `duocXem` dưới đây viết lại từ bảng chính sách, KHÔNG gọi mã
 * sản phẩm — test không được dùng chính hàm cần kiểm để tính đáp án.
 *
 * Mỗi nhóm test ứng một biến thể trong Bug Log: (a) chi tiết · (b) danh sách
 * với mọi tổ hợp lọc · (c) chat đọc/gửi · (d) bề mặt phụ · (e) thao tác ghi ·
 * (f) can_bao_ve và người phụ trách · (g) NULL/giá trị lạ (thiếu cột: tệp
 * cap-do-bao-mat-thieu-cot.test.js) · (h) đổi mức · (i) hai điểm vào máy chủ.
 *
 * Câu SQL của route chạy NGUYÊN VĂN trên node:sqlite qua HTTP thật.
 * Node < 22 -> BỎ QUA (hiện rõ trong output), không âm thầm xanh.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { datBienMoiTruongHopLe } from './helpers-test.js';
import {
  dungCsdl, goi as goiGoc, ADMIN, MGR, MGR2, H, H2, MOI_CAN_BO,
} from './gia-lap/csdl-cap-do.js';

datBienMoiTruongHopLe();

const { pool } = await import('../src/db.js');
const { signAccessToken } = await import('../src/lib/token.js');
const { encrypt } = await import('../src/lib/crypto.js');
const { default: adminRouter } = await import('../src/routes/admin/index.js');

const sqlite = await import('node:sqlite').catch(() => null);
const BO_QUA = sqlite ? false : 'cần node:sqlite (Node ≥ 22) để chạy câu SQL thật';

const goc = (duong) => new URL(`../../${duong}`, import.meta.url);
const goi = (staff, method, duong, body) => goiGoc(adminRouter, signAccessToken, staff, method, duong, body);

/* ------------------------------------------------------------------------ */
/* Dữ liệu                                                                   */
/* ------------------------------------------------------------------------ */

/* Hồ sơ không phải 'thuong' mang dấu BIMAT-<id> trong nội dung: thấy dấu này ở
   đâu trong phản hồi của người không đủ quyền là rò. */
const HO_SO = [
  { id: 10, muc: 'mat',        giao: null },
  { id: 11, muc: 'mat',        giao: H2.id },
  { id: 12, muc: 'mat',        giao: MGR.id },
  { id: 13, muc: 'mat',        giao: null, spam: 1 },                        // nghi rác
  { id: 14, muc: 'mat',        giao: null, spam: 1, xoa: true, st: 'spam' }, // thùng rác
  { id: 15, muc: 'mat',        giao: null, spam: 1, may: 'may-khieu-nai' },  // khiếu nại
  { id: 16, muc: 'mat',        giao: null, st: 'pending_review', an: 1 },    // hàng chờ
  { id: 20, muc: 'can_bao_ve', giao: null,   nhom: 2 },
  { id: 21, muc: 'can_bao_ve', giao: H.id },
  { id: 30, muc: 'thuong',     giao: null,   nhom: 1 },
  { id: 31, muc: 'thuong',     giao: H2.id,  nhom: 2 },
  { id: 32, muc: 'thuong',     giao: null,   nhom: 3 },
  { id: 33, muc: 'thuong',     giao: null,   nhom: 3 },
  { id: 40, muc: null,         giao: null },   // NULL — dữ liệu cũ/lạ
  { id: 41, muc: 'la_lung',    giao: null },   // giá trị ngoài ENUM
  /* '' — MySQL không nghiêm ngặt lưu giá trị ENUM lạ thành chuỗi rỗng. Coi là
     Mật; người đang được giao không rõ do ai chọn -> tệp v24 phải gỡ. */
  { id: 42, muc: '',           giao: H.id },
];
HO_SO.find((x) => x.id === 10).nhom = 1;

/* Nhóm sự kiện: đơn đầu tiên là thành viên (routes/submissions.js gán
   incident_group_id cho cả đơn khớp lẫn đơn mới) */
const NHOM = [
  { id: 1, dau: 10, thanhVien: [10, 30] },   // Mật + Thường
  { id: 2, dau: 20, thanhVien: [20, 31] },   // Cần bảo vệ + Thường
  { id: 3, dau: 32, thanhVien: [32, 33] },   // toàn Thường
];

const chuanMuc = (muc) => (['thuong', 'can_bao_ve', 'mat'].includes(muc) ? muc : 'mat');

/** Bảng mong đợi — viết từ chính sách, không từ mã */
function duocXem(staff, hs) {
  if (staff.role === 'admin') return true;
  const muc = chuanMuc(hs.muc);
  if (muc === 'thuong') return true;
  if (hs.giao === staff.id) return true;
  return muc === 'can_bao_ve' && staff.role === 'manager';
}
const hs = (id) => HO_SO.find((x) => x.id === id);
const dau = (id) => `BIMAT-${id}`;
const ma = (id) => `HS${String(id).padStart(4, '0')}`;

let db;
function napDuLieu() {
  db = dungCsdl(sqlite, pool);
  const mai = new Date(Date.now() + 24 * 3600_000).toISOString().slice(0, 19).replace('T', ' ');
  const them = db.prepare(`INSERT INTO submissions
      (id, tracking_code, original_content, category_id, status, urgency, security_level, is_anonymous,
       sender_name, sender_phone, deadline_at, assigned_to, is_spam, deleted_at, deleted_by, device_id,
       ward_id, incident_group_id)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  for (const h of HO_SO) {
    const noiDung = h.muc === 'thuong' ? `Phản ánh thường số ${h.id}` : `${dau(h.id)} tố giác đường dây ma tuý ${h.id}`;
    them.run(h.id, ma(h.id), noiDung, 1, h.st ?? 'processing', 'urgent', h.muc, h.an ?? 0,
      h.an ? null : encrypt('Nguyễn Văn An'), h.an ? null : encrypt('0901234567'), mai, h.giao,
      h.spam ?? 0, h.xoa ? '2020-01-01 00:00:00' : null, h.xoa ? ADMIN.id : null, h.may ?? null,
      1, h.nhom ?? null);
  }
  /* Thùng rác tự dọn tin quá 7 ngày khi mở — hồ sơ 14 phải còn đó */
  db.prepare(`UPDATE submissions SET deleted_at = NOW() WHERE id = 14`).run();
  for (const id of [10, 11, 20, 30]) {
    db.prepare(`INSERT INTO report_messages (submission_id, sender_type, message) VALUES (?, 'reporter', ?)`)
      .run(id, `${dau(id)} tin nhắn người báo`);
  }
  for (const n of NHOM) {
    db.prepare(`INSERT INTO incident_groups (id, ward_id, category_id, first_submission_id, submission_count,
        first_reported_at, last_reported_at) VALUES (?, 1, 1, ?, ?, NOW(), NOW())`).run(n.id, n.dau, n.thanhVien.length);
  }
  db.prepare(`INSERT INTO unlock_appeals (identifier, kind, content) VALUES ('may-khieu-nai', 'device', 'Xin mở khoá')`).run();
}

const mucHienTai = (id) => db.prepare('SELECT security_level AS m FROM submissions WHERE id = ?').get(id).m;
const giaoHienTai = (id) => db.prepare('SELECT assigned_to AS g FROM submissions WHERE id = ?').get(id).g;
const hang = (id) => ({ ...db.prepare('SELECT * FROM submissions WHERE id = ?').get(id) });

/** Không một dấu nội dung nào của hồ sơ người này không được xem */
function khongRo(staff, text, boiCanh) {
  for (const h of HO_SO) {
    if (duocXem(staff, h)) continue;
    assert.ok(!text.includes(dau(h.id)), `${boiCanh}: ${staff.role}#${staff.id} thấy nội dung hồ sơ ${h.id} (${h.muc})`);
    assert.ok(!text.includes(ma(h.id)), `${boiCanh}: ${staff.role}#${staff.id} thấy mã hồ sơ ${h.id} (${h.muc})`);
  }
}

/* ======================================================================== */
/* (a) Chi tiết                                                              */
/* ======================================================================== */

test('(a) GET /submissions/:id — đúng bảng chính sách cho mọi cán bộ × mọi hồ sơ; bị ẩn thì 404 y như không tồn tại', { skip: BO_QUA }, async () => {
  napDuLieu();
  const khongCo = await goi(ADMIN, 'GET', '/submissions/999');
  assert.equal(khongCo.status, 404);
  for (const staff of MOI_CAN_BO) {
    for (const h of HO_SO) {
      const r = await goi(staff, 'GET', `/submissions/${h.id}`);
      if (duocXem(staff, h)) {
        assert.equal(r.status, 200, `${staff.role}#${staff.id} phải xem được hồ sơ ${h.id} (${h.muc}): ${r.text.slice(0, 200)}`);
      } else {
        assert.equal(r.status, 404, `${staff.role}#${staff.id} KHÔNG được xem hồ sơ ${h.id} (${h.muc}), nhận ${r.status}`);
        assert.deepEqual(r.body, khongCo.body, 'phản hồi hồ sơ bị ẩn phải y hệt hồ sơ không tồn tại');
      }
    }
  }
});

test('(a)(g) chi tiết trả mức đã chuẩn hoá: NULL / giá trị lạ hiện là mat', { skip: BO_QUA }, async () => {
  napDuLieu();
  for (const id of [40, 41]) {
    const r = await goi(ADMIN, 'GET', `/submissions/${id}`);
    assert.equal(r.status, 200);
    assert.equal(r.body.security_level, 'mat', `hồ sơ ${id}`);
  }
});

/* ======================================================================== */
/* (b) Danh sách — mọi tổ hợp lọc, mọi trang, total không đếm hồ sơ bị ẩn     */
/* ======================================================================== */

const TO_HOP_LOC = [
  {},
  { status: 'all' },
  { nghiRac: '1' },
  { status: 'pending_review' },
  { status: 'all', q: 'BIMAT' },
  { status: 'all', q: 'ma tuy' },
  { status: 'all', q: ma(10) },
  { status: 'all', assigned: String(H2.id) },
  { status: 'all', assigned: String(MGR.id) },
  { status: 'all', assigned: 'none' },
  { status: 'all', assigned: 'me' },
  { status: 'all', sort: 'theo_can_bo' },
  { status: 'all', sla: 'near' },
  { status: 'all', urgency: 'urgent' },
];

async function docHetDanhSach(staff, loc) {
  const ids = [];
  let tong = null;
  let text = '';
  for (let page = 1; page <= 20; page++) {
    const qs = new URLSearchParams({ ...loc, page: String(page), limit: '5' });
    const r = await goi(staff, 'GET', `/submissions?${qs}`);
    assert.equal(r.status, 200, `${JSON.stringify(loc)}: ${r.text.slice(0, 200)}`);
    text += r.text;
    tong = r.body.total;
    ids.push(...r.body.data.map((d) => d.id));
    if (page >= r.body.totalPages) break;
  }
  return { ids, tong, text };
}

test('(b) GET /submissions — mọi tổ hợp lọc × mọi trang: chỉ hồ sơ được xem, total đếm đúng số đó', { skip: BO_QUA }, async () => {
  napDuLieu();
  for (const staff of MOI_CAN_BO) {
    for (const loc of TO_HOP_LOC) {
      const { ids, tong, text } = await docHetDanhSach(staff, loc);
      for (const id of ids) {
        assert.ok(duocXem(staff, hs(id)), `${staff.role}#${staff.id} ${JSON.stringify(loc)}: danh sách lộ hồ sơ ${id} (${hs(id).muc})`);
      }
      assert.equal(tong, ids.length, `${staff.role}#${staff.id} ${JSON.stringify(loc)}: total ${tong} ≠ số dòng xem được ${ids.length}`);
      khongRo(staff, text, `danh sách ${JSON.stringify(loc)}`);
    }
  }
});

test('(b) chứng test không rỗng: admin tìm "BIMAT" thấy hồ sơ Mật; handler tìm thì total = số hồ sơ mình được xem', { skip: BO_QUA }, async () => {
  napDuLieu();
  const a = await docHetDanhSach(ADMIN, { status: 'all', q: 'BIMAT' });
  assert.ok(a.ids.includes(10) && a.ids.includes(12), 'admin phải thấy hồ sơ Mật khi tìm');
  const h = await docHetDanhSach(H, { status: 'all', q: 'BIMAT' });
  assert.deepEqual(h.ids.sort(), [21, 42], 'handler H chỉ khớp hai hồ sơ không-thường đang giao cho mình');
  assert.equal(h.tong, 2);
});

/* ======================================================================== */
/* (c) Chat — đọc VÀ gửi                                                    */
/* ======================================================================== */

test('(c) chat GET/POST: bị ẩn thì 404 và không tin nhắn nào được ghi; được xem thì chạy như cũ', { skip: BO_QUA }, async () => {
  napDuLieu();
  const soTin = (id) => db.prepare('SELECT COUNT(*) AS n FROM report_messages WHERE submission_id = ?').get(id).n;
  for (const staff of MOI_CAN_BO) {
    for (const id of [10, 11, 20, 30]) {
      const doc = await goi(staff, 'GET', `/chat/${id}/messages`);
      const truoc = soTin(id);
      const gui = await goi(staff, 'POST', `/chat/${id}/messages`, { message: 'Anh/chị cho hỏi thêm' });
      if (duocXem(staff, hs(id))) {
        assert.equal(doc.status, 200, `${staff.role}#${staff.id} đọc chat ${id}`);
        assert.equal(gui.status, 201, `${staff.role}#${staff.id} gửi chat ${id}`);
      } else {
        assert.equal(doc.status, 404, `${staff.role}#${staff.id} ĐỌC được chat hồ sơ ${id} (${hs(id).muc})`);
        assert.equal(gui.status, 404, `${staff.role}#${staff.id} GỬI được tin cho người báo hồ sơ ${id} (${hs(id).muc})`);
        assert.equal(soTin(id), truoc, 'không được ghi tin nhắn');
        khongRo(staff, doc.text, `chat ${id}`);
      }
    }
  }
});

/* ======================================================================== */
/* (d) Bề mặt phụ                                                            */
/* ======================================================================== */

/* Nhóm có một thành viên người xem không được đọc thì KHÔNG hiện với người đó:
   số đếm, giờ nhận, id đơn đầu của nhóm đều là dấu vết hồ sơ bị ẩn tồn tại
   (chính sách P38 #3 — trọng tài P44 chứng minh g.* lộ first_submission_id). */
const thayNhom = (staff, n) => n.thanhVien.every((id) => duocXem(staff, hs(id)));

test('(d) nhóm sự kiện: nhóm chứa hồ sơ bị ẩn không hiện ở danh sách, chi tiết 404, không lộ gì', { skip: BO_QUA }, async () => {
  napDuLieu();
  const khongCo = await goi(ADMIN, 'GET', '/incident-groups/999');
  for (const staff of MOI_CAN_BO) {
    const ds = await goi(staff, 'GET', '/incident-groups');
    assert.equal(ds.status, 200, ds.text.slice(0, 200));
    assert.deepEqual(ds.body.data.map((g) => g.id).sort(), NHOM.filter((n) => thayNhom(staff, n)).map((n) => n.id),
      `${staff.role}#${staff.id}: danh sách nhóm`);
    khongRo(staff, ds.text, 'nhóm sự kiện (danh sách)');
    for (const n of NHOM) {
      const ct = await goi(staff, 'GET', `/incident-groups/${n.id}`);
      if (thayNhom(staff, n)) {
        assert.equal(ct.status, 200, ct.text.slice(0, 200));
        assert.deepEqual(ct.body.members.map((m) => m.id).sort(), n.thanhVien);
      } else {
        assert.equal(ct.status, 404, `${staff.role}#${staff.id} mở được nhóm ${n.id}: ${ct.text.slice(0, 200)}`);
        assert.deepEqual(ct.body, khongCo.body, 'nhóm bị ẩn phải y như nhóm không tồn tại');
      }
      khongRo(staff, ct.text, `nhóm sự kiện ${n.id} (chi tiết)`);
    }
  }
  const ad = await goi(ADMIN, 'GET', '/incident-groups');
  assert.ok(ad.text.includes(dau(10)), 'admin phải thấy trích đoạn');
  assert.equal((await goi(H, 'GET', '/incident-groups/3')).status, 200, 'nhóm toàn hồ sơ thường vẫn mở cho handler');
});

test('(d) chi tiết hồ sơ Thường không trỏ tới nhóm bị ẩn (incident_group_id là dấu vết tồn tại) — trọng tài P44 vòng 2', { skip: BO_QUA }, async () => {
  napDuLieu();
  for (const staff of MOI_CAN_BO) {
    for (const h of HO_SO.filter((x) => x.nhom && duocXem(staff, x))) {
      const r = await goi(staff, 'GET', `/submissions/${h.id}`);
      assert.equal(r.status, 200);
      const nhom = NHOM.find((n) => n.id === h.nhom);
      assert.equal(r.body.incident_group_id, thayNhom(staff, nhom) ? nhom.id : null,
        `${staff.role}#${staff.id} hồ sơ ${h.id}: incident_group_id`);
    }
  }
});

test('(e) đánh dấu đã xem nhóm bị ẩn: không đổi gì, phản hồi y như nhóm không tồn tại — trọng tài P44 vòng 2', { skip: BO_QUA }, async () => {
  napDuLieu();
  const daXem = (id) => db.prepare('SELECT acknowledged AS a FROM incident_groups WHERE id = ?').get(id).a;
  const khongCo = await goi(H, 'POST', '/incident-groups/999/ack');
  const r = await goi(H, 'POST', '/incident-groups/1/ack');
  assert.equal(r.status, khongCo.status);
  assert.deepEqual(r.body, khongCo.body, 'phản hồi không được khác nhóm không tồn tại');
  assert.equal(daXem(1), 0, 'handler đánh dấu được nhóm chứa hồ sơ Mật -> nhóm biến khỏi bảng điều hành của Trưởng');
  await goi(H, 'POST', '/incident-groups/3/ack');
  assert.equal(daXem(3), 1, 'nhóm handler xem được vẫn đánh dấu được');
});

test('(d) bảng điều hành: canGap, recent, nhomTrungLap không lộ; số điều hành khớp danh sách', { skip: BO_QUA }, async () => {
  napDuLieu();
  for (const staff of MOI_CAN_BO) {
    const r = await goi(staff, 'GET', '/dashboard/stats');
    assert.equal(r.status, 200, r.text.slice(0, 200));
    khongRo(staff, r.text, 'bảng điều hành');
    assert.deepEqual(r.body.nhomTrungLap.map((g) => g.id).sort(), NHOM.filter((n) => thayNhom(staff, n)).map((n) => n.id),
      `${staff.role}#${staff.id}: nhóm trùng lặp trên bảng điều hành`);
    /* Thẻ "Chưa phân công" bấm vào ra danh sách lọc assigned=none: hai số phải bằng nhau */
    const ds = await docHetDanhSach(staff, { assigned: 'none' });
    assert.equal(r.body.dieuHanh.chua_phan_cong, ds.tong,
      `${staff.role}#${staff.id}: thẻ chưa phân công ${r.body.dieuHanh.chua_phan_cong} ≠ danh sách ${ds.tong}`);
  }
  const a = await goi(ADMIN, 'GET', '/dashboard/stats');
  assert.ok(a.text.includes(dau(10)), 'admin phải thấy hồ sơ Mật trong việc cần gấp');
});

test('(d) thùng rác: danh sách không lộ, khôi phục hồ sơ bị ẩn trả 404 và hồ sơ vẫn trong thùng', { skip: BO_QUA }, async () => {
  napDuLieu();
  for (const staff of MOI_CAN_BO) {
    const r = await goi(staff, 'GET', '/trash');
    assert.equal(r.status, 200, r.text.slice(0, 200));
    khongRo(staff, r.text, 'thùng rác');
  }
  const a = await goi(ADMIN, 'GET', '/trash');
  assert.ok(a.body.items.some((i) => i.id === 14), 'admin phải thấy hồ sơ Mật trong thùng rác');
  const kp = await goi(H, 'POST', '/trash/14/restore');
  assert.equal(kp.status, 404, 'handler khôi phục được hồ sơ Mật khỏi thùng rác');
  assert.ok(hang(14).deleted_at, 'hồ sơ phải còn trong thùng rác');
});

test('(d) khiếu nại mở khoá: tinLienQuan không lộ hồ sơ bị ẩn', { skip: BO_QUA }, async () => {
  napDuLieu();
  for (const staff of MOI_CAN_BO) {
    const r = await goi(staff, 'GET', '/chat/khieu-nai');
    assert.equal(r.status, 200, r.text.slice(0, 200));
    khongRo(staff, r.text, 'khiếu nại');
  }
  const a = await goi(ADMIN, 'GET', '/chat/khieu-nai');
  assert.ok(a.text.includes(dau(15)), 'admin phải thấy tin liên quan');
});

test('(d) báo cáo chi tiết: manager không thấy hồ sơ Mật không giao cho mình', { skip: BO_QUA }, async () => {
  napDuLieu();
  for (const staff of [ADMIN, MGR, MGR2]) {
    const r = await goi(staff, 'GET', '/reports/details');
    assert.equal(r.status, 200, r.text.slice(0, 200));
    khongRo(staff, r.text, 'báo cáo chi tiết');
  }
  const m = await goi(MGR, 'GET', '/reports/details');
  assert.ok(m.text.includes(dau(12)), 'manager được Trưởng giao hồ sơ Mật phải thấy nó');
  assert.ok(m.text.includes(dau(20)), 'manager phải thấy hồ sơ Cần bảo vệ');
  const h = await goi(H, 'GET', '/reports/details');
  assert.equal(h.status, 403, 'báo cáo vẫn chỉ cho lãnh đạo (không hồi quy)');
});

/* ======================================================================== */
/* (e) Thao tác ghi                                                          */
/* ======================================================================== */

test('(e) handler ghi lên hồ sơ bị ẩn: status / review / mark-spam đều 404, dữ liệu không đổi', { skip: BO_QUA }, async () => {
  napDuLieu();
  const st = await goi(H, 'PATCH', '/submissions/10/status', { status: 'resolved', note: 'x' });
  assert.equal(st.status, 404, `đổi trạng thái hồ sơ Mật: ${st.status}`);
  assert.equal(hang(10).status, 'processing');

  const rv = await goi(H, 'POST', '/submissions/16/review', { action: 'spam' });
  assert.equal(rv.status, 404, `duyệt hồ sơ Mật ở hàng chờ: ${rv.status}`);
  assert.equal(hang(16).status, 'pending_review');
  assert.equal(hang(16).deleted_at, null);

  const ms = await goi(H, 'POST', '/submissions/10/mark-spam', { reason: 'bịa' });
  assert.equal(ms.status, 404, `đưa hồ sơ Mật vào thùng rác: ${ms.status}`);
  assert.equal(hang(10).deleted_at, null);

  /* Chứng test không rỗng: hồ sơ thường thì handler vẫn đổi được trạng thái */
  const ok = await goi(H, 'PATCH', '/submissions/30/status', { status: 'resolved', note: 'x' });
  assert.equal(ok.status, 200);
});

test('(e) phân công: manager không đụng được hồ sơ Mật (ẩn -> 404; được giao -> 403); admin giao được', { skip: BO_QUA }, async () => {
  napDuLieu();
  const an = await goi(MGR, 'PATCH', '/submissions/10/assign', { staffId: H.id });
  assert.equal(an.status, 404, `manager giao hồ sơ Mật không thấy được: ${an.status}`);
  assert.equal(giaoHienTai(10), null);

  const duocGiao = await goi(MGR, 'PATCH', '/submissions/12/assign', { staffId: H.id });
  assert.equal(duocGiao.status, 403, `manager chuyển giao hồ sơ Mật Trưởng giao cho mình: ${duocGiao.status}`);
  const boGiao = await goi(MGR, 'PATCH', '/submissions/12/assign', { staffId: null });
  assert.equal(boGiao.status, 403, `manager bỏ giao hồ sơ Mật: ${boGiao.status}`);
  assert.equal(giaoHienTai(12), MGR.id);

  const ad = await goi(ADMIN, 'PATCH', '/submissions/10/assign', { staffId: H.id });
  assert.equal(ad.status, 200);
  assert.equal((await goi(H, 'GET', '/submissions/10')).status, 200, 'người Trưởng giao phải xem được hồ sơ Mật');

  const kt = await goi(ADMIN, 'PATCH', '/submissions/999/assign', { staffId: H.id });
  assert.equal(kt.status, 404, 'giao hồ sơ không tồn tại');
});

test('(e) xem danh tính: manager không được giao hồ sơ Mật nhận 404 (không lộ tồn tại), không ghi lượt xem', { skip: BO_QUA }, async () => {
  napDuLieu();
  const r = await goi(MGR2, 'POST', '/submissions/12/reveal');
  assert.equal(r.status, 404, `nhận ${r.status}`);
  assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM staff_activity_logs WHERE action = 'reveal_identity'`).get().n, 0);
  const ok = await goi(MGR, 'POST', '/submissions/12/reveal');
  assert.equal(ok.status, 200, 'manager được Trưởng giao vẫn xem được danh tính');
});

/* ======================================================================== */
/* (f) Cần bảo vệ và người phụ trách                                         */
/* ======================================================================== */

test('(f) can_bao_ve: manager giao cho handler thì handler đó xem được, handler khác không', { skip: BO_QUA }, async () => {
  napDuLieu();
  assert.equal((await goi(H2, 'GET', '/submissions/20')).status, 404);
  const g = await goi(MGR, 'PATCH', '/submissions/20/assign', { staffId: H2.id });
  assert.equal(g.status, 200, g.text);
  assert.equal((await goi(H2, 'GET', '/submissions/20')).status, 200);
  assert.equal((await goi(H, 'GET', '/submissions/20')).status, 404);
});

/* ======================================================================== */
/* (h) Đổi mức                                                                */
/* ======================================================================== */

test('(h) chỉ admin đặt hoặc hạ mức Mật; manager đổi mức thường/cần bảo vệ như cũ', { skip: BO_QUA }, async () => {
  napDuLieu();
  const len = await goi(MGR, 'PATCH', '/submissions/30/security-level', { level: 'mat' });
  assert.equal(len.status, 403, `manager nâng lên Mật: ${len.status}`);
  assert.equal(mucHienTai(30), 'thuong');

  const ha = await goi(MGR, 'PATCH', '/submissions/12/security-level', { level: 'thuong' });
  assert.equal(ha.status, 403, `manager hạ hồ sơ Mật được giao cho mình: ${ha.status}`);
  assert.equal(mucHienTai(12), 'mat');

  const an = await goi(MGR, 'PATCH', '/submissions/10/security-level', { level: 'thuong' });
  assert.equal(an.status, 404, `manager hạ hồ sơ Mật không thấy được: ${an.status}`);
  assert.equal(mucHienTai(10), 'mat');

  const cbv = await goi(MGR, 'PATCH', '/submissions/30/security-level', { level: 'can_bao_ve' });
  assert.equal(cbv.status, 200, 'manager vẫn đổi được mức Cần bảo vệ');
  assert.equal(mucHienTai(30), 'can_bao_ve');
});

test('(h) admin nâng lên Mật thì gỡ phân công hiện tại; hạ/nâng đều ghi nhật ký', { skip: BO_QUA }, async () => {
  napDuLieu();
  const r = await goi(ADMIN, 'PATCH', '/submissions/21/security-level', { level: 'mat' });
  assert.equal(r.status, 200, r.text);
  assert.equal(mucHienTai(21), 'mat');
  assert.equal(giaoHienTai(21), null, 'nâng lên Mật phải gỡ người đang được giao');
  assert.equal((await goi(H, 'GET', '/submissions/21')).status, 404, 'người được giao cũ còn xem được');

  const ha = await goi(ADMIN, 'PATCH', '/submissions/10/security-level', { level: 'thuong' });
  assert.equal(ha.status, 200);
  const nk = db.prepare(`SELECT target_id, details FROM staff_activity_logs WHERE action = 'set_security_level' ORDER BY id`).all();
  assert.deepEqual(nk.map((x) => String(x.target_id)), ['21', '10']);
  assert.match(nk[1].details, /thuong/);

  /* Đặt lại Mật cho hồ sơ ĐÃ Mật không được gỡ người Trưởng vừa giao */
  await goi(ADMIN, 'PATCH', '/submissions/11/security-level', { level: 'mat' });
  assert.equal(giaoHienTai(11), H2.id);
});

/* ======================================================================== */
/* Tệp nâng cấp gỡ phân công cũ của hồ sơ Mật                                 */
/* ======================================================================== */

test('nang_cap_v24.sql: gỡ assigned_to của mọi hồ sơ máy chủ coi là Mật (kể cả \'\', NULL, lạ), không đụng mức khác', { skip: BO_QUA }, async () => {
  napDuLieu();
  const sql = await readFile(goc('database/nang_cap_v24.sql'), 'utf8');
  const cacCau = sql.replace(/--[^\n]*/g, '').split(';').map((c) => c.trim())
    .filter((c) => c && !/^USE\s/i.test(c));
  for (const cau of cacCau) db.prepare(cau).all();
  for (const h of HO_SO) {
    const g = giaoHienTai(h.id);
    if (chuanMuc(h.muc) === 'mat') assert.equal(g, null, `hồ sơ Mật ${h.id} (muc ${JSON.stringify(h.muc)}) còn người được giao`);
    else assert.equal(g, h.giao, `hồ sơ ${h.id} (${h.muc}) bị đổi phân công`);
  }
});

/* ======================================================================== */
/* (i) Hai điểm vào máy chủ có adminRouter + lời hứa trên giao diện           */
/* ======================================================================== */

test('(i) index.js và may-chu-can-bo.js gắn cùng adminRouter; may-chu-cong-khai.js không gắn', async () => {
  for (const tep of ['server/src/index.js', 'server/src/may-chu-can-bo.js']) {
    const m = await readFile(goc(tep), 'utf8');
    assert.match(m, /import adminRouter from '\.\/routes\/admin\/index\.js'/, tep);
    assert.match(m, /app\.use\('\/api\/admin', adminRouter\)/, tep);
  }
  const ck = await readFile(goc('server/src/may-chu-cong-khai.js'), 'utf8');
  assert.doesNotMatch(ck, /import adminRouter/);
});

test('giao diện mô tả đúng chính sách mức Mật (không còn hứa "Chỉ lãnh đạo")', async () => {
  const tsx = await readFile(goc('src/pages/admin/AdminSubmissionDetailPage.tsx'), 'utf8');
  assert.doesNotMatch(tsx, /'mat',\s*'Mật',\s*'Chỉ lãnh đạo'/);
  assert.match(tsx, /'mat',\s*'Mật',\s*'[^']*Trưởng[^']*'/);
});
