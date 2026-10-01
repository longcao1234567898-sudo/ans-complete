/**
 * PHẠM VI XEM HỒ SƠ (ADR-003 §4) — thay bài canh cấp độ bảo mật của BUG-009.
 *
 * Chính sách (Loc chốt 2026-10-01, ADR-003):
 *   lãnh đạo (admin, manager)  — mọi hồ sơ
 *   cán bộ (handler)           — hồ sơ KHÔNG mang cờ to_giac_mat, ngoai_tham_quyen
 *                                (kể cả khi đang được giao hồ sơ mang cờ)
 *   cờ không đọc được (NULL)   — coi là CÓ cờ (fail-safe)
 * Người không đủ quyền: không hiện trong danh sách, không tính vào total, truy
 * cập trực tiếp trả 404 như hồ sơ không tồn tại. Chặn cả ĐỌC lẫn GHI.
 *
 * Bảng mong đợi `duocXem` viết lại từ bảng chính sách, KHÔNG gọi mã sản phẩm.
 *
 * Giữ nguyên các bề mặt BUG-009 đã canh: (a) chi tiết · (b) danh sách với mọi
 * tổ hợp lọc · (c) chat đọc/gửi · (d) bề mặt phụ · (e) thao tác ghi · (g) cờ
 * NULL (thiếu cột: pham-vi-ho-so-thieu-cot.test.js) · (h) route đổi cấp độ đã
 * gỡ · (i) hai điểm vào máy chủ.
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
} from './gia-lap/csdl-pham-vi.js';

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

/* Hồ sơ mang cờ có dấu BIMAT-<id> trong nội dung: thấy dấu này ở đâu trong
   phản hồi của người không đủ quyền là rò.
   co: 'mat' = to_giac_mat, 'ntq' = ngoai_tham_quyen, 'null' = cờ NULL, null = thường */
const HO_SO = [
  { id: 10, co: 'mat',  giao: null },
  { id: 11, co: 'mat',  giao: H2.id },                                     // cán bộ được giao vẫn không xem
  { id: 12, co: 'mat',  giao: MGR.id },
  { id: 13, co: 'mat',  giao: null, spam: 1 },                            // nghi rác
  { id: 14, co: 'mat',  giao: null, spam: 1, xoa: true, st: 'spam' },     // thùng rác
  { id: 15, co: 'mat',  giao: null, spam: 1, may: 'may-khieu-nai' },      // khiếu nại
  { id: 16, co: 'mat',  giao: null, st: 'pending_review', an: 1 },        // hàng chờ
  { id: 20, co: 'ntq',  giao: null },
  { id: 21, co: 'ntq',  giao: H.id },
  { id: 30, co: null,   giao: null,   nhom: 1 },
  { id: 31, co: null,   giao: H2.id,  nhom: 2 },
  { id: 32, co: null,   giao: null,   nhom: 3 },
  { id: 33, co: null,   giao: null,   nhom: 3 },
  { id: 40, co: 'null', giao: null },   // to_giac_mat NULL — dữ liệu chép tay/lạ
  { id: 41, co: 'nullntq', giao: H.id },   // ngoai_tham_quyen NULL
];
HO_SO.find((x) => x.id === 10).nhom = 1;
HO_SO.find((x) => x.id === 20).nhom = 2;

/* Nhóm sự kiện: đơn đầu tiên là thành viên */
const NHOM = [
  { id: 1, dau: 10, thanhVien: [10, 30] },   // Tố giác mật + thường
  { id: 2, dau: 20, thanhVien: [20, 31] },   // Ngoài thẩm quyền + thường
  { id: 3, dau: 32, thanhVien: [32, 33] },   // toàn thường
];

const LANH_DAO = ['admin', 'manager'];
/** Bảng mong đợi — viết từ chính sách, không từ mã */
function duocXem(staff, hs) {
  if (LANH_DAO.includes(staff.role)) return true;
  return hs.co === null;
}
const hs = (id) => HO_SO.find((x) => x.id === id);
const dau = (id) => `BIMAT-${id}`;
const ma = (id) => `HS${String(id).padStart(4, '0')}`;

