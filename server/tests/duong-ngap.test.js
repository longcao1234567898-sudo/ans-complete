/**
 * ĐƯỜNG HAY NGẬP — cán bộ báo "đang ngập / hết ngập", người dân xem trên trang
 * Điểm đen giao thông (P50).
 *
 * Quyết định thiết kế (đã hỏi người vận hành):
 *   · Google Maps KHÔNG có dịch vụ trả "đường nào đang ngập" cho web khác lấy, và
 *     dịch vụ dự báo lũ của Google chỉ theo trạm sông, không theo từng tuyến — nên
 *     trạng thái do CÁN BỘ xác nhận, không đoán tự động. Báo sai trên trang công an
 *     là người dân lao vào đường ngập hoặc né nhầm đường.
 *   · "Đang ngập" chỉ đúng khi xác nhận còn trong 12 giờ. Quên bấm "Hết ngập" thì
 *     tự hết báo (fail-safe: thà thiếu báo còn hơn báo cũ treo mãi).
 *   · Ai báo được: MỌI cán bộ (người đang đứng ngoài đường là cán bộ cơ sở); chỉ
 *     lãnh đạo thêm / sửa / ẩn điểm. Mọi lượt báo ghi nhật ký.
 *
 * Chạy route thật qua HTTP trên SQLite trong bộ nhớ (khung-sqlite.js).
 */
import { describe, test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { datBienMoiTruongHopLe } from './helpers-test.js';
import { BO_QUA, dungCsdl, goi, TRUONG, CAN_BO } from './khung-sqlite.js';

datBienMoiTruongHopLe();
const { pool } = await import('../src/db.js');
const { default: congKhaiRouter } = await import('../src/routes/diem-den.js');
/* Router quản trị THẬT (có requireAuth như khi chạy thật), không gắn riêng lẻ */
const { default: quanTriRouter } = await import('../src/routes/admin/index.js');
const { signAccessToken } = await import('../src/lib/token.js');

const BANG = `CREATE TABLE traffic_hotspots (
  id INTEGER PRIMARY KEY AUTOINCREMENT, ten TEXT, mo_ta TEXT, lat REAL, lng REAL, ward_id INT,
  so_vu INT DEFAULT 0, so_tu_vong INT DEFAULT 0, so_bi_thuong INT DEFAULT 0, ky_thong_ke TEXT,
  muc_do TEXT DEFAULT 'trung_binh', khuyen_cao TEXT, is_published INT DEFAULT 1, created_by INT,
  created_at TEXT DEFAULT (NOW()), updated_at TEXT DEFAULT (NOW()),
  loai TEXT NOT NULL DEFAULT 'tai_nan', ngap_xac_nhan_luc TEXT)`;
/* Bảng TRƯỚC khi chạy nang_cap_v31.sql — mã mới phải chịu được */
const BANG_CU = BANG.replace(/,\s*loai TEXT NOT NULL DEFAULT 'tai_nan', ngap_xac_nhan_luc TEXT\)/, ')');

let ctl;
const them = (v) => ctl.db.prepare(
  `INSERT INTO traffic_hotspots (ten, lat, lng, so_vu, loai, ngap_xac_nhan_luc, is_published, muc_do)
   VALUES (?,?,?,?,?,?,?,?)`).run(v.ten, v.lat ?? 11.01, v.lng ?? 106.65, v.so_vu ?? 0, v.loai ?? 'ngap', v.luc ?? null, v.hien ?? 1, v.muc ?? 'trung_binh');
const CK = (m, d, b) => goi({ duongGoc: m, router: d, staff: b?.staff ?? null, signAccessToken, method: b?.method ?? 'GET', duong: b?.duong ?? '', body: b?.body });
const congKhai = () => CK('/api/diem-den', congKhaiRouter);
const quanTri = (staff, method, duong, body) => CK('/api/admin', quanTriRouter, { staff, method, duong: `/diem-den${duong}`, body });
const luc = (gioTruoc) => ctl.luc(gioTruoc * 60);

