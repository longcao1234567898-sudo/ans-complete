/**
 * NGƯỠNG MƯA THEO TỪNG TUYẾN HAY NGẬP — HỌC TỪ CÁC LẦN CÁN BỘ BÁO NGẬP (P53, ND-051)
 * ============================================================================
 *
 * Người vận hành: "xem lại việc gắn lượng mưa phù hợp với mức địa bàn địa phương".
 * Ngưỡng của ngành khí tượng (P51) là ngưỡng cả nước. Mỗi tuyến ngập ở một mức
 * mưa khác nhau (cống, độ trũng, triều) — và không có nguồn công khai nào cho số
 * đó ở từng tuyến. Nên hệ thống tự HỌC từ chính địa bàn:
 *   · Mỗi lần cán bộ bấm "Đang ngập", ghi lượng mưa lúc đó (mưa dồn 3 giờ lớn
 *     nhất trong 12 giờ trước, tổng 12 giờ — số của mô hình thời tiết).
 *   · Từ 3 lần trở lên -> GỢI Ý ngưỡng = tứ phân vị dưới, làm tròn xuống 5 mm
 *     (chọn phía thấp: thà báo sớm còn hơn báo muộn).
 *   · LÃNH ĐẠO quyết định đặt ngưỡng (máy chỉ gợi ý), mọi lần đặt ghi nhật ký.
 *   · Dự báo báo "Nguy cơ ngập" cho TỪNG TUYẾN: tuyến có ngưỡng riêng -> mưa dồn
 *     3 giờ dự báo đạt ngưỡng; tuyến chưa có -> theo mức chung (Cảnh báo trở lên).
 *   · Lưới an toàn: mức Nguy hiểm (mưa rất to) thì MỌI tuyến hay ngập đều báo,
 *     dù ngưỡng riêng đặt cao — đặt nhầm ngưỡng không được làm im cảnh báo lớn.
 */
