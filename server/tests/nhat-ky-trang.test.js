/**
 * VIỆC 9 (ADR-003) — TRANG NHẬT KÝ: LỌC, THỐNG KÊ THEO NGÀY, XUẤT EXCEL
 *
 * Lãnh đạo không còn ai đứng trên để kiểm, nên kiểm lẫn nhau qua nhật ký: mỗi
 * lần MỞ và mỗi lần XUẤT nhật ký cũng phải ghi, ghi TRƯỚC khi trả dữ liệu.
 * Cán bộ không mở, không xuất được (ADR-003 §1). Bộ lọc là allow-list (luật 5).
 */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { datBienMoiTruongHopLe } from './helpers-test.js';
import { BO_QUA, dungCsdl, goi as goiGoc, TRUONG, PHO, CAN_BO } from './khung-sqlite.js';

datBienMoiTruongHopLe();

const { pool } = await import('../src/db.js');
const { signAccessToken } = await import('../src/lib/token.js');
const { default: adminRouter } = await import('../src/routes/admin/index.js');

let ctl;
/* Ngày theo đồng hồ ảo của khung: hôm nay, hôm qua, 3 ngày trước */
let HOM_NAY; let HOM_QUA; let BA_NGAY;
beforeEach(() => {
  if (BO_QUA) return;
  ctl = dungCsdl(pool);
  const ngay = (phut) => ctl.luc(phut).slice(0, 10);
  HOM_NAY = ngay(0); HOM_QUA = ngay(24 * 60); BA_NGAY = ngay(3 * 24 * 60);
  const them = ctl.db.prepare(`INSERT INTO staff_activity_logs (staff_id, action, target_type, target_id, created_at)
                               VALUES (?,?,?,?,?)`);
  them.run(CAN_BO.id, 'update_status', 'submission', 10, ctl.luc(5));
  them.run(CAN_BO.id, 'view_submission', 'submission', 10, ctl.luc(6));
  them.run(PHO.id, 'reveal_identity', 'submission', 10, ctl.luc(7));
  them.run(PHO.id, 'login', null, null, ctl.luc(24 * 60 + 5));
  them.run(TRUONG.id, 'export_data', null, null, ctl.luc(3 * 24 * 60 + 5));
  them.run(null, 'login_failed', null, null, ctl.luc(3 * 24 * 60 + 6));
  ctl.db.exec(`INSERT INTO submissions (id, tracking_code, original_content, category_id, status)
               VALUES (10, 'HS0010', 'x', 3, 'processing')`);
});

const goi = (staff, duong) => goiGoc({
  duongGoc: '/api/admin', router: adminRouter, staff, signAccessToken, method: 'GET', duong,
});
const dong = (action) => ctl.db.prepare('SELECT * FROM staff_activity_logs WHERE action = ? ORDER BY id').all(action);
function hongNhatKy() {
  const goc = pool.query;
  pool.query = async (sql, p) => {
    if (/INSERT INTO staff_activity_logs/i.test(String(sql))) throw new Error('ER_DISK_FULL giả lập');
    return goc(sql, p);
  };
}

test('cán bộ không mở, không thống kê, không xuất được nhật ký', { skip: BO_QUA }, async () => {
  for (const d of ['/logs', '/logs/thong-ke', '/logs/xuat', '/logs/danh-muc']) {
    assert.equal((await goi(CAN_BO, d)).status, 403, d);
  }
  assert.equal(dong('view_logs').length + dong('export_logs').length, 0);
});

test('danh mục: trả nhóm và nhãn tiếng Việt, nhóm nhạy cảm đánh dấu', { skip: BO_QUA }, async () => {
  const r = await goi(TRUONG, '/logs/danh-muc');
  assert.equal(r.status, 200);
  const nhayCam = r.body.find((n) => n.nhayCam);
  assert.ok(nhayCam.hanhDong.some((h) => h.ma === 'reveal_identity'));
  assert.ok(nhayCam.hanhDong.some((h) => h.ma === 'view_logs'));
});

test('mở nhật ký -> view_logs đích danh; lật trang trong 10 phút không ghi thêm', { skip: BO_QUA }, async () => {
  const r = await goi(PHO, '/logs');
  assert.equal(r.status, 200, r.text);
  await goi(PHO, '/logs?page=2');
  await goi(PHO, '/logs/thong-ke');
  assert.equal(dong('view_logs').length, 1);
  assert.equal(dong('view_logs')[0].staff_id, PHO.id);
  await goi(TRUONG, '/logs');
  assert.equal(dong('view_logs').length, 2, 'người khác mở phải có dòng riêng');
});

test('không ghi được lượt mở thì không trả nhật ký', { skip: BO_QUA }, async () => {
  hongNhatKy();
  for (const d of ['/logs', '/logs/thong-ke', '/logs/xuat']) {
    const r = await goi(TRUONG, d);
    assert.equal(r.status, 500, d);
    assert.doesNotMatch(r.text, /reveal_identity|update_status/, d);
  }
});

