/**
 * VIỆC 13–17 (ADR-003) — HÀNG SÀNG LỌC, NGOÀI THẨM QUYỀN, GHI CHÚ, CÁC PHẦN TIN
 *
 * Tin có danh tính vào hàng sàng lọc ('received') trước khi xử lý. Bốn nút:
 *   Xác nhận       -> 'processing', vào phần Tin đưa vào xử lý / Tin tố giác
 *   Chưa xác minh  -> ở lại hàng, gắn nhãn
 *   Tin giả        -> thùng rác, KHÔNG khoá máy, bắt ghi lý do (lý do là nội bộ)
 *   Ngoài thẩm quyền -> phần chỉ lãnh đạo xem
 * Tin ẩn danh vẫn qua hàng kiểm duyệt ẩn danh; duyệt xong vào thẳng 'processing'.
 * Mọi nút kiểm ở máy chủ: đúng trạng thái, đúng phạm vi, đúng vai trò.
 */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { datBienMoiTruongHopLe } from './helpers-test.js';
import { BO_QUA, dungCsdl, goi as goiGoc, TRUONG, PHO, CAN_BO, MAY_A } from './khung-sqlite.js';

datBienMoiTruongHopLe();

const { pool } = await import('../src/db.js');
const { signAccessToken } = await import('../src/lib/token.js');
const { default: adminRouter } = await import('../src/routes/admin/index.js');
const { default: trackingRouter } = await import('../src/routes/tracking.js');