describe('Đường hay ngập', { skip: BO_QUA }, () => {
  beforeEach(() => { ctl = dungCsdl(pool, { themCau: [BANG] }); });

  test('công khai: chỉ điểm có xác nhận trong 12 giờ mới "đang ngập"; quá hạn, chưa xác nhận, ẩn thì không', async () => {
    them({ ten: 'Đường Mới ngập 2 giờ trước', luc: luc(2) });
    them({ ten: 'Đường Quên bấm hết ngập 13 giờ', luc: luc(13) });
    them({ ten: 'Đường Hay ngập chưa xác nhận' });
    them({ ten: 'Đường Đang ngập nhưng bị ẩn', luc: luc(1), hien: 0 });
    them({ ten: 'Ngã tư tai nạn thường', loai: 'tai_nan', so_vu: 3 });
    const r = await congKhai();
    assert.equal(r.status, 200, r.text);
    const theoTen = Object.fromEntries(r.body.map((d) => [d.ten, d]));
    assert.equal(theoTen['Đường Mới ngập 2 giờ trước'].dangNgap, true);
    assert.equal(theoTen['Đường Quên bấm hết ngập 13 giờ'].dangNgap, false, 'xác nhận quá 12 giờ phải tự hết báo');
    assert.equal(theoTen['Đường Hay ngập chưa xác nhận'].dangNgap, false);
    assert.equal(theoTen['Đường Đang ngập nhưng bị ẩn'], undefined, 'điểm ẩn không được lộ ra');
    assert.equal(theoTen['Ngã tư tai nạn thường'].loai, 'tai_nan');
    assert.equal(theoTen['Ngã tư tai nạn thường'].dangNgap, false);
  });

  test('công khai: thời điểm xác nhận chỉ hiện khi đang ngập; điểm đang ngập đứng đầu danh sách', async () => {
    them({ ten: 'Đường A hay ngập' });
    them({ ten: 'Đường B đang ngập', luc: luc(1) });
    const r = await congKhai();
    assert.equal(r.body[0].ten, 'Đường B đang ngập', 'đang ngập phải lên đầu');
    assert.ok(r.body[0].ngapLuc, 'đang ngập thì có giờ xác nhận');
    assert.equal(r.body[1].ngapLuc, null, 'không ngập thì không lộ giờ xác nhận cũ');
    assert.doesNotMatch(r.text, /created_by|staff|ngap_xac_nhan_luc/, 'không lộ cột nội bộ');
  });

  test('công khai: CSDL chưa chạy nang_cap_v31 (chưa có hai cột) vẫn trả điểm tai nạn như cũ, không lỗi', async () => {
    ctl = dungCsdl(pool, { themCau: [BANG_CU] });
    ctl.db.prepare(`INSERT INTO traffic_hotspots (ten, lat, lng, so_vu, is_published) VALUES ('Ngã tư cũ chưa nâng cấp', 11.0, 106.6, 4, 1)`).run();
    const r = await congKhai();
    assert.equal(r.status, 200, r.text);
    assert.equal(r.body.length, 1);
    assert.equal(r.body[0].loai, 'tai_nan');
    assert.equal(r.body[0].dangNgap, false);
  });

  test('cán bộ (không phải lãnh đạo) báo "đang ngập", rồi "hết ngập"; mỗi lượt có nhật ký', async () => {
    them({ ten: 'Đường Hay ngập A' });
    const bat = await quanTri(CAN_BO, 'PATCH', '/1/ngap', { dangNgap: true });
    assert.equal(bat.status, 200, bat.text);
    assert.ok(ctl.db.prepare('SELECT ngap_xac_nhan_luc AS l FROM traffic_hotspots WHERE id = 1').get().l, 'phải ghi giờ xác nhận');
    assert.equal((await congKhai()).body[0].dangNgap, true);

    const tat = await quanTri(CAN_BO, 'PATCH', '/1/ngap', { dangNgap: false });
    assert.equal(tat.status, 200, tat.text);
    assert.equal(ctl.db.prepare('SELECT ngap_xac_nhan_luc AS l FROM traffic_hotspots WHERE id = 1').get().l, null);
    assert.equal((await congKhai()).body[0].dangNgap, false);

    const nk = ctl.db.prepare(`SELECT action, staff_id FROM staff_activity_logs WHERE CAST(target_id AS INTEGER) = 1 ORDER BY id`).all();
    assert.deepEqual(nk.map((x) => x.action), ['hotspot_flood_on', 'hotspot_flood_off']);
    assert.ok(nk.every((x) => x.staff_id === CAN_BO.id), 'nhật ký phải ghi ĐÚNG người báo');
  });

  test('báo lại "đang ngập" thì làm mới giờ xác nhận (kéo dài thêm 12 giờ)', async () => {
    them({ ten: 'Đường Hay ngập B', luc: luc(11) });
    await quanTri(CAN_BO, 'PATCH', '/1/ngap', { dangNgap: true });
    const l = ctl.db.prepare('SELECT ngap_xac_nhan_luc AS l FROM traffic_hotspots WHERE id = 1').get().l;
    assert.ok(l > luc(1), `giờ xác nhận phải được làm mới, nhận ${l}`);
  });

  test('không báo được: chưa đăng nhập (401), điểm không phải đường ngập (400), không có điểm (404), dữ liệu sai (400)', async () => {
    them({ ten: 'Đường Hay ngập C' });
    them({ ten: 'Ngã tư tai nạn D', loai: 'tai_nan', so_vu: 2 });
    assert.equal((await quanTri(null, 'PATCH', '/1/ngap', { dangNgap: true })).status, 401);
    assert.equal((await quanTri(CAN_BO, 'PATCH', '/2/ngap', { dangNgap: true })).status, 400, 'điểm tai nạn không có trạng thái ngập');
    assert.equal((await quanTri(CAN_BO, 'PATCH', '/99/ngap', { dangNgap: true })).status, 404);
    assert.equal((await quanTri(CAN_BO, 'PATCH', '/abc/ngap', { dangNgap: true })).status, 400);
    assert.equal((await quanTri(CAN_BO, 'PATCH', '/1/ngap', { dangNgap: 'true' })).status, 400, 'chỉ nhận đúng true/false');
    assert.equal((await quanTri(CAN_BO, 'PATCH', '/1/ngap', {})).status, 400);
    assert.equal(ctl.db.prepare('SELECT ngap_xac_nhan_luc AS l FROM traffic_hotspots WHERE id = 1').get().l, null, 'yêu cầu hỏng không được đổi gì');
  });

  test('chỉ lãnh đạo thêm / sửa điểm; loại ngoài danh sách bị đưa về tai_nan; đổi sang tai_nan thì xoá xác nhận ngập', async () => {
    const dung = (loai) => ({ ten: 'Đường thử nghiệm ngập', moTa: 'thử', lat: 11.01, lng: 106.65, mucDo: 'cao', loai });
    assert.equal((await quanTri(CAN_BO, 'POST', '', dung('ngap'))).status, 403, 'cán bộ thường không được thêm điểm');
    const t = await quanTri(TRUONG, 'POST', '', dung('ngap'));
    assert.equal(t.status, 201, t.text);
    assert.equal(ctl.db.prepare('SELECT loai FROM traffic_hotspots WHERE id = ?').get(t.body.id).loai, 'ngap');
    assert.equal((await quanTri(TRUONG, 'POST', '', { ...dung('ngap'), ten: 'Đường thử loại lạ' , loai: "ngap'; DROP TABLE x" })).status, 201);
    assert.equal(ctl.db.prepare(`SELECT loai FROM traffic_hotspots WHERE ten = 'Đường thử loại lạ'`).get().loai, 'tai_nan', 'loại lạ phải về mặc định (allow-list)');

    await quanTri(CAN_BO, 'PATCH', `/${t.body.id}/ngap`, { dangNgap: true });
    assert.equal((await quanTri(CAN_BO, 'PUT', `/${t.body.id}`, dung('tai_nan'))).status, 403);
    assert.equal((await quanTri(TRUONG, 'PUT', `/${t.body.id}`, dung('tai_nan'))).status, 200);
    const sau = ctl.db.prepare('SELECT loai, ngap_xac_nhan_luc AS l FROM traffic_hotspots WHERE id = ?').get(t.body.id);
    assert.equal(sau.loai, 'tai_nan');
    assert.equal(sau.l, null, 'đã thành điểm tai nạn thì không còn dấu xác nhận ngập cũ');
  });

  test('sửa điểm ngập (vẫn là ngập) KHÔNG xoá xác nhận đang ngập', async () => {
    const t = await quanTri(TRUONG, 'POST', '', { ten: 'Đường thử giữ xác nhận', loai: 'ngap', lat: null, lng: null });
    await quanTri(CAN_BO, 'PATCH', `/${t.body.id}/ngap`, { dangNgap: true });
    await quanTri(TRUONG, 'PUT', `/${t.body.id}`, { ten: 'Đường thử giữ xác nhận (sửa)', loai: 'ngap', mucDo: 'cao', lat: null, lng: null });
    assert.ok(ctl.db.prepare('SELECT ngap_xac_nhan_luc AS l FROM traffic_hotspots WHERE id = ?').get(t.body.id).l);
  });
});

describe('Mã nguồn đường hay ngập', () => {
  const doc = (p) => readFile(new URL(`../../${p}`, import.meta.url), 'utf8');

  test('mã hành động nhật ký có trong danh mục (tên hiển thị tiếng Việt)', async () => {
    const m = await doc('server/src/lib/danh-muc-nhat-ky.js');
    for (const ma of ['hotspot_flood_on', 'hotspot_flood_off']) assert.match(m, new RegExp(`${ma}:`), `thiếu ${ma} trong danh mục nhật ký`);
  });

  test('nang_cap_v31.sql chạy lại được, không xoá dữ liệu, không tự chọn database', async () => {
    const s = await doc('database/nang_cap_v31.sql');
    assert.match(s, /information_schema\.columns/, 'phải kiểm cột đã có trước khi thêm');
    assert.doesNotMatch(s.replace(/--.*$/gm, ''), /\b(USE\s+\w+|DROP\s+TABLE|DELETE\s+FROM|TRUNCATE)\b/i);
    for (const cot of ['loai', 'ngap_xac_nhan_luc']) assert.match(s, new RegExp(`ADD COLUMN ${cot}\\b`));
  });
});