let db;
function napDuLieu() {
  db = dungCsdl(sqlite, pool);
  const mai = new Date(Date.now() + 24 * 3600_000).toISOString().slice(0, 19).replace('T', ' ');
  const them = db.prepare(`INSERT INTO submissions
      (id, tracking_code, original_content, category_id, status, urgency, to_giac_mat, ngoai_tham_quyen, is_anonymous,
       sender_name, sender_phone, deadline_at, assigned_to, is_spam, deleted_at, deleted_by, device_id,
       ward_id, incident_group_id)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  for (const h of HO_SO) {
    const noiDung = h.co === null ? `Phản ánh thường số ${h.id}` : `${dau(h.id)} tố cáo cán bộ nhận tiền ${h.id}`;
    const mat = h.co === 'mat' ? 1 : h.co === 'null' ? null : 0;
    const ntq = h.co === 'ntq' ? 1 : h.co === 'nullntq' ? null : 0;
    them.run(h.id, ma(h.id), noiDung, 1, h.st ?? 'processing', 'urgent', mat, ntq, h.an ?? 0,
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

const giaoHienTai = (id) => db.prepare('SELECT assigned_to AS g FROM submissions WHERE id = ?').get(id).g;
const hang = (id) => ({ ...db.prepare('SELECT * FROM submissions WHERE id = ?').get(id) });

/** Không một dấu nội dung nào của hồ sơ người này không được xem */
function khongRo(staff, text, boiCanh) {
  for (const h of HO_SO) {
    if (duocXem(staff, h)) continue;
    assert.ok(!text.includes(dau(h.id)), `${boiCanh}: ${staff.role}#${staff.id} thấy nội dung hồ sơ ${h.id} (${h.co})`);
    assert.ok(!text.includes(ma(h.id)), `${boiCanh}: ${staff.role}#${staff.id} thấy mã hồ sơ ${h.id} (${h.co})`);
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
        assert.equal(r.status, 200, `${staff.role}#${staff.id} phải xem được hồ sơ ${h.id} (${h.co}): ${r.text.slice(0, 200)}`);
      } else {
        assert.equal(r.status, 404, `${staff.role}#${staff.id} KHÔNG được xem hồ sơ ${h.id} (${h.co}), nhận ${r.status}`);
        assert.deepEqual(r.body, khongCo.body, 'phản hồi hồ sơ bị ẩn phải y hệt hồ sơ không tồn tại');
      }
    }
  }
});

test('(a)(g) chi tiết trả cờ đã chuẩn hoá cho lãnh đạo: cờ NULL hiện là 1', { skip: BO_QUA }, async () => {
  napDuLieu();
  const a = await goi(ADMIN, 'GET', '/submissions/40');
  assert.equal(a.status, 200);
  assert.equal(a.body.to_giac_mat, 1, 'cờ NULL phải báo là CÓ cờ');
  const b = await goi(MGR, 'GET', '/submissions/41');
  assert.equal(b.body.ngoai_tham_quyen, 1);
  const t = await goi(MGR, 'GET', '/submissions/30');
  assert.equal(t.body.to_giac_mat, 0);
  assert.equal(t.body.ngoai_tham_quyen, 0);
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
        assert.ok(duocXem(staff, hs(id)), `${staff.role}#${staff.id} ${JSON.stringify(loc)}: danh sách lộ hồ sơ ${id} (${hs(id).co})`);
      }
      assert.equal(tong, ids.length, `${staff.role}#${staff.id} ${JSON.stringify(loc)}: total ${tong} ≠ số dòng xem được ${ids.length}`);
      khongRo(staff, text, `danh sách ${JSON.stringify(loc)}`);
    }
  }
});

