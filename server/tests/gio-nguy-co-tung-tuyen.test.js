/**
 * GIỜ NGUY CƠ NGẬP CỦA TỪNG TUYẾN (P65, bổ sung) — người vận hành: "dự báo ngập lúc
 * khoảng từ mấy giờ đến mấy giờ … ghi cho từng tuyến luôn".
 *
 * Mỗi tuyến có ngưỡng mưa dồn 3 giờ riêng (P53), nên mỗi tuyến có khung giờ riêng:
 * từ giờ mưa đầu tiên tới giờ mưa cuối cùng của các khung 3 giờ ĐẠT ngưỡng của tuyến
 * đó (cắt bỏ các giờ không mưa ở hai đầu khung — không báo rộng hơn lúc có mưa).
 * Tuyến chưa có ngưỡng riêng, hoặc báo vì lưới an toàn mức Nguy hiểm: theo khung mưa
 * dồn mạnh nhất. Dự báo vẫn chỉ có một điểm cho cả vùng — giờ khác nhau là vì ngưỡng
 * khác nhau, không phải vì mưa ở mỗi tuyến khác nhau.
 */
import { describe, test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { datBienMoiTruongHopLe } from './helpers-test.js';
import { BO_QUA, dungCsdl, goi, CAN_BO } from './khung-sqlite.js';

datBienMoiTruongHopLe();
const { pool } = await import('../src/db.js');
const mua = await import('../src/lib/du-bao-mua.js');
const { default: congKhaiRouter } = await import('../src/routes/diem-den.js');
const { default: adminRouter } = await import('../src/routes/admin/index.js');
const { signAccessToken } = await import('../src/lib/token.js');

const GIO = 3_600_000;
const iso = (giayGoc, h) => new Date((giayGoc + h * 3600) * 1000).toISOString();

describe('khungMuaDon: khung giờ các khung 3 giờ đạt ngưỡng', () => {
  /* ket = mốc KẾT THÚC của giờ (cùng quy ước chuỗi dự báo) */
  const H = 1_800_000_000 - (1_800_000_000 % 3600);
  const chuoi = (mua1) => mua1.map((mm, j) => ({ ket: H + (j + 1) * 3600, mm }));

  test('cắt giờ không mưa ở hai đầu; hai đợt thì từ đợt đầu tới đợt cuối', () => {
    /* giờ thứ 3 (H+2h → H+3h) mưa 10 mm, giờ thứ 8 mưa 10 mm */
    const g = chuoi([0, 0, 10, 0, 0, 0, 0, 10, 0, 0, 0, 0]);
    assert.deepEqual(mua.khungMuaDon(g, 8), { tu: iso(H, 2), den: iso(H, 8) });
    assert.deepEqual(mua.khungMuaDon(chuoi([0, 0, 10, 0, 0]), 8), { tu: iso(H, 2), den: iso(H, 3) });
    assert.deepEqual(mua.khungMuaDon(chuoi([0, 4, 5, 0, 0]), 8), { tu: iso(H, 1), den: iso(H, 3) }, 'cộng dồn hai giờ mới đạt');
  });

  test('không khung nào đạt, không mưa, thiếu chuỗi -> null (không bịa giờ)', () => {
    assert.equal(mua.khungMuaDon(chuoi([0, 4, 0, 0, 3]), 8), null);
    assert.equal(mua.khungMuaDon(chuoi([0, 0, 0, 0]), 0), null);
    assert.equal(mua.khungMuaDon(undefined, 8), null);
  });

  test('tinhMuc trả chuỗi mưa theo giờ từ giờ đầu được xét', () => {
    const bayGio = Date.UTC(2026, 9, 15, 3, 20);
    const gio = Math.floor(bayGio / GIO) * 3600;
    const time = []; const precipitation = [];
    for (let k = -24; k <= 72; k += 1) { time.push(gio + k * 3600); precipitation.push(k === 5 ? 12 : 0); }
    const kq = mua.tinhMuc(mua.kiemPhanHoi({ hourly: { time, precipitation } }), bayGio);
    assert.equal(kq.muaTheoGio.length, 27, 'Open-Meteo: 3 giờ vừa qua + 24 giờ tới');
    assert.deepEqual(mua.khungMuaDon(kq.muaTheoGio, 10), { tu: iso(gio, 4), den: iso(gio, 5) });
  });

  test('phần trả người dân không kèm chuỗi theo giờ (chỉ dùng trong máy chủ)', () => {
    const ra = mua.banCongKhai({ trangThai: 'co_du_lieu', muc: 0, muaTheoGio: [{ ket: 1, mm: 1 }] });
    assert.equal('muaTheoGio' in ra, false);
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

describe('API: mỗi tuyến nguy cơ kèm khung giờ của chính nó', { skip: BO_QUA }, () => {
  let ctl;
  let hienTai;
  const duong = (ten) => Number(ctl.db.prepare(
    "INSERT INTO traffic_hotspots (ten, lat, lng, loai, is_published) VALUES (?, 11.01, 106.65, 'ngap', 1)").run(ten).lastInsertRowid);
  const datNguong = (id, mm) => ctl.db.prepare('INSERT INTO nguong_ngap_duong (hotspot_id, nguong_mua_3h) VALUES (?, ?)').run(id, mm);
  function muaGia(datMua) {
    hienTai = Math.floor(Date.now() / GIO) * 3600;
    const time = []; const precipitation = [];
    for (let k = -24; k <= 72; k += 1) { time.push(hienTai + k * 3600); precipitation.push(datMua(k)); }
    const than = JSON.stringify({ hourly_units: { precipitation: 'mm' }, hourly: { time, precipitation } });
    return async () => new Response(than, { status: 200 });
  }
  beforeEach(() => {
    ctl = dungCsdl(pool, { themCau: [BANG, BANG_NGUONG] });
    process.env.DU_BAO_MUA_TOA_DO = '11.01,106.65';
  });
  afterEach(() => { mua.thayFetchChoThu(null); delete process.env.DU_BAO_MUA_TOA_DO; });

  test('ngưỡng thấp báo sớm hơn ngưỡng cao; tuyến chưa có ngưỡng theo khung mưa dồn mạnh nhất', async () => {
    /* 10 mm lúc +3h, 10 mm lúc +8h, 15 mm lúc +12h: mưa dồn 12 giờ 35 mm -> mức Cảnh báo */
    mua.thayFetchChoThu(muaGia((k) => (k === 3 || k === 8 ? 10 : k === 12 ? 15 : 0)));
    const a = duong('Đường trũng A'); datNguong(a, 8);
    const b = duong('Đường B'); datNguong(b, 12);
    duong('Đường C chưa có ngưỡng');
    const r = await goi({ duongGoc: '/api/diem-den', router: congKhaiRouter, staff: null, signAccessToken, method: 'GET', duong: '/du-bao-mua' });
    assert.equal(r.status, 200, r.text);
    assert.equal(r.body.muc, 2);
    assert.equal('muaTheoGio' in r.body, false, 'không trả chuỗi theo giờ cho người dân');
    const khung = Object.fromEntries(r.body.duongNguyCo.map((d) => [d.ten, d.khung]));
    assert.deepEqual(khung['Đường trũng A'], { tu: iso(hienTai, 2), den: iso(hienTai, 12) });
    assert.deepEqual(khung['Đường B'], { tu: iso(hienTai, 11), den: iso(hienTai, 12) });
    assert.deepEqual(khung['Đường C chưa có ngưỡng'], { tu: iso(hienTai, 11), den: iso(hienTai, 12) });
  });

  test('trang cán bộ cũng có khung giờ từng tuyến', async () => {
    mua.thayFetchChoThu(muaGia((k) => (k === 3 ? 30 : 0)));
    duong('Đường A');
    const r = await goi({ duongGoc: '/api/admin', router: adminRouter, staff: CAN_BO, signAccessToken, method: 'GET', duong: '/diem-den/du-bao-mua' });
    assert.equal(r.status, 200, r.text);
    assert.deepEqual(r.body.duongNguyCo[0].khung, { tu: iso(hienTai, 2), den: iso(hienTai, 3) });
  });
});

describe('Giao diện: giờ của từng tuyến', () => {
  const goc = (p) => new URL(`../../${p}`, import.meta.url);
  const BO_QUA_TS = process.features?.typescript ? false : 'cần Node đọc được TypeScript (≥ 22.18)';
  test('chuanDuBao giữ khung hợp lệ, bỏ khung lạ nhưng vẫn giữ tuyến', { skip: BO_QUA_TS }, async () => {
    const u = await import(goc('src/utils/duBaoMua.ts').href);
    const g = { trangThai: 'co_du_lieu', muc: 2, lyDo: [], mua24h: 30, mua12hLonNhat: 30, mua3hLonNhat: 30, mua3hVuaQua: 0,
      dinhMua: null, capNhatLuc: '2026-10-15T03:20:00.000Z' };
    const k = { tu: '2026-10-15T05:00:00.000Z', den: '2026-10-15T07:00:00.000Z' };
    const d = u.chuanDuBao({ ...g, duongNguyCo: [{ id: 1, ten: 'A', nguong: 8, khung: k }, { id: 2, ten: 'B', nguong: null, khung: { tu: 'x', den: 1 } }] });
    assert.deepEqual(d.duongNguyCo, [{ id: 1, ten: 'A', nguong: 8, khung: k }, { id: 2, ten: 'B', nguong: null }]);
  });
  test('trang Điểm đen ghi giờ từng tuyến', async () => {
    const { readFile } = await import('node:fs/promises');
    const ma = await readFile(goc('src/pages/DiemDenGiaoThongPage.tsx'), 'utf8');
    assert.match(ma, /khoangGio\(k\.tu,\s*k\.den\)/);
  });
});
