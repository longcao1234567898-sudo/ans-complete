/**
 * DỰ BÁO MƯA — NGUỒN DỰ PHÒNG MET NORWAY (P64)
 *
 * Trang cán bộ báo Open-Meteo trả 429: Render gói miễn phí dùng chung IP với rất nhiều
 * web, IP đó hết lượt từ trước. Open-Meteo lỗi thì máy chủ lấy từ MET Norway (viện khí
 * tượng Na Uy, Locationforecast 2.0, miễn phí, không cần khoá, phủ toàn cầu).
 *
 * MET Norway không có số mưa đã qua: dùng nguồn này thì mức chỉ tính theo 24 giờ tới,
 * các số "vừa qua" để null (không phải 0 — không có dữ liệu ≠ trời yên).
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { datBienMoiTruongHopLe } from './helpers-test.js';

datBienMoiTruongHopLe();
const mua = await import('../src/lib/du-bao-mua.js');

const GIO = 3_600_000;
const BAY_GIO = Date.UTC(2026, 9, 15, 3, 20);
const GIO_HIEN_TAI = Math.floor(BAY_GIO / GIO) * 3600;
const iso = (giay) => new Date(giay * 1000).toISOString().replace('.000Z', 'Z');

/**
 * Phản hồi giả như MET Norway (compact): mỗi mốc t có next_1_hours = mưa của giờ (t, t+1h].
 * `datMua(k)` = mưa của giờ KẾT THÚC lúc GIO_HIEN_TAI + k giờ (cùng quy ước chuỗi Open-Meteo).
 */
function metGia(datMua = () => 0, { soGio = 60, batDau = 0, them = {} } = {}) {
  const timeseries = [];
  for (let k = batDau + 1; k <= batDau + soGio; k += 1) {
    timeseries.push({ time: iso(GIO_HIEN_TAI + (k - 1) * 3600),
      data: { instant: { details: { air_temperature: 28 } }, next_1_hours: { summary: { symbol_code: 'rain' }, details: { precipitation_amount: datMua(k) } } } });
  }
  /* Sau phần theo giờ, MET chuyển sang bước 6 giờ (không có next_1_hours) */
  timeseries.push({ time: iso(GIO_HIEN_TAI + (batDau + soGio + 5) * 3600), data: { instant: { details: {} }, next_6_hours: { details: { precipitation_amount: 1 } } } });
  return { type: 'Feature', properties: { meta: { units: { precipitation_amount: 'mm' } }, timeseries }, ...them };
}

/** Chuỗi Open-Meteo giả: 24 giờ trước tới 72 giờ sau */
function omGia(datMua = () => 0) {
  const time = []; const precipitation = [];
  for (let k = -24; k <= 72; k += 1) { time.push(GIO_HIEN_TAI + k * 3600); precipitation.push(datMua(k)); }
  return { hourly_units: { precipitation: 'mm' }, hourly: { time, precipitation } };
}

describe('Đọc dữ liệu MET Norway', () => {
  test('đổi về cùng quy ước với Open-Meteo: mốc = giờ KẾT THÚC, chỉ lấy phần theo giờ', () => {
    const c = mua.kiemPhanHoiMetNo(metGia((k) => k, { soGio: 48 }));
    assert.equal(c.coGioQua, false);
    assert.equal(c.gio.length, 48, 'dừng ở mốc đầu tiên không có next_1_hours');
    assert.equal(c.gio[0], GIO_HIEN_TAI + 3600);
    assert.equal(c.mua[0], 1);
    assert.equal(c.gio[47], GIO_HIEN_TAI + 48 * 3600);
  });

  test('dữ liệu lạ -> ném lỗi (không đoán)', () => {
    const hong = [
      {}, { properties: {} }, { properties: { timeseries: 'x' } },
      metGia(() => -1), metGia(() => 900), metGia(() => 'nhiều'),
      { properties: { meta: { units: { precipitation_amount: 'in' } }, timeseries: metGia().properties.timeseries } },
      { properties: { meta: { units: { precipitation_amount: 'mm' } }, timeseries: [{ time: 'không-phải-giờ', data: { next_1_hours: { details: { precipitation_amount: 0 } } } }] } },
      { properties: { meta: { units: { precipitation_amount: 'mm' } }, timeseries: [{ time: '2026-10-15T03:30:00Z', data: { next_1_hours: { details: { precipitation_amount: 0 } } } }] } },
    ];
    for (const d of hong) assert.throws(() => mua.kiemPhanHoiMetNo(d), undefined, JSON.stringify(d).slice(0, 80));
  });
});