test('(b) chứng test không rỗng: lãnh đạo tìm "BIMAT" thấy hồ sơ mang cờ; cán bộ tìm ra 0, kể cả hồ sơ đang giao cho mình', { skip: BO_QUA }, async () => {
  napDuLieu();
  for (const lanhDao of [ADMIN, MGR, MGR2]) {
    const a = await docHetDanhSach(lanhDao, { status: 'all', q: 'BIMAT' });
    assert.ok(a.ids.includes(10) && a.ids.includes(20), `${lanhDao.role}#${lanhDao.id} phải thấy hồ sơ mang cờ khi tìm`);
  }
  const h = await docHetDanhSach(H, { status: 'all', q: 'BIMAT' });
  assert.deepEqual(h.ids, [], 'cán bộ không được thấy hồ sơ mang cờ, kể cả hồ sơ 21 đang giao cho mình');
  assert.equal(h.tong, 0);
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
        assert.equal(doc.status, 404, `${staff.role}#${staff.id} ĐỌC được chat hồ sơ ${id} (${hs(id).co})`);
        assert.equal(gui.status, 404, `${staff.role}#${staff.id} GỬI được tin cho người báo hồ sơ ${id} (${hs(id).co})`);
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
  const ad = await goi(MGR, 'GET', '/incident-groups');
  assert.ok(ad.text.includes(dau(10)), 'lãnh đạo phải thấy trích đoạn');
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
  assert.equal(daXem(1), 0, 'cán bộ đánh dấu được nhóm chứa tin tố giác mật -> nhóm biến khỏi bảng điều hành của lãnh đạo');
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
  const a = await goi(MGR, 'GET', '/dashboard/stats');
  assert.ok(a.text.includes(dau(10)), 'lãnh đạo phải thấy tin tố giác mật trong việc cần gấp');
});

test('(d) thùng rác: danh sách không lộ, khôi phục hồ sơ bị ẩn trả 404 và hồ sơ vẫn trong thùng', { skip: BO_QUA }, async () => {
  napDuLieu();
  for (const staff of MOI_CAN_BO) {
    const r = await goi(staff, 'GET', '/trash');
    assert.equal(r.status, 200, r.text.slice(0, 200));
    khongRo(staff, r.text, 'thùng rác');
  }
  const a = await goi(MGR, 'GET', '/trash');
  assert.ok(a.body.items.some((i) => i.id === 14), 'lãnh đạo phải thấy tin tố giác mật trong thùng rác');
  const kp = await goi(H, 'POST', '/trash/14/restore');
  assert.equal(kp.status, 404, 'cán bộ khôi phục được tin tố giác mật khỏi thùng rác');
  assert.ok(hang(14).deleted_at, 'hồ sơ phải còn trong thùng rác');
});

test('(d) khiếu nại mở khoá: tinLienQuan không lộ hồ sơ bị ẩn', { skip: BO_QUA }, async () => {
  napDuLieu();
  for (const staff of MOI_CAN_BO) {
    const r = await goi(staff, 'GET', '/chat/khieu-nai');
    assert.equal(r.status, 200, r.text.slice(0, 200));
    khongRo(staff, r.text, 'khiếu nại');
  }
  const a = await goi(MGR, 'GET', '/chat/khieu-nai');
  assert.ok(a.text.includes(dau(15)), 'lãnh đạo phải thấy tin liên quan');
});

test('(d) báo cáo chi tiết: mọi lãnh đạo thấy cả hồ sơ mang cờ; cán bộ không gọi được', { skip: BO_QUA }, async () => {
  napDuLieu();
  for (const staff of [ADMIN, MGR, MGR2]) {
    const r = await goi(staff, 'GET', '/reports/details');
    assert.equal(r.status, 200, r.text.slice(0, 200));
    assert.ok(r.text.includes(dau(10)) && r.text.includes(dau(20)), `${staff.role}#${staff.id} thiếu hồ sơ mang cờ`);
  }
  const h = await goi(H, 'GET', '/reports/details');
  assert.equal(h.status, 403, 'báo cáo vẫn chỉ cho lãnh đạo (không hồi quy)');
});

/* ======================================================================== */
/* (e) Thao tác ghi                                                          */
/* ======================================================================== */