let ctl;
/* id: 1x tin có tên chờ sàng lọc · 2x ẩn danh · 3x đã xử lý · 4x mang cờ */
beforeEach(() => {
  if (BO_QUA) return;
  ctl = dungCsdl(pool);
  const them = ctl.db.prepare(`INSERT INTO submissions (id, tracking_code, original_content, category_id, status,
      is_anonymous, device_id, urgency, to_giac_mat, ngoai_tham_quyen, assigned_to, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
  them.run(10, 'HS0010', 'Phản ánh đèn đường hỏng', 3, 'received', 0, MAY_A, 'normal', 0, 0, null, ctl.luc(30));
  them.run(11, 'HS0011', 'Tố giác bán ma tuý ở quán nước', 1, 'received', 0, MAY_A, 'urgent', 0, 0, null, ctl.luc(20));
  them.run(12, 'HS0012', 'Khiếu nại thu phí sai', 2, 'received', 0, null, 'normal', 0, 0, CAN_BO.id, ctl.luc(10));
  them.run(20, 'HS0020', 'Tố giác ẩn danh đánh bạc', 1, 'pending_review', 1, null, 'normal', 0, 0, null, ctl.luc(15));
  them.run(30, 'HS0030', 'Phản ánh ổ gà đang xử lý', 3, 'processing', 0, null, 'normal', 0, 0, null, ctl.luc(300));
  them.run(31, 'HS0031', 'Tố giác trộm xe đang xử lý', 1, 'processing', 0, null, 'normal', 0, 0, null, ctl.luc(301));
  them.run(32, 'HS0032', 'Phản ánh đã xong', 3, 'resolved', 0, null, 'normal', 0, 0, null, ctl.luc(302));
  them.run(40, 'HS0040', 'Tố cáo cán bộ nhận tiền', 2, 'received', 0, null, 'normal', 1, 0, null, ctl.luc(5));
  them.run(41, 'HS0041', 'Việc ngoài thẩm quyền', 3, 'received', 0, null, 'normal', 0, 1, null, ctl.luc(6));
});

const goi = (staff, method, duong, body) => goiGoc({
  duongGoc: '/api/admin', router: adminRouter, staff, signAccessToken, method, duong, body,
});
const sangLoc = (staff, id, hanhDong, ghiChu) => goi(staff, 'POST', `/submissions/${id}/sang-loc`, { hanhDong, ghiChu });
const hang = (id) => ctl.db.prepare('SELECT * FROM submissions WHERE id = ?').get(id);
const dong = (action) => ctl.db.prepare('SELECT * FROM staff_activity_logs WHERE action = ? ORDER BY id').all(action);
const maTrongDs = async (staff, q) => (await goi(staff, 'GET', `/submissions?${q}`)).body.data.map((d) => d.tracking_code).sort();

/* ---- Các phần danh sách ---------------------------------------------- */

test('hàng sàng lọc: chỉ tin có danh tính chờ sàng lọc, không mang cờ; tin khẩn lên đầu', { skip: BO_QUA }, async () => {
  for (const staff of [CAN_BO, TRUONG]) {
    const r = await goi(staff, 'GET', '/submissions?phan=sang_loc');
    assert.equal(r.status, 200, r.text);
    assert.deepEqual(r.body.data.map((d) => d.tracking_code), ['HS0011', 'HS0012', 'HS0010']);
  }
});

test('Tin đưa vào xử lý: không có tin tố giác, không có tin mang cờ; mặc định Đang xử lý', { skip: BO_QUA }, async () => {
  assert.deepEqual(await maTrongDs(CAN_BO, 'phan=xu_ly'), ['HS0030']);
  assert.deepEqual(await maTrongDs(CAN_BO, 'phan=xu_ly&status=resolved'), ['HS0032']);
  assert.deepEqual(await maTrongDs(TRUONG, 'phan=xu_ly&status=all'), ['HS0030', 'HS0032']);
});

test('Tin tố giác: phần riêng, chỉ tin tố giác đã qua sàng lọc/kiểm duyệt', { skip: BO_QUA }, async () => {
  assert.deepEqual(await maTrongDs(CAN_BO, 'phan=to_giac'), ['HS0031']);
});

test('Tin tố giác mật, Ngoài thẩm quyền: chỉ lãnh đạo (cán bộ 403)', { skip: BO_QUA }, async () => {
  assert.equal((await goi(CAN_BO, 'GET', '/submissions?phan=to_giac_mat')).status, 403);
  assert.equal((await goi(CAN_BO, 'GET', '/submissions?phan=ngoai_tham_quyen')).status, 403);
  assert.deepEqual(await maTrongDs(PHO, 'phan=to_giac_mat'), ['HS0040']);
  assert.deepEqual(await maTrongDs(PHO, 'phan=ngoai_tham_quyen'), ['HS0041']);
});

test('soát nghi tin rác trong một phần: không áp trạng thái mặc định (tin rác thủ công có trạng thái spam)', { skip: BO_QUA }, async () => {
  ctl.db.exec(`INSERT INTO submissions (id, tracking_code, original_content, category_id, status, is_anonymous, is_spam)
               VALUES (50, 'HS0050', 'Tin rác đã đánh tay', 3, 'spam', 0, 1)`);
  assert.deepEqual(await maTrongDs(CAN_BO, 'phan=xu_ly&nghiRac=1'), ['HS0050']);
});

test('phần lạ, trạng thái không thuộc phần -> 400', { skip: BO_QUA }, async () => {
  assert.equal((await goi(TRUONG, 'GET', '/submissions?phan=khong_co')).status, 400);
  assert.equal((await goi(TRUONG, 'GET', '/submissions?phan=xu_ly&status=received')).status, 400);
  assert.equal((await goi(TRUONG, 'GET', '/submissions?phan=constructor')).status, 400);
});

/* ---- Bốn nút sàng lọc ------------------------------------------------- */

test('Xác nhận -> Đang xử lý, ghi người sàng lọc, lịch sử, nhật ký; hết trong hàng sàng lọc', { skip: BO_QUA }, async () => {
  const r = await sangLoc(CAN_BO, 10, 'xac_nhan');
  assert.equal(r.status, 200, r.text);
  const h = hang(10);
  assert.equal(h.status, 'processing');
  assert.equal(h.sang_loc_boi, CAN_BO.id);
  assert.ok(h.sang_loc_luc);
  assert.equal(dong('sang_loc_xac_nhan').length, 1);
  assert.equal(dong('update_status').length, 1, 'thủ tục CSDL ghi lịch sử và nhật ký đổi trạng thái');
  assert.ok(!(await maTrongDs(CAN_BO, 'phan=sang_loc')).includes('HS0010'));
  assert.ok((await maTrongDs(CAN_BO, 'phan=xu_ly')).includes('HS0010'));
});

test('Xác nhận tin tố giác -> vào phần Tin tố giác', { skip: BO_QUA }, async () => {
  assert.equal((await sangLoc(CAN_BO, 11, 'xac_nhan')).status, 200);
  assert.ok((await maTrongDs(CAN_BO, 'phan=to_giac')).includes('HS0011'));
});

test('Chưa xác minh -> ở lại hàng, gắn nhãn; ghi chú (nếu có) vào ghi chú nội bộ', { skip: BO_QUA }, async () => {
  const r = await sangLoc(CAN_BO, 10, 'chua_xac_minh', 'Chờ người dân gửi ảnh hiện trường');
  assert.equal(r.status, 200, r.text);
  assert.equal(hang(10).status, 'received');
  const ds = (await goi(CAN_BO, 'GET', '/submissions?phan=sang_loc')).body.data;
  assert.ok(ds.find((d) => d.tracking_code === 'HS0010').chua_xac_minh_luc);
  const gc = ctl.db.prepare('SELECT * FROM ghi_chu_noi_bo WHERE submission_id = 10').all();
  assert.equal(gc.length, 1);
  assert.match(gc[0].noi_dung, /Chưa xác minh.*ảnh hiện trường/);
  assert.equal(dong('sang_loc_chua_xac_minh').length, 1);
});

test('Tin giả: bắt ghi lý do', { skip: BO_QUA }, async () => {
  for (const ghiChu of [undefined, '', '   ', 'abc']) {
    const r = await sangLoc(CAN_BO, 10, 'tin_gia', ghiChu);
    assert.equal(r.status, 400, `ghiChu=${JSON.stringify(ghiChu)}: ${r.text}`);
  }
  assert.equal(hang(10).deleted_at, null);
});

test('Tin giả: vào thùng rác, KHÔNG khoá máy, lý do nội bộ không lộ cho người dân', { skip: BO_QUA }, async () => {
  const LY_DO = 'Gọi lại số điện thoại thì không có thật, nội dung bịa';
  const r = await sangLoc(CAN_BO, 10, 'tin_gia', LY_DO);
  assert.equal(r.status, 200, r.text);
  const h = hang(10);
  assert.equal(h.status, 'rejected');
  assert.ok(h.deleted_at, 'chưa vào thùng rác');
  assert.equal(h.deleted_by, CAN_BO.id);
  assert.equal(h.is_spam, 0);
  assert.equal(ctl.db.prepare('SELECT COUNT(*) AS n FROM blacklists').get().n, 0, 'tin giả ở sàng lọc không được khoá máy');
  assert.ok(!String(h.rejection_reason).includes('bịa'), 'lý do nội bộ lọt vào lời trả người dân');
  assert.match(ctl.db.prepare('SELECT noi_dung FROM ghi_chu_noi_bo WHERE submission_id = 10').get().noi_dung, /bịa/);
  assert.equal(h.giu_cho_lanh_dao, 0);
  assert.equal(dong('sang_loc_tin_gia').length, 1);
});

test('Tin giả với tin TỐ GIÁC: giữ trong thùng rác chờ lãnh đạo, không tự xoá sau 7 ngày', { skip: BO_QUA }, async () => {
  assert.equal((await sangLoc(CAN_BO, 11, 'tin_gia', 'Nghi bịa, không có quán nước nào ở đó')).status, 200);
  assert.equal((await sangLoc(CAN_BO, 10, 'tin_gia', 'Trùng nội dung, bịa đặt')).status, 200);
  assert.equal(hang(11).giu_cho_lanh_dao, 1);
  ctl.troiQua(8 * 24 * 60);
  assert.equal((await goi(TRUONG, 'GET', '/trash')).status, 200);   // mở thùng rác -> tự dọn
  assert.ok(hang(11), 'tố giác bị đánh tin giả đã tự xoá trước khi lãnh đạo xem');
  assert.equal(hang(10), undefined, 'tin thường quá 7 ngày vẫn phải tự xoá');
});

test('Ngoài thẩm quyền: sang phần chỉ lãnh đạo; cán bộ mất quyền đọc; bỏ giao cho cán bộ', { skip: BO_QUA }, async () => {
  const r = await sangLoc(CAN_BO, 12, 'ngoai_tham_quyen', 'Việc của Phòng Tài nguyên huyện');
  assert.equal(r.status, 200, r.text);
  const h = hang(12);
  assert.equal(h.ngoai_tham_quyen, 1);
  assert.equal(h.assigned_to, null);
  assert.equal((await goi(CAN_BO, 'GET', '/submissions/12')).status, 404);
  assert.ok((await maTrongDs(TRUONG, 'phan=ngoai_tham_quyen')).includes('HS0012'));
  assert.equal(dong('sang_loc_ngoai_tham_quyen').length, 1);
});

test('nút sàng lọc chỉ chạy trên tin đang chờ sàng lọc', { skip: BO_QUA }, async () => {
  assert.equal((await sangLoc(CAN_BO, 30, 'xac_nhan')).status, 409, 'tin đang xử lý');
  assert.equal((await sangLoc(TRUONG, 20, 'xac_nhan')).status, 409, 'tin ẩn danh đi hàng kiểm duyệt');
  assert.equal((await sangLoc(TRUONG, 40, 'xac_nhan')).status, 409, 'tin tố giác mật không qua sàng lọc');
  assert.equal((await sangLoc(CAN_BO, 40, 'xac_nhan')).status, 404, 'cán bộ không thấy tin mang cờ');
  assert.equal((await sangLoc(CAN_BO, 10, 'xoa_het')).status, 400);
  assert.equal((await sangLoc(CAN_BO, 999, 'xac_nhan')).status, 404);
  assert.equal(hang(30).status, 'processing');
});

/* ---- Ngoài thẩm quyền: nút của lãnh đạo -------------------------------- */

const ntq = (staff, id, hanhDong, ghiChu) => goi(staff, 'POST', `/submissions/${id}/ngoai-tham-quyen`, { hanhDong, ghiChu });

test('cán bộ không dùng được nút phần Ngoài thẩm quyền', { skip: BO_QUA }, async () => {
  for (const hd of ['chuyen_lai', 'xoa', 'da_chuyen']) assert.equal((await ntq(CAN_BO, 41, hd)).status, 403);
  assert.equal((await goi(CAN_BO, 'GET', '/submissions/ngoai-tham-quyen/xuat')).status, 403);
});

test('lãnh đạo chuyển lại xử lý -> bỏ cờ, Đang xử lý', { skip: BO_QUA }, async () => {
  const r = await ntq(PHO, 41, 'chuyen_lai');
  assert.equal(r.status, 200, r.text);
  assert.equal(hang(41).ngoai_tham_quyen, 0);
  assert.equal(hang(41).status, 'processing');
  assert.equal(dong('ntq_chuyen_lai').length, 1);
});

test('lãnh đạo xoá -> vào thùng rác (không xoá hẳn)', { skip: BO_QUA }, async () => {
  assert.equal((await ntq(PHO, 41, 'xoa')).status, 200);
  assert.ok(hang(41).deleted_at);
  assert.equal(dong('ntq_xoa').length, 1);
});

test('lãnh đạo đánh dấu đã chuyển cơ quan có thẩm quyền -> người dân tra cứu thấy', { skip: BO_QUA }, async () => {
  const r = await ntq(TRUONG, 41, 'da_chuyen', 'Phòng Tài nguyên và Môi trường huyện');
  assert.equal(r.status, 200, r.text);
  assert.equal(hang(41).status, 'resolved');
  assert.match(hang(41).resolution_note, /Đã chuyển cơ quan có thẩm quyền.*Tài nguyên/);
  assert.equal(dong('ntq_da_chuyen').length, 1);
});

test('nút Ngoài thẩm quyền chỉ chạy trên tin trong phần đó', { skip: BO_QUA }, async () => {
  assert.equal((await ntq(TRUONG, 30, 'chuyen_lai')).status, 409);
  assert.equal((await ntq(TRUONG, 41, 'bay_ba')).status, 400);
});

test('xuất Excel phần Ngoài thẩm quyền: có dòng, danh tính che, ghi export_data trước', { skip: BO_QUA }, async () => {
  const r = await goi(TRUONG, 'GET', '/submissions/ngoai-tham-quyen/xuat');
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(r.body.map((d) => d.trackingCode), ['HS0041']);
  const d = dong('export_data');
  assert.equal(d.length, 1);
  assert.equal(JSON.parse(d[0].details).phan, 'ngoai_tham_quyen');
});

/* ---- Ghi chú nội bộ ---------------------------------------------------- */

test('ghi chú nội bộ: cán bộ thêm, trang chi tiết hiện kèm tên người ghi và giờ', { skip: BO_QUA }, async () => {
  const r = await goi(CAN_BO, 'POST', '/submissions/10/ghi-chu', { noiDung: 'Đã gọi tổ trưởng khu phố xác nhận' });
  assert.equal(r.status, 201, r.text);
  const ct = await goi(TRUONG, 'GET', '/submissions/10');
  assert.equal(ct.body.ghi_chu.length, 1);
  assert.equal(ct.body.ghi_chu[0].noi_dung, 'Đã gọi tổ trưởng khu phố xác nhận');
  assert.equal(ct.body.ghi_chu[0].staff_name, 'Cán bộ Bốn');
  assert.ok(ct.body.ghi_chu[0].created_at);
  assert.equal(dong('note_add').length, 1);
});

test('ghi chú rỗng hoặc quá dài -> 400; hồ sơ không xem được -> 404', { skip: BO_QUA }, async () => {
  assert.equal((await goi(CAN_BO, 'POST', '/submissions/10/ghi-chu', { noiDung: '  ' })).status, 400);
  assert.equal((await goi(CAN_BO, 'POST', '/submissions/10/ghi-chu', { noiDung: 'x'.repeat(2001) })).status, 400);
  assert.equal((await goi(CAN_BO, 'POST', '/submissions/40/ghi-chu', { noiDung: 'thử' })).status, 404);
  assert.equal(ctl.db.prepare('SELECT COUNT(*) AS n FROM ghi_chu_noi_bo').get().n, 0);
});

test('người dân tra cứu không thấy ghi chú nội bộ', { skip: BO_QUA }, async () => {
  await goi(CAN_BO, 'POST', '/submissions/10/ghi-chu', { noiDung: 'GHICHU-NOIBO-BIMAT' });
  const r = await goiGoc({ duongGoc: '/api/tracking', router: trackingRouter, method: 'GET', duong: '/HS0010' });
  assert.equal(r.status, 200, `tra cứu phải chạy thật thì bài này mới có nghĩa: ${r.text.slice(0, 200)}`);
  assert.doesNotMatch(r.text, /GHICHU-NOIBO-BIMAT/);
});

test('quét: không có đường sửa, xoá ghi chú nội bộ', async () => {
  const sai = [];
  const duyet = async (thuMuc) => {
    for (const d of await readdir(thuMuc, { withFileTypes: true })) {
      const u = new URL(d.name + (d.isDirectory() ? '/' : ''), thuMuc);
      if (d.isDirectory()) { await duyet(u); continue; }
      if (d.name.endsWith('.js') && /(UPDATE|DELETE\s+FROM)\s+ghi_chu_noi_bo/i.test(await readFile(u, 'utf8'))) sai.push(d.name);
    }
  };
  await duyet(new URL('../src/', import.meta.url));
  assert.deepEqual(sai, []);
});

/* ---- Duyệt tin ẩn danh ------------------------------------------------- */

test('duyệt tin ẩn danh -> vào thẳng Đang xử lý (không vào hàng sàng lọc)', { skip: BO_QUA }, async () => {
  const r = await goi(CAN_BO, 'POST', '/submissions/20/review', { action: 'approve' });
  assert.equal(r.status, 200, r.text);
  assert.equal(hang(20).status, 'processing');
  assert.ok(!(await maTrongDs(CAN_BO, 'phan=sang_loc')).includes('HS0020'));
  assert.ok((await maTrongDs(CAN_BO, 'phan=to_giac')).includes('HS0020'));
});