describe('Tính mức khi nguồn không có số mưa đã qua', () => {
  const quaMet = (datMua) => mua.tinhMuc(mua.kiemPhanHoiMetNo(metGia(datMua)), BAY_GIO);
  const quaOm = (datMua) => mua.tinhMuc(mua.kiemPhanHoi(omGia(datMua)), BAY_GIO);

  test('cùng mưa ở 24 giờ tới -> cùng mức, cùng tổng, cùng khung mưa dồn với Open-Meteo', () => {
    for (const datMua of [() => 0, (k) => (k >= 1 && k <= 20 ? 1 : 0), (k) => (k >= 5 && k <= 7 ? 20 : 0), (k) => (k === 24 ? 60 : 0)]) {
      const a = quaMet(datMua); const b = quaOm(datMua);
      for (const truong of ['muc', 'mua24h', 'mua12hLonNhat', 'mua3hLonNhat', 'dinhMua']) assert.deepEqual(a[truong], b[truong], truong);
    }
  });

  test('số mưa đã qua để null — KHÔNG phải 0', () => {
    const kq = quaMet(() => 2);
    assert.equal(kq.mua3hVuaQua, null);
    assert.equal(kq.mua12hVuaQua, null);
    assert.equal(kq.mua3hLonNhat12hQua, null);
  });

  test('thiếu giờ trong 24 giờ tới -> không tính (null)', () => {
    assert.equal(mua.tinhMuc(mua.kiemPhanHoiMetNo(metGia(() => 0, { soGio: 20 })), BAY_GIO), null);
    assert.equal(mua.tinhMuc(mua.kiemPhanHoiMetNo(metGia(() => 0, { batDau: 2 })), BAY_GIO), null, 'bắt đầu muộn 2 giờ');
  });
});

/** Mạng giả: trả theo máy được gọi */
function mang({ om, met }) {
  const goi = [];
  const tra = (kb) => (typeof kb === 'number'
    ? { ok: false, status: kb, headers: { get: () => null }, text: async () => '' }
    : { ok: true, status: 200, headers: { get: () => null }, text: async () => JSON.stringify(kb) });
  const fn = async (url, tuyChon) => {
    goi.push({ url, tuyChon });
    const kb = new URL(url).hostname === 'api.met.no' ? met : om;
    if (kb instanceof Error) throw kb;
    return tra(kb);
  };
  return { fn, goi };
}
const nguon = (fn, duPhong = true) => mua.taoNguonDuBao({
  fetchFn: fn, bayGio: () => BAY_GIO, env: { DU_BAO_MUA_TOA_DO: '11.01,106.65' }, docDiem: async () => [], ghiLog: () => {}, duPhong,
});