test('(e) handler ghi lên hồ sơ bị ẩn: status / review / mark-spam đều 404, dữ liệu không đổi', { skip: BO_QUA }, async () => {
  napDuLieu();
  const st = await goi(H, 'PATCH', '/submissions/10/status', { status: 'resolved', note: 'x' });
  assert.equal(st.status, 404, `đổi trạng thái tin tố giác mật: ${st.status}`);
  assert.equal(hang(10).status, 'processing');

  const rv = await goi(H, 'POST', '/submissions/16/review', { action: 'spam' });
  assert.equal(rv.status, 404, `duyệt tin tố giác mật ở hàng chờ: ${rv.status}`);
  assert.equal(hang(16).status, 'pending_review');
  assert.equal(hang(16).deleted_at, null);

  const ms = await goi(H, 'POST', '/submissions/10/mark-spam', { reason: 'bịa' });
  assert.equal(ms.status, 404, `đưa tin tố giác mật vào thùng rác: ${ms.status}`);
  const ms2 = await goi(H, 'POST', '/submissions/21/mark-spam', { reason: 'bịa' });
  assert.equal(ms2.status, 404, 'cán bộ đụng được tin ngoài thẩm quyền đang giao cho mình');
  assert.equal(hang(10).deleted_at, null);

  /* Chứng test không rỗng: hồ sơ thường thì handler vẫn đổi được trạng thái */
  const ok = await goi(H, 'PATCH', '/submissions/30/status', { status: 'resolved', note: 'x' });
  assert.equal(ok.status, 200);
});

/* Phân công và xem danh tính theo hai cấp: phan-cong-hai-cap.test.js */

/* ======================================================================== */
/* (h) Route đổi cấp độ đã gỡ                                                 */
/* ======================================================================== */

test('(h) PATCH /:id/security-level không còn: 404 với mọi vai trò, không ghi gì', { skip: BO_QUA }, async () => {
  napDuLieu();
  for (const staff of [ADMIN, MGR, H]) {
    const r = await goi(staff, 'PATCH', '/submissions/30/security-level', { level: 'mat' });
    assert.equal(r.status, 404, `${staff.role}: ${r.status}`);
  }
  assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM staff_activity_logs WHERE action = 'set_security_level'`).get().n, 0);
});

/* ======================================================================== */
/* Tệp nâng cấp chuyển ba mức cũ sang cờ                                       */
/* ======================================================================== */

test('nang_cap_v26.sql: mọi hồ sơ không ở mức thuong (kể cả NULL, \'\', lạ) thành to_giac_mat = 1; thuong giữ 0', { skip: BO_QUA }, async () => {
  const sql = await readFile(goc('database/nang_cap_v26.sql'), 'utf8');
  /* Câu chuyển nằm trong chuỗi PREPARE — lấy đúng nguyên văn, bỏ nháy kép SQL */
  const khop = /'(UPDATE submissions SET to_giac_mat = 1 WHERE .*?)',\n/s.exec(sql);
  assert.ok(khop, 'không tìm thấy câu chuyển mức trong nang_cap_v26.sql');
  const cau = khop[1].replace(/''/g, "'");
  const csdl = new sqlite.DatabaseSync(':memory:');
  csdl.exec(`CREATE TABLE submissions (id INT PRIMARY KEY, security_level TEXT, to_giac_mat INT NOT NULL DEFAULT 0)`);
  const muc = { 1: 'thuong', 2: 'can_bao_ve', 3: 'mat', 4: null, 5: '', 6: 'la_lung' };
  for (const [id, m] of Object.entries(muc)) csdl.prepare('INSERT INTO submissions (id, security_level) VALUES (?, ?)').run(Number(id), m);
  csdl.exec(cau);
  csdl.exec(cau);   // chạy lại không đổi thêm
  const ra = Object.fromEntries(csdl.prepare('SELECT id, to_giac_mat FROM submissions').all().map((r) => [r.id, r.to_giac_mat]));
  assert.deepEqual(ra, { 1: 0, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1 });
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

test('giao diện không còn ô chọn cấp độ bảo mật, không còn gọi route đã gỡ', async () => {
  const tsx = await readFile(goc('src/pages/admin/AdminSubmissionDetailPage.tsx'), 'utf8');
  assert.doesNotMatch(tsx, /setSecurityLevel|security_level|Cấp độ bảo mật/);
  const dv = await readFile(goc('src/services/adminService.ts'), 'utf8');
  assert.doesNotMatch(dv, /security-level/);
});