import { describe, test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { datBienMoiTruongHopLe } from './helpers-test.js';
import { BO_QUA, dungCsdl, goi, TRUONG, CAN_BO } from './khung-sqlite.js';

datBienMoiTruongHopLe();
const { pool } = await import('../src/db.js');
const ng = await import('../src/lib/nguong-ngap.js');
const mua = await import('../src/lib/du-bao-mua.js');
const { default: congKhaiRouter } = await import('../src/routes/diem-den.js');
const { default: adminRouter } = await import('../src/routes/admin/index.js');
const { signAccessToken } = await import('../src/lib/token.js');

const GIO = 3_600_000;

describe('Gợi ý ngưỡng từ các lần báo ngập', () => {
  test('dưới 3 lần có số mưa -> chưa gợi ý', () => {
    assert.equal(ng.goiYNguong([40, 35]).goiY, null);
    assert.equal(ng.goiYNguong([40, null, 35, null]).goiY, null, 'lần không có số mưa không tính');
    assert.equal(ng.goiYNguong([]).soLan, 0);
  });
  test('tứ phân vị dưới, làm tròn xuống 5 mm', () => {
    const g = ng.goiYNguong([40, 35, 50, 28, 60]);
    assert.equal(g.goiY, 35);
    assert.equal(g.soLan, 5);
    assert.equal(g.thapNhat, 28);
    assert.equal(g.caoNhat, 60);
    assert.equal(ng.goiYNguong([33, 47, 52]).goiY, 30);
  });
  test('gợi ý không thấp hơn trần dưới (5 mm)', () => {
    assert.equal(ng.goiYNguong([1, 2, 3]).goiY, ng.NGUONG_TOI_THIEU);
  });
});

describe('Dự báo: lượng mưa vừa qua để ghi lúc báo ngập', () => {
  test('tinhMuc trả mưa 12 giờ qua và mưa dồn 3 giờ lớn nhất trong 12 giờ qua', () => {
    const bayGio = Date.UTC(2026, 9, 15, 3, 20);
    const gio = Math.floor(bayGio / GIO) * 3600;
    const time = []; const precipitation = [];
    for (let k = -24; k <= 72; k += 1) {
      time.push(gio + k * 3600);
      precipitation.push(k === -8 ? 20 : k === -7 ? 15 : k === -1 ? 4 : 0);
    }
    const kq = mua.tinhMuc(mua.kiemPhanHoi({ hourly: { time, precipitation } }), bayGio);
    assert.equal(kq.mua12hVuaQua, 39);
    assert.equal(kq.mua3hLonNhat12hQua, 35);
  });
});

const BANG = `CREATE TABLE traffic_hotspots (
  id INTEGER PRIMARY KEY AUTOINCREMENT, ten TEXT, mo_ta TEXT, lat REAL, lng REAL, ward_id INT,
  so_vu INT DEFAULT 0, so_tu_vong INT DEFAULT 0, so_bi_thuong INT DEFAULT 0, ky_thong_ke TEXT,
  muc_do TEXT DEFAULT 'trung_binh', khuyen_cao TEXT, is_published INT DEFAULT 1, created_by INT,
  created_at TEXT DEFAULT (NOW()), updated_at TEXT DEFAULT (NOW()),
  loai TEXT NOT NULL DEFAULT 'tai_nan', ngap_xac_nhan_luc TEXT)`;
const BANG_NGUONG = `CREATE TABLE nguong_ngap_duong (hotspot_id INT PRIMARY KEY, nguong_mua_3h INT NOT NULL,
  cap_nhat_boi INT, cap_nhat_luc TEXT DEFAULT (NOW()))`;
const BANG_LICH_SU = `CREATE TABLE ngap_theo_mua (id INTEGER PRIMARY KEY AUTOINCREMENT, hotspot_id INT NOT NULL,
  xac_nhan_luc TEXT DEFAULT (NOW()), mua_3h_lon_nhat REAL, mua_12h REAL, staff_id INT)`;

let ctl;
const API = (staff, method, duong, body) => goi({ duongGoc: '/api/admin', router: adminRouter, staff, signAccessToken, method, duong, body });
const CONG_KHAI = () => goi({ duongGoc: '/api/diem-den', router: congKhaiRouter, staff: null, signAccessToken, method: 'GET', duong: '/du-bao-mua' });
const duong = (ten, { loai = 'ngap', hien = 1 } = {}) => Number(ctl.db.prepare(
  'INSERT INTO traffic_hotspots (ten, lat, lng, loai, is_published) VALUES (?, 11.01, 106.65, ?, ?)').run(ten, loai, hien).lastInsertRowid);
const datNguong = (id, mm) => ctl.db.prepare('INSERT INTO nguong_ngap_duong (hotspot_id, nguong_mua_3h) VALUES (?, ?)').run(id, mm);

/** Mạng giả trả chuỗi mưa theo giờ thật (route dùng đồng hồ thật) */
function muaGia(datMua) {
  const hienTai = Math.floor(Date.now() / GIO) * 3600;
  const time = []; const precipitation = [];
  for (let k = -24; k <= 72; k += 1) { time.push(hienTai + k * 3600); precipitation.push(datMua(k)); }
  const than = JSON.stringify({ hourly_units: { precipitation: 'mm' }, hourly: { time, precipitation } });
  return async () => new Response(than, { status: 200 });
}

describe('Ngưỡng theo tuyến — API', { skip: BO_QUA }, () => {
  beforeEach(() => {
    ctl = dungCsdl(pool, { themCau: [BANG, BANG_NGUONG, BANG_LICH_SU] });
    process.env.DU_BAO_MUA_TOA_DO = '11.01,106.65';
  });
  afterEach(() => { mua.thayFetchChoThu(null); delete process.env.DU_BAO_MUA_TOA_DO; });

  test('mức Theo dõi (10 mm dồn 3 giờ): chỉ tuyến có ngưỡng riêng thấp mới "nguy cơ"', async () => {
    mua.thayFetchChoThu(muaGia((k) => (k >= 2 && k <= 4 ? 10 / 3 : 0)));
    const a = duong('Đường trũng A'); datNguong(a, 8);
    const b = duong('Đường B'); datNguong(b, 20);
    duong('Đường C chưa có ngưỡng');
    duong('Ngã tư tai nạn', { loai: 'tai_nan' });
    const r = await CONG_KHAI();
    assert.equal(r.status, 200, r.text);
    assert.equal(r.body.muc, 1);
    assert.deepEqual(r.body.duongNguyCo.map((d) => [d.ten, d.nguong]), [['Đường trũng A', 8]]);
  });

  test('mức Cảnh báo (30 mm): tuyến chưa có ngưỡng theo mức chung; tuyến ngưỡng cao không báo', async () => {
    mua.thayFetchChoThu(muaGia((k) => (k === 3 ? 30 : 0)));
    const a = duong('Đường A'); datNguong(a, 25);
    const b = duong('Đường B cống lớn'); datNguong(b, 50);
    duong('Đường C chưa có ngưỡng');
    duong('Đường D đang ẩn', { hien: 0 });
    const r = await CONG_KHAI();
    assert.equal(r.body.muc, 2);
    assert.deepEqual(r.body.duongNguyCo.map((d) => d.ten).sort(), ['Đường A', 'Đường C chưa có ngưỡng']);
  });

  test('LƯỚI AN TOÀN: mức Nguy hiểm thì mọi tuyến hay ngập đều báo, kể cả ngưỡng đặt cao', async () => {
    mua.thayFetchChoThu(muaGia((k) => (k >= 1 && k <= 4 ? 20 : 0)));
    const b = duong('Đường B'); datNguong(b, 200);
    const r = await CONG_KHAI();
    assert.equal(r.body.muc, 3);
    assert.deepEqual(r.body.duongNguyCo.map((d) => d.ten), ['Đường B']);
  });

  test('chưa chạy nang_cap_v34.sql: tuyến theo mức chung, không lỗi', async () => {
    ctl = dungCsdl(pool, { themCau: [BANG] });
    mua.thayFetchChoThu(muaGia((k) => (k === 3 ? 30 : 0)));
    duong('Đường A');
    const r = await CONG_KHAI();
    assert.equal(r.status, 200, r.text);
    assert.deepEqual(r.body.duongNguyCo.map((d) => [d.ten, d.nguong]), [['Đường A', null]]);
  });

  test('bấm "Đang ngập" -> ghi lượng mưa lúc đó vào lịch sử của tuyến', async () => {
    mua.thayFetchChoThu(muaGia((k) => (k === -5 ? 22 : k === -4 ? 10 : 0)));
    const a = duong('Đường A');
    const r = await API(CAN_BO, 'PATCH', `/diem-den/${a}/ngap`, { dangNgap: true });
    assert.equal(r.status, 200, r.text);
    await ng.choGhiXong();
    const ds = ctl.db.prepare('SELECT * FROM ngap_theo_mua WHERE hotspot_id = ?').all(a);
    assert.equal(ds.length, 1);
    assert.equal(ds[0].mua_3h_lon_nhat, 32);
    assert.equal(ds[0].staff_id, CAN_BO.id);
    /* "Hết ngập" không ghi */
    await API(CAN_BO, 'PATCH', `/diem-den/${a}/ngap`, { dangNgap: false });
    await ng.choGhiXong();
    assert.equal(ctl.db.prepare('SELECT COUNT(*) AS n FROM ngap_theo_mua').get().n, 1);
  });

  test('không lấy được dự báo lúc báo ngập: vẫn báo ngập được, vẫn ghi lần ngập (không số mưa)', async () => {
    mua.thayFetchChoThu(async () => { throw new Error('mất mạng'); });
    const a = duong('Đường A');
    assert.equal((await API(CAN_BO, 'PATCH', `/diem-den/${a}/ngap`, { dangNgap: true })).status, 200);
    await ng.choGhiXong();
    const [d] = ctl.db.prepare('SELECT * FROM ngap_theo_mua').all();
    assert.equal(d.mua_3h_lon_nhat, null);
  });

  test('danh sách cán bộ: kèm ngưỡng, lịch sử ngập và gợi ý', async () => {
    const a = duong('Đường A'); datNguong(a, 30);
    for (const [mm, h] of [[40, 50], [35, 48], [28, 30], [50, 20]]) {
      ctl.db.prepare('INSERT INTO ngap_theo_mua (hotspot_id, xac_nhan_luc, mua_3h_lon_nhat, mua_12h) VALUES (?,?,?,?)')
        .run(a, ctl.luc(h * 60), mm, mm + 5);
    }
    const r = await API(CAN_BO, 'GET', '/diem-den');
    assert.equal(r.status, 200, r.text);
    assert.equal(r.body.coBangNguong, true);
    const d = r.body.ds.find((x) => x.id === a);
    assert.equal(d.nguong_mua_3h, 30);
    assert.equal(d.ngap_theo_mua.soLan, 4);
    assert.equal(d.ngap_theo_mua.goiY, 25, '[28,35,40,50]: hạng thấp nhất của tứ phân vị dưới -> 28 -> làm tròn xuống 25');
    assert.equal(d.ngap_theo_mua.ganDay.length, 4);
    assert.equal(d.ngap_theo_mua.ganDay[0].mua3h, 50, 'lần mới nhất đứng đầu');
  });

  test('đặt ngưỡng: chỉ lãnh đạo; kiểm giá trị; null là bỏ ngưỡng; ghi nhật ký', async () => {
    const a = duong('Đường A');
    const t = duong('Ngã tư', { loai: 'tai_nan' });
    assert.equal((await API(CAN_BO, 'PUT', `/diem-den/${a}/nguong-mua`, { nguongMua3h: 30 })).status, 403);
    for (const sai of [3, 301, 'abc', 12.5, true]) {
      assert.equal((await API(TRUONG, 'PUT', `/diem-den/${a}/nguong-mua`, { nguongMua3h: sai })).status, 400, String(sai));
    }
    assert.equal((await API(TRUONG, 'PUT', `/diem-den/${t}/nguong-mua`, { nguongMua3h: 30 })).status, 400, 'điểm tai nạn không có ngưỡng ngập');
    assert.equal((await API(TRUONG, 'PUT', '/diem-den/999/nguong-mua', { nguongMua3h: 30 })).status, 404);

    assert.equal((await API(TRUONG, 'PUT', `/diem-den/${a}/nguong-mua`, { nguongMua3h: 30 })).status, 200);
    assert.equal(ctl.db.prepare('SELECT nguong_mua_3h FROM nguong_ngap_duong WHERE hotspot_id = ?').get(a).nguong_mua_3h, 30);
    assert.equal((await API(TRUONG, 'PUT', `/diem-den/${a}/nguong-mua`, { nguongMua3h: 45 })).status, 200);
    assert.equal(ctl.db.prepare('SELECT nguong_mua_3h FROM nguong_ngap_duong WHERE hotspot_id = ?').get(a).nguong_mua_3h, 45);
    assert.equal((await API(TRUONG, 'PUT', `/diem-den/${a}/nguong-mua`, { nguongMua3h: null })).status, 200);
    assert.equal(ctl.db.prepare('SELECT COUNT(*) AS n FROM nguong_ngap_duong').get().n, 0);
    const nk = ctl.db.prepare("SELECT * FROM staff_activity_logs WHERE action = 'hotspot_flood_threshold'").all();
    assert.equal(nk.length, 3);
  });

  test('đặt ngưỡng khi chưa chạy nang_cap_v34.sql -> 409, không 500', async () => {
    ctl = dungCsdl(pool, { themCau: [BANG] });
    const a = duong('Đường A');
    assert.equal((await API(TRUONG, 'PUT', `/diem-den/${a}/nguong-mua`, { nguongMua3h: 30 })).status, 409);
    const r = await API(CAN_BO, 'GET', '/diem-den');
    assert.equal(r.status, 200);
    assert.equal(r.body.coBangNguong, false);
  });
});

describe('Tệp nâng cấp CSDL v34', () => {
  test('tạo hai bảng an toàn, xoá tuyến là xoá ngưỡng và lịch sử của tuyến', async () => {
    const sql = await readFile(new URL('../../database/nang_cap_v34.sql', import.meta.url), 'utf8');
    assert.match(sql, /^SET NAMES utf8mb4;/);
    assert.doesNotMatch(sql, /^\s*(USE|DROP)\b/im);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS nguong_ngap_duong/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS ngap_theo_mua/);
    assert.equal((sql.match(/REFERENCES traffic_hotspots\(id\) ON DELETE CASCADE/g) || []).length, 2);
  });
});