describe('Chuyển sang nguồn dự phòng', () => {
  test('Open-Meteo 429 -> lấy MET Norway: có dữ liệu, ghi nguồn, cán bộ thấy vì sao', async () => {
    const m = mang({ om: 429, met: metGia((k) => (k >= 1 && k <= 20 ? 1 : 0)) });
    const kq = await nguon(m.fn).lay();
    assert.equal(kq.trangThai, 'co_du_lieu');
    assert.equal(kq.muc, 1);
    assert.equal(kq.nguonDuLieu, 'met-no');
    assert.deepEqual(kq.duPhong, { ma: 'http', maHttp: 429, luc: new Date(BAY_GIO).toISOString() });
    assert.equal(kq.loiGanNhat, undefined, 'đã có dữ liệu thì không báo "không lấy được"');
    const met = m.goi.find((g) => new URL(g.url).hostname === 'api.met.no');
    const u = new URL(met.url);
    assert.equal(u.origin + u.pathname, 'https://api.met.no/weatherapi/locationforecast/2.0/compact');
    assert.deepEqual([...u.searchParams.keys()].sort(), ['lat', 'lon']);
    assert.equal(u.searchParams.get('lat'), '11.01');
    assert.match(met.tuyChon.headers['User-Agent'], /\S+\/\S+ .*github\.com/, 'MET Norway bắt buộc User-Agent có cách liên hệ');
    assert.ok(met.tuyChon.signal);
  });

  test('Open-Meteo lấy được thì không gọi MET Norway', async () => {
    const m = mang({ om: omGia(), met: metGia() });
    const kq = await nguon(m.fn).lay();
    assert.equal(kq.nguonDuLieu, 'open-meteo');
    assert.equal(kq.duPhong, undefined);
    assert.equal(m.goi.length, 1);
  });

  test('cả hai cùng lỗi -> không có dữ liệu, báo lỗi của nguồn chính', async () => {
    const kq = await nguon(mang({ om: 429, met: 503 }).fn).lay();
    assert.equal(kq.trangThai, 'khong_co_du_lieu');
    assert.equal(kq.loiGanNhat.maHttp, 429);
  });

  test('tắt dự phòng thì không gọi MET Norway', async () => {
    const m = mang({ om: 429, met: metGia() });
    assert.equal((await nguon(m.fn, false).lay()).trangThai, 'khong_co_du_lieu');
    assert.equal(m.goi.length, 1);
  });

  test('bản chạy thật: dự phòng bật mặc định, DU_BAO_MUA_DU_PHONG=tat thì tắt', () => {
    assert.equal(mua.batDuPhong({}), true);
    assert.equal(mua.batDuPhong({ DU_BAO_MUA_DU_PHONG: 'tat' }), false);
    assert.equal(mua.batDuPhong({ DU_BAO_MUA_DU_PHONG: ' TAT ' }), false);
  });

  test('ghi công đúng nguồn đang dùng; người dân không thấy lý do dự phòng', async () => {
    const kq = await nguon(mang({ om: 429, met: metGia() }).fn).lay();
    const cong = mua.banCongKhai(kq);
    assert.equal(cong.nguon.ten, 'MET Norway');
    assert.equal('duPhong' in cong, false);
    assert.equal('nguonDuLieu' in cong, true, 'giao diện cần biết nguồn để ghi công');
    assert.equal(mua.banCongKhai(await nguon(mang({ om: omGia() }).fn).lay()).nguon.ten, 'Open-Meteo.com');
    assert.equal(mua.nguonGhiCong(kq).ten, 'MET Norway');
  });

  test('giao diện ghi công theo nguồn, không gọi thẳng MET Norway', async () => {
    const khung = await readFile(new URL('../../src/components/DuBaoMua/KhungDuBaoMua.tsx', import.meta.url), 'utf8');
    const util = await readFile(new URL('../../src/utils/duBaoMua.ts', import.meta.url), 'utf8');
    assert.match(khung, /MET Norway/);
    assert.doesNotMatch(khung + util, /api\.met\.no/);
    assert.match(khung, /canBo\s*&&\s*d\.duPhong/, 'lý do dự phòng chỉ cho cán bộ');
  });
});

describe('Giao diện đọc dữ liệu nguồn dự phòng', () => {
  const BO_QUA_TS = Number(process.versions.node.split('.')[0]) < 22 && 'cần Node 22 để chạy thẳng tệp .ts';
  const coBan = { trangThai: 'co_du_lieu', muc: 1, mua24h: 20, mua12hLonNhat: 9, mua3hLonNhat: 3, capNhatLuc: '2026-10-15T03:00:00.000Z' };
  test('mua3hVuaQua null vẫn hiện dự báo; lạ thì bỏ; nguồn và lý do dự phòng được kiểm', { skip: BO_QUA_TS }, async () => {
    const u = await import(new URL('../../src/utils/duBaoMua.ts', import.meta.url).href);
    const luc = '2026-10-15T03:20:00.000Z';
    const a = u.chuanDuBao({ ...coBan, mua3hVuaQua: null, nguonDuLieu: 'met-no', duPhong: { ma: 'http', maHttp: 429, luc } });
    assert.equal(a.trangThai, 'co_du_lieu');
    assert.equal(a.nguonDuLieu, 'met-no');
    assert.deepEqual(a.duPhong, { ma: 'http', maHttp: 429, luc });
    assert.equal(u.chuanDuBao({ ...coBan, mua3hVuaQua: 'x' }).trangThai, 'khong_co_du_lieu');
    assert.equal(u.chuanDuBao({ ...coBan, mua3hVuaQua: 2, nguonDuLieu: '<script>' }).nguonDuLieu, 'open-meteo');
    assert.equal(u.chuanDuBao({ ...coBan, mua3hVuaQua: 2, duPhong: { ma: 'la' } }).duPhong, undefined);
    assert.match(u.moTaDuPhong({ ma: 'http', maHttp: 429, luc }), /MET Norway.*429.*24 giờ tới/s);
  });
});