test('danh sách gắn nhãn tiếng Việt và nhóm', { skip: BO_QUA }, async () => {
  const r = await goi(TRUONG, '/logs?action=reveal_identity');
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.data.length, 1);
  assert.equal(r.body.data[0].ten_hanh_dong, 'Xem danh tính người gửi');
  assert.equal(r.body.data[0].nhom, 'nhay_cam');
  assert.equal(r.body.data[0].nhay_cam, true);
});

test('lọc theo nhóm, cán bộ, khoảng ngày', { skip: BO_QUA }, async () => {
  const xuLy = await goi(TRUONG, '/logs?nhom=xu_ly');
  assert.deepEqual(xuLy.body.data.map((d) => d.action), ['update_status']);
  const cb = await goi(TRUONG, `/logs?staffId=${CAN_BO.id}`);
  assert.deepEqual(cb.body.data.map((d) => d.action).sort(), ['update_status', 'view_submission']);
  const homQua = await goi(TRUONG, `/logs?tu=${HOM_QUA}&den=${HOM_QUA}`);
  assert.deepEqual(homQua.body.data.map((d) => d.action), ['login']);
  const tuHomQua = await goi(TRUONG, `/logs?tu=${HOM_QUA}&nhom=dang_nhap`);
  assert.deepEqual(tuHomQua.body.data.map((d) => d.action), ['login']);
});

for (const [ten, q] of [
  ['nhóm lạ', 'nhom=khong_co'], ['mã hành động lạ', 'action=drop_table'],
  ['cán bộ không phải số', 'staffId=1%20OR%201'], ['ngày sai dạng', 'tu=01-10-2026'],
  ['ngày không có thật', 'tu=2026-02-30'], ['ngày cuối trước ngày đầu', 'tu=2026-10-02&den=2026-10-01'],
]) {
  test(`bộ lọc ${ten} -> 400, không ghi lượt mở`, { skip: BO_QUA }, async () => {
    const r = await goi(TRUONG, `/logs?${q}`);
    assert.equal(r.status, 400, r.text);
    assert.equal(dong('view_logs').length, 0);
  });
}

test('thống kê theo ngày: đủ mọi ngày trong khoảng, đếm theo nhóm và số nhạy cảm', { skip: BO_QUA }, async () => {
  const r = await goi(TRUONG, `/logs/thong-ke?tu=${BA_NGAY}&den=${HOM_NAY}`);
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.theoNgay.length, 4, 'ba ngày trước, hai ngày trước, hôm qua, hôm nay');
  const theo = Object.fromEntries(r.body.theoNgay.map((d) => [d.ngay, d]));
  assert.equal(theo[HOM_NAY].tong, 3);
  assert.equal(theo[HOM_NAY].nhayCam, 1);
  assert.deepEqual(theo[HOM_NAY].theoNhom, { xu_ly: 1, xem_ho_so: 1, nhay_cam: 1 });
  assert.equal(theo[HOM_QUA].tong, 1);
  assert.equal(theo[BA_NGAY].tong, 2);
  assert.equal(r.body.theoNgay.find((d) => ![HOM_NAY, HOM_QUA, BA_NGAY].includes(d.ngay)).tong, 0);
  const cb = r.body.theoCanBo.find((x) => x.staffId === CAN_BO.id);
  assert.equal(cb.tong, 2);
});

test('thống kê quá 92 ngày -> 400', { skip: BO_QUA }, async () => {
  const r = await goi(TRUONG, '/logs/thong-ke?tu=2026-01-01&den=2026-06-30');
  assert.equal(r.status, 400);
});

test('xuất Excel: trả dòng có nhãn; mỗi lần xuất một dòng export_logs (không gộp) kèm số dòng', { skip: BO_QUA }, async () => {
  const r = await goi(PHO, `/logs/xuat?tu=${BA_NGAY}&den=${HOM_NAY}&nhom=nhay_cam`);
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(r.body.data.map((d) => d.action).sort(), ['export_data', 'reveal_identity']);
  assert.ok(r.body.data.every((d) => d.ten_hanh_dong && d.ten_nhom));
  await goi(PHO, `/logs/xuat?tu=${BA_NGAY}&den=${HOM_NAY}`);
  const ds = dong('export_logs');
  assert.equal(ds.length, 2);
  assert.equal(ds[0].staff_id, PHO.id);
  assert.deepEqual(JSON.parse(ds[0].details), {
    boLoc: { nhom: 'nhay_cam', tu: BA_NGAY, den: HOM_NAY }, soDong: 2,
  });
});

test('xuất danh sách ý kiến (báo cáo): không ghi được nhật ký thì không xuất', { skip: BO_QUA }, async () => {
  hongNhatKy();
  const r = await goi(TRUONG, `/reports/details?from=${BA_NGAY}&to=${HOM_NAY}`);
  assert.equal(r.status, 500, r.text);
  assert.doesNotMatch(r.text, /HS0010/);
});

test('xuất danh sách ý kiến (báo cáo): ghi export_data trước khi trả', { skip: BO_QUA }, async () => {
  const r = await goi(TRUONG, `/reports/details?from=${BA_NGAY}&to=${HOM_NAY}`);
  assert.equal(r.status, 200, r.text);
  assert.equal(dong('export_data').length, 2, 'dòng mẫu + dòng mới');
});