describe('Giao diện: nguy cơ theo từng tuyến', () => {
  const goc = (p) => new URL(`../../${p}`, import.meta.url);
  const BO_QUA_TS = process.features?.typescript ? false : 'cần Node đọc được TypeScript (≥ 22.18)';

  test('mức Theo dõi mà có tuyến đạt ngưỡng riêng -> vẫn là có nguy cơ; từng tuyến theo kết luận máy chủ', { skip: BO_QUA_TS }, async () => {
    const u = await import(goc('src/utils/duBaoMua.ts').href);
    const goc1 = { trangThai: 'co_du_lieu', muc: 1, ma: 'theo_doi', ten: 'Theo dõi', lyDo: [], mua24h: 10, mua12hLonNhat: 10,
      mua3hLonNhat: 10, mua3hVuaQua: 0, dinhMua: null, capNhatLuc: '2026-10-15T03:20:00.000Z', cu: false };
    const coTuyen = u.chuanDuBao({ ...goc1, duongNguyCo: [{ id: 7, ten: 'Đường trũng', nguong: 8 }, { id: 'x', ten: 1 }] });
    assert.deepEqual(coTuyen.duongNguyCo, [{ id: 7, ten: 'Đường trũng', nguong: 8 }], 'bỏ phần tử sai dạng');
    assert.equal(u.coNguyCoNgap(coTuyen), true);
    assert.equal(u.duongCoNguyCo(coTuyen, 7), true);
    assert.equal(u.duongCoNguyCo(coTuyen, 8), false);
    const khongTuyen = u.chuanDuBao({ ...goc1, duongNguyCo: [] });
    assert.equal(u.coNguyCoNgap(khongTuyen), false);
    /* Máy chủ cũ (không có duongNguyCo): theo mức chung */
    const cu = u.chuanDuBao({ ...goc1, muc: 2 });
    assert.equal(u.duongCoNguyCo(cu, 7), true);
  });

  test('trang Điểm đen dùng kết luận từng tuyến; trang cán bộ có khối ngưỡng', async () => {
    const trang = await readFile(goc('src/pages/DiemDenGiaoThongPage.tsx'), 'utf8');
    assert.match(trang, /duongCoNguyCo\(duBao, d\.id\)/);
    assert.match(await readFile(goc('src/pages/admin/AdminDiemDenPage.tsx'), 'utf8'), /<NguongMuaDuong /);
  });
});
