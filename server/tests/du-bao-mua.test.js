/**
 * DỰ BÁO MƯA — tự cảnh báo nguy cơ ngập theo lượng mưa (P51)
 * ============================================================================
 *
 * Người vận hành muốn lấy dữ liệu Open-Meteo để TỰ ĐỘNG cảnh báo người dân theo
 * lượng mưa, có các mức dự báo rõ ràng. Quyết định thiết kế:
 *   · Lấy lượng mưa theo giờ (Open-Meteo Forecast API). Flood API của Open-Meteo
 *     là lưu lượng SÔNG (GloFAS, ô lưới ~5 km) — không nói gì về ngập đường phố.
 *   · Mức theo cách phân loại mưa của ngành khí tượng thuỷ văn Việt Nam:
 *       24 giờ: vừa 16–50 mm, to trên 50 mm, rất to trên 100 mm
 *       12 giờ: vừa 8–25 mm,  to trên 25 mm, rất to trên 50 mm
 *   · Máy chủ gọi Open-Meteo, trình duyệt chỉ gọi máy chủ mình: IP người dân không
 *     sang bên thứ ba, không phải nới CSP, và cả web chỉ tốn vài chục lượt/ngày
 *     (bản miễn phí giới hạn dưới 10.000 lượt/ngày, chỉ cho dùng phi thương mại).
 *   · Fail-safe: KHÔNG có dữ liệu ≠ trời yên. Lấy lỗi, dữ liệu hỏng, quá cũ ->
 *     báo "chưa có dự báo", không bao giờ báo "Bình thường".
 *   · Dự báo KHÔNG BAO GIỜ tự đánh dấu "đang ngập" — việc đó vẫn do cán bộ (P50).
 */
import { describe, test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { datBienMoiTruongHopLe } from './helpers-test.js';
import { BO_QUA, dungCsdl, goi, CAN_BO } from './khung-sqlite.js';

datBienMoiTruongHopLe();
const { pool } = await import('../src/db.js');
const mua = await import('../src/lib/du-bao-mua.js');
const { default: congKhaiRouter } = await import('../src/routes/diem-den.js');
const { default: quanTriRouter } = await import('../src/routes/admin/index.js');
const { signAccessToken } = await import('../src/lib/token.js');

const GIO = 3_600_000;
/** 10:20 sáng giờ Việt Nam, 15/10/2026 */
const BAY_GIO = Date.UTC(2026, 9, 15, 3, 20);
const GIO_HIEN_TAI = Math.floor(BAY_GIO / GIO) * 3600;

/**
 * Chuỗi giờ giả như Open-Meteo trả (past_days=1, forecast_days=3, unixtime):
 * 24 giờ trước tới 72 giờ sau giờ hiện tại. `datMua(k)` = lượng mưa ở giờ thứ k
 * tính từ giờ hiện tại (âm = đã qua).
 */
function chuoiGia(datMua = () => 0, { bat = -24, ket = 72 } = {}) {
  const time = [];
  const precipitation = [];
  for (let k = bat; k <= ket; k += 1) {
    time.push(GIO_HIEN_TAI + k * 3600);
    precipitation.push(datMua(k));
  }
  return { hourly_units: { time: 'unixtime', precipitation: 'mm' }, hourly: { time, precipitation } };
}
const muc = (datMua, bayGio = BAY_GIO) => mua.tinhMuc(mua.kiemPhanHoi(chuoiGia(datMua)), bayGio);

describe('Mức dự báo theo lượng mưa', () => {
  test('không mưa -> Bình thường (mức 0)', () => {
    const kq = muc(() => 0);
    assert.equal(kq.muc, 0);
    assert.equal(kq.ma, 'binh_thuong');
    assert.deepEqual(kq.lyDo, []);
    assert.equal(kq.dinhMua, null);
  });

  test('24 giờ tới mưa 20 mm rải đều -> Theo dõi (mưa vừa)', () => {
    const kq = muc((k) => (k >= 1 && k <= 20 ? 1 : 0));
    assert.equal(kq.mua24h, 20);
    assert.equal(kq.muc, 1);
    assert.equal(kq.ma, 'theo_doi');
  });

  test('mưa 10 mm dồn trong vài giờ (dưới 16 mm/24 giờ) vẫn Theo dõi theo ngưỡng 12 giờ', () => {
    const kq = muc((k) => (k >= 2 && k <= 3 ? 5 : 0));
    assert.equal(kq.mua24h, 10);
    assert.equal(kq.muc, 1);
  });

  test('ngay dưới ngưỡng: 15,9 mm/24 giờ, rải mỏng -> Bình thường', () => {
    const kq = muc((k) => (k >= 1 && k <= 24 ? 15.9 / 24 : 0));
    assert.equal(kq.mua24h, 15.9);
    assert.ok(kq.mua12hLonNhat < 8);
    assert.equal(kq.muc, 0);
  });

  test('mưa to 24 giờ (60 mm rải đều, 2,5 mm/giờ) -> Cảnh báo', () => {
    const kq = muc((k) => (k >= 1 && k <= 24 ? 2.5 : 0));
    assert.equal(kq.mua24h, 60);
    assert.equal(kq.muc, 2);
    assert.equal(kq.ma, 'canh_bao');
    assert.ok(kq.lyDo.some((l) => /mưa to/.test(l)), kq.lyDo.join(' | '));
  });

  test('đúng 50 mm/24 giờ chưa phải mưa to (mưa to là TRÊN 50 mm)', () => {
    const kq = muc((k) => (k >= 1 && k <= 24 ? 50 / 24 : 0));
    assert.equal(kq.mua24h, 50);
    assert.equal(kq.muc, 1);
  });

  test('cơn dông 30 mm trong 1 giờ -> Cảnh báo theo ngưỡng 12 giờ, kèm giờ mưa dồn', () => {
    const kq = muc((k) => (k === 5 ? 30 : 0));
    assert.equal(kq.muc, 2);
    assert.equal(kq.mua3hLonNhat, 30);
    assert.ok(kq.dinhMua, 'phải cho biết mưa dồn lúc nào');
    const tu = Date.parse(kq.dinhMua.tu);
    const den = Date.parse(kq.dinhMua.den);
    assert.equal(den - tu, 3 * GIO, 'khung mưa dồn là 3 giờ');
    assert.ok(tu <= (GIO_HIEN_TAI + 4 * 3600) * 1000 && den >= (GIO_HIEN_TAI + 5 * 3600) * 1000, 'khung phải chứa giờ có mưa');
  });

  test('mưa rất to: 120 mm/24 giờ hoặc 55 mm/12 giờ -> Nguy hiểm', () => {
    assert.equal(muc((k) => (k >= 1 && k <= 24 ? 5 : 0)).muc, 3);
    const kq = muc((k) => (k >= 1 && k <= 11 ? 5 : 0));
    assert.equal(kq.mua24h, 55);
    assert.equal(kq.muc, 3);
    assert.equal(kq.ma, 'nguy_hiem');
    assert.ok(kq.lyDo.some((l) => /rất to/.test(l)));
  });

  test('mưa 30 mm vừa xong 2 giờ trước vẫn còn Cảnh báo (nước chưa kịp rút)', () => {
    const kq = muc((k) => (k === -1 ? 30 : 0));
    assert.equal(kq.mua24h, 0);
    assert.equal(kq.mua3hVuaQua, 30);
    assert.equal(kq.muc, 2);
  });

  test('mưa đã qua hơn 3 giờ không tính nữa', () => {
    assert.equal(muc((k) => (k === -4 ? 30 : 0)).muc, 0);
  });

  test('cộng số thực không làm lệch ngưỡng (24 giờ × 16/24 mm vẫn đúng 16 mm)', () => {
    const kq = muc((k) => (k >= 1 && k <= 24 ? 16 / 24 : 0));
    assert.equal(kq.mua24h, 16);
    assert.equal(kq.muc, 1);
  });

  test('thiếu một giờ trong khung tính -> không có kết quả (không coi là 0 mm)', () => {
    assert.equal(muc((k) => (k === 7 ? null : 0)), null);
    /* Giờ thiếu nằm NGOÀI khung (36 giờ sau) thì không sao */
    assert.equal(muc((k) => (k === 36 ? null : 0)).muc, 0);
  });

  test('chuỗi không phủ hết 24 giờ tới -> không có kết quả', () => {
    const ngan = mua.kiemPhanHoi(chuoiGia(() => 0, { bat: -24, ket: 10 }));
    assert.equal(mua.tinhMuc(ngan, BAY_GIO), null);
    const thieuQuaKhu = mua.kiemPhanHoi(chuoiGia(() => 0, { bat: 0, ket: 72 }));
    assert.equal(mua.tinhMuc(thieuQuaKhu, BAY_GIO), null);
  });

  test('bốn mức có mã và tên cố định', () => {
    assert.deepEqual(mua.MUC_DO.map((m) => [m.muc, m.ma]), [
      [0, 'binh_thuong'], [1, 'theo_doi'], [2, 'canh_bao'], [3, 'nguy_hiem'],
    ]);
  });
});

describe('Kiểm dữ liệu Open-Meteo trả về', () => {
  const hong = (sua) => {
    const d = chuoiGia(() => 1);
    sua(d);
    return () => mua.kiemPhanHoi(d);
  };

  test('dữ liệu đúng dạng thì nhận', () => {
    const c = mua.kiemPhanHoi(chuoiGia(() => 1));
    assert.equal(c.gio.length, 97);
    assert.equal(c.mua.length, 97);
  });

  test('sai dạng thì từ chối', () => {
    assert.throws(() => mua.kiemPhanHoi(null));
    assert.throws(() => mua.kiemPhanHoi({}));
    assert.throws(() => mua.kiemPhanHoi({ hourly: { time: 'x', precipitation: [] } }));
    assert.throws(hong((d) => { d.hourly.precipitation.pop(); }), 'lệch độ dài');
    assert.throws(hong((d) => { d.hourly.time = []; d.hourly.precipitation = []; }), 'rỗng');
    assert.throws(hong((d) => { d.hourly_units.precipitation = 'inch'; }), 'sai đơn vị');
    assert.throws(hong((d) => { d.hourly.time[5] += 60; }), 'giờ không tròn');
    assert.throws(hong((d) => { d.hourly.time[5] = d.hourly.time[4]; d.hourly.time[6] = d.hourly.time[4] + 3600; }), 'giờ lặp');
    assert.throws(hong((d) => { d.hourly.time[3] = '2026-10-15T10:00'; }), 'giờ dạng chữ');
    assert.throws(hong((d) => { d.hourly.precipitation[3] = -1; }), 'mưa âm');
    assert.throws(hong((d) => { d.hourly.precipitation[3] = 900; }), 'mưa phi lý');
    assert.throws(hong((d) => { d.hourly.precipitation[3] = '5'; }), 'mưa dạng chữ');
    assert.throws(hong((d) => { d.hourly.precipitation[3] = Number.NaN; }), 'NaN');
  });

  test('giá trị null (mô hình không có số) được giữ là null', () => {
    const c = mua.kiemPhanHoi(chuoiGia((k) => (k === 0 ? null : 1)));
    assert.equal(c.mua[24], null);
    assert.equal(c.mua[23], 1);
  });
});

/** fetch giả: đếm lượt gọi, trả lần lượt các phản hồi trong `kichBan` */
function fetchGia(kichBan) {
  const goi = [];
  const fn = async (url, tuyChon) => {
    goi.push({ url: String(url), tuyChon });
    const buoc = typeof kichBan === 'function' ? kichBan(goi.length) : kichBan;
    if (buoc instanceof Error) throw buoc;
    if (typeof buoc === 'number') return new Response('loi', { status: buoc });
    return new Response(typeof buoc === 'string' ? buoc : JSON.stringify(buoc), { status: 200 });
  };
  return { fn, goi };
}

describe('Nguồn dự báo: bộ nhớ đệm, lỗi mạng, dữ liệu cũ', () => {
  let dongHo;
  const nguon = (fetchFn, { env = { DU_BAO_MUA_TOA_DO: '11.01,106.65' }, diem = [] } = {}) => mua.taoNguonDuBao({
    fetchFn,
    bayGio: () => dongHo,
    env,
    docDiem: async () => diem,
    ghiLog: () => {},
  });
  beforeEach(() => { dongHo = BAY_GIO; });

  test('gọi đúng một địa chỉ cố định của Open-Meteo, toạ độ làm tròn, không tham số lạ', async () => {
    const f = fetchGia(chuoiGia(() => 0));
    await nguon(f.fn, { env: { DU_BAO_MUA_TOA_DO: '11.01234, 106.65678' } }).lay();
    assert.equal(f.goi.length, 1);
    const u = new URL(f.goi[0].url);
    assert.equal(u.origin + u.pathname, 'https://api.open-meteo.com/v1/forecast');
    assert.equal(u.searchParams.get('latitude'), '11.01');
    assert.equal(u.searchParams.get('longitude'), '106.66');
    assert.equal(u.searchParams.get('hourly'), 'precipitation');
    assert.equal(u.searchParams.get('timeformat'), 'unixtime');
    assert.deepEqual([...u.searchParams.keys()].sort(),
      ['forecast_days', 'hourly', 'latitude', 'longitude', 'past_days', 'timeformat', 'timezone']);
    assert.ok(f.goi[0].tuyChon?.signal, 'phải có hẹn giờ huỷ — Open-Meteo treo thì máy chủ không treo theo');
  });

  test('trong 30 phút chỉ gọi Open-Meteo một lần, quá 30 phút thì làm mới', async () => {
    const f = fetchGia(chuoiGia(() => 0));
    const n = nguon(f.fn);
    await n.lay();
    dongHo += 29 * 60_000;
    await n.lay();
    assert.equal(f.goi.length, 1);
    dongHo += 2 * 60_000;
    const kq = await n.lay();
    assert.equal(f.goi.length, 2);
    assert.equal(kq.cu, false);
  });

  test('nhiều người mở trang cùng lúc -> chỉ một lượt gọi Open-Meteo', async () => {
    const f = fetchGia(chuoiGia(() => 0));
    const n = nguon(f.fn);
    const ds = await Promise.all([n.lay(), n.lay(), n.lay(), n.lay()]);
    assert.equal(f.goi.length, 1);
    for (const kq of ds) assert.equal(kq.trangThai, 'co_du_lieu');
  });

  test('chưa từng lấy được -> "khong_co_du_lieu", KHÔNG phải mức Bình thường', async () => {
    for (const loi of [new Error('mạng'), 500, 429, '{không phải json', JSON.stringify({ hourly: {} })]) {
      const kq = await nguon(fetchGia(loi).fn).lay();
      assert.equal(kq.trangThai, 'khong_co_du_lieu', `với lỗi ${String(loi)}`);
      assert.equal(kq.muc, undefined);
    }
  });

  test('phản hồi quá lớn bị từ chối', async () => {
    const kq = await nguon(fetchGia('x'.repeat(300_000)).fn).lay();
    assert.equal(kq.trangThai, 'khong_co_du_lieu');
  });

  test('lỗi khi làm mới: dùng bản cũ tối đa 3 giờ (ghi rõ là cũ), quá thì thôi', async () => {
    const f = fetchGia((lan) => (lan === 1 ? chuoiGia((k) => (k >= 1 && k <= 24 ? 2.5 : 0)) : new Error('mạng')));
    const n = nguon(f.fn);
    assert.equal((await n.lay()).muc, 2);
    dongHo += 2 * GIO;
    const cu = await n.lay();
    assert.equal(cu.trangThai, 'co_du_lieu');
    assert.equal(cu.cu, true);
    assert.equal(cu.capNhatLuc, new Date(BAY_GIO).toISOString());
    dongHo += 61 * 60_000;
    assert.equal((await n.lay()).trangThai, 'khong_co_du_lieu');
  });

  test('vừa lỗi thì nghỉ 5 phút mới thử lại — Open-Meteo sập không bị dội yêu cầu', async () => {
    const f = fetchGia(new Error('mạng'));
    const n = nguon(f.fn);
    await n.lay();
    dongHo += 60_000;
    await n.lay();
    await n.lay();
    assert.equal(f.goi.length, 1);
    dongHo += 5 * 60_000;
    await n.lay();
    assert.equal(f.goi.length, 2);
  });

  test('mức tính theo giờ lúc HỎI, không phải giờ lúc lấy (bản đệm 20 phút vẫn trượt khung)', async () => {
    /* Mưa 30 mm ở giờ thứ -3: lúc lấy còn trong khung 3 giờ vừa qua -> Cảnh báo;
       một giờ sau đã ra khỏi khung -> Bình thường, dù chưa lấy lại. */
    const f = fetchGia(chuoiGia((k) => (k === -2 ? 30 : 0)));
    const n = nguon(f.fn);
    dongHo = GIO_HIEN_TAI * 1000 + 55 * 60_000;              // lấy lúc 10:55
    assert.equal((await n.lay()).muc, 2);
    dongHo = (GIO_HIEN_TAI + 3600) * 1000 + 5 * 60_000;      // hỏi lúc 11:05, bản đệm mới 10 phút
    assert.equal((await n.lay()).muc, 0);
    assert.equal(f.goi.length, 1);
  });
});

describe('Chọn điểm dự báo', () => {
  const chon = async (env, diem, lay = 'lay') => {
    const f = fetchGia(chuoiGia(() => 0));
    const n = mua.taoNguonDuBao({ fetchFn: f.fn, bayGio: () => BAY_GIO, env, docDiem: async () => diem, ghiLog: () => {} });
    return { kq: await n[lay](), goi: f.goi };
  };

  test('có DU_BAO_MUA_TOA_DO hợp lệ -> dùng nó', async () => {
    const { kq } = await chon({ DU_BAO_MUA_TOA_DO: '10.85,106.6' }, [{ lat: 11, lng: 106.7, loai: 'ngap' }]);
    assert.deepEqual(kq.toaDo, { lat: 10.85, lng: 106.6 });
    assert.equal(kq.nguonToaDo, 'bien_moi_truong');
  });

  test('không khai -> trung vị các đường hay ngập đang công khai; điểm toạ độ lỗi bị bỏ', async () => {
    const { kq } = await chon({}, [
      { lat: 11.00, lng: 106.64, loai: 'ngap' },
      { lat: 11.02, lng: 106.66, loai: 'ngap' },
      { lat: 11.01, lng: 106.65, loai: 'ngap' },
      { lat: 106.65, lng: 11.01, loai: 'ngap' },        // nhập ngược lat/lng — ngoài Việt Nam
      { lat: 10.20, lng: 105.10, loai: 'tai_nan' },      // điểm tai nạn: không tính khi đã có điểm ngập
    ]);
    assert.deepEqual(kq.toaDo, { lat: 11.01, lng: 106.65 });
    assert.equal(kq.nguonToaDo, 'duong_hay_ngap');
  });

  test('chưa có đường hay ngập -> trung vị điểm đen tai nạn', async () => {
    const { kq } = await chon({}, [{ lat: 10.9, lng: 106.6, loai: 'tai_nan' }, { lat: 10.92, lng: 106.62 }]);
    assert.deepEqual(kq.toaDo, { lat: 10.91, lng: 106.61 });
    assert.equal(kq.nguonToaDo, 'diem_den');
  });

  test('không khai, không có điểm nào -> chưa cấu hình, không gọi Open-Meteo', async () => {
    const { kq, goi } = await chon({}, []);
    assert.equal(kq.trangThai, 'chua_cau_hinh');
    assert.equal(goi.length, 0);
  });

  test('DU_BAO_MUA_TOA_DO=tat -> tắt hẳn, không gọi Open-Meteo', async () => {
    const { kq, goi } = await chon({ DU_BAO_MUA_TOA_DO: 'tat' }, [{ lat: 11, lng: 106.6, loai: 'ngap' }]);
    assert.equal(kq.trangThai, 'tat');
    assert.equal(goi.length, 0);
  });

  test('khai sai -> báo cấu hình sai, KHÔNG lặng lẽ đoán điểm khác', async () => {
    for (const sai of ['abc', '11.01', '200,106', '11.01;106.65', '11.01,106.65,3', 'NaN,1', '1e3,106']) {
      const { kq, goi } = await chon({ DU_BAO_MUA_TOA_DO: sai }, [{ lat: 11, lng: 106.6, loai: 'ngap' }]);
      assert.equal(kq.trangThai, 'cau_hinh_sai', sai);
      assert.equal(goi.length, 0, sai);
    }
  });
});

describe('API dự báo mưa', { skip: BO_QUA }, () => {
  const BANG = `CREATE TABLE traffic_hotspots (
    id INTEGER PRIMARY KEY AUTOINCREMENT, ten TEXT, mo_ta TEXT, lat REAL, lng REAL, ward_id INT,
    so_vu INT DEFAULT 0, so_tu_vong INT DEFAULT 0, so_bi_thuong INT DEFAULT 0, ky_thong_ke TEXT,
    muc_do TEXT DEFAULT 'trung_binh', khuyen_cao TEXT, is_published INT DEFAULT 1, created_by INT,
    created_at TEXT DEFAULT (NOW()), updated_at TEXT DEFAULT (NOW()),
    loai TEXT NOT NULL DEFAULT 'tai_nan', ngap_xac_nhan_luc TEXT)`;
  const BANG_CU = BANG.replace(/,\s*loai TEXT NOT NULL DEFAULT 'tai_nan', ngap_xac_nhan_luc TEXT\)/, ')');
  let ctl;
  let f;
  const congKhai = () => goi({ duongGoc: '/api/diem-den', router: congKhaiRouter, staff: null, signAccessToken, method: 'GET', duong: '/du-bao-mua' });
  const quanTri = (staff) => goi({ duongGoc: '/api/admin', router: quanTriRouter, staff, signAccessToken, method: 'GET', duong: '/diem-den/du-bao-mua' });
  const themDiem = (lat, lng, loai, hien = 1) => ctl.db.prepare(
    'INSERT INTO traffic_hotspots (ten, lat, lng, loai, is_published) VALUES (?,?,?,?,?)').run('Đường', lat, lng, loai, hien);
  const muaTheoGioThat = (datMua) => {
    /* Chuỗi theo giờ THẬT (route dùng đồng hồ thật) */
    const hienTai = Math.floor(Date.now() / GIO) * 3600;
    const time = [];
    const precipitation = [];
    for (let k = -24; k <= 72; k += 1) { time.push(hienTai + k * 3600); precipitation.push(datMua(k)); }
    return { hourly_units: { precipitation: 'mm' }, hourly: { time, precipitation } };
  };

  beforeEach(() => {
    ctl = dungCsdl(pool, { themCau: [BANG] });
    delete process.env.DU_BAO_MUA_TOA_DO;
  });
  afterEach(() => { mua.thayFetchChoThu(null); delete process.env.DU_BAO_MUA_TOA_DO; });

  test('công khai: trả mức, số mưa, nguồn Open-Meteo; KHÔNG trả toạ độ', async () => {
    themDiem(11.01, 106.65, 'ngap');
    f = fetchGia(muaTheoGioThat((k) => (k >= 1 && k <= 24 ? 2.5 : 0)));
    mua.thayFetchChoThu(f.fn);
    const r = await congKhai();
    assert.equal(r.status, 200, r.text);
    assert.equal(r.body.trangThai, 'co_du_lieu');
    assert.equal(r.body.muc, 2);
    assert.equal(r.body.ma, 'canh_bao');
    assert.equal(r.body.mua24h, 60);
    assert.match(r.body.nguon.ten, /Open-Meteo/);
    assert.equal(r.body.nguon.giayPhep, 'CC BY 4.0');
    assert.equal(r.body.toaDo, undefined);
    assert.equal(r.body.nguonToaDo, undefined);
    assert.equal(f.goi.length, 1);
  });

  test('công khai: điểm ẩn không dùng để chọn vị trí; không có điểm nào -> chưa cấu hình', async () => {
    themDiem(11.01, 106.65, 'ngap', 0);
    f = fetchGia(muaTheoGioThat(() => 0));
    mua.thayFetchChoThu(f.fn);
    const r = await congKhai();
    assert.equal(r.status, 200);
    assert.equal(r.body.trangThai, 'chua_cau_hinh');
    assert.equal(f.goi.length, 0);
  });

  test('CSDL chưa chạy nang_cap_v31.sql (chưa có cột loai) vẫn chọn được vị trí', async () => {
    ctl = dungCsdl(pool, { themCau: [BANG_CU] });
    ctl.db.prepare('INSERT INTO traffic_hotspots (ten, lat, lng) VALUES (?,?,?)').run('Ngã tư', 10.9, 106.6);
    f = fetchGia(muaTheoGioThat(() => 0));
    mua.thayFetchChoThu(f.fn);
    const r = await quanTri(CAN_BO);
    assert.equal(r.status, 200, r.text);
    assert.equal(r.body.trangThai, 'co_du_lieu');
    assert.equal(r.body.nguonToaDo, 'diem_den');
  });

  test('Open-Meteo lỗi -> 200 "khong_co_du_lieu", không 500, không mức', async () => {
    process.env.DU_BAO_MUA_TOA_DO = '11.01,106.65';
    mua.thayFetchChoThu(fetchGia(new Error('ECONNRESET')).fn);
    const r = await congKhai();
    assert.equal(r.status, 200);
    assert.equal(r.body.trangThai, 'khong_co_du_lieu');
    assert.equal(r.body.muc, undefined);
  });

  test('cán bộ: phải đăng nhập; mọi cán bộ xem được, kèm toạ độ và nguồn toạ độ', async () => {
    process.env.DU_BAO_MUA_TOA_DO = '11.01,106.65';
    mua.thayFetchChoThu(fetchGia(muaTheoGioThat(() => 0)).fn);
    assert.equal((await quanTri(null)).status, 401);
    const r = await quanTri(CAN_BO);
    assert.equal(r.status, 200, r.text);
    assert.deepEqual(r.body.toaDo, { lat: 11.01, lng: 106.65 });
    assert.equal(r.body.nguonToaDo, 'bien_moi_truong');
    assert.equal(r.body.muc, 0);
  });
});

describe('Giao diện dự báo mưa', () => {
  const goc = (p) => new URL(`../../${p}`, import.meta.url);
  const BO_QUA_TS = process.features?.typescript ? false : 'cần Node đọc được TypeScript (≥ 22.18)';

  test('trình duyệt KHÔNG gọi thẳng Open-Meteo — chỉ gọi máy chủ mình', async () => {
    for (const tep of ['src/hooks/useDuBaoMua.ts', 'src/components/DuBaoMua/KhungDuBaoMua.tsx',
      'src/components/DuBaoMua/CanhBaoMuaTrangChu.tsx', 'src/utils/duBaoMua.ts']) {
      const ma = await readFile(goc(tep), 'utf8');
      assert.doesNotMatch(ma, /api\.open-meteo\.com/, `${tep} gọi thẳng Open-Meteo`);
    }
    const hook = await readFile(goc('src/hooks/useDuBaoMua.ts'), 'utf8');
    assert.match(hook, /\/api\/diem-den\/du-bao-mua/);
  });

  test('ghi nguồn Open-Meteo (CC BY 4.0 bắt buộc ghi công) và lời nhắc đây là dự báo', async () => {
    const ma = await readFile(goc('src/components/DuBaoMua/KhungDuBaoMua.tsx'), 'utf8');
    assert.match(ma, /Open-Meteo/);
    assert.match(ma, /CC BY 4\.0/);
    assert.match(ma, /nchmf\.gov\.vn/, 'phải chỉ người dân tới bản tin chính thức');
  });

  test('trang Điểm đen, trang chủ, trang cán bộ đều dùng dự báo', async () => {
    assert.match(await readFile(goc('src/pages/DiemDenGiaoThongPage.tsx'), 'utf8'), /<KhungDuBaoMua\b/);
    assert.match(await readFile(goc('src/pages/HomePage.tsx'), 'utf8'), /<CanhBaoMuaTrangChu\b/);
    assert.match(await readFile(goc('src/pages/admin/AdminDiemDenPage.tsx'), 'utf8'), /<KhungDuBaoMua\b[^>]*canBo/);
  });

  test('dự báo không tự đánh dấu "đang ngập" ở giao diện', async () => {
    const ma = await readFile(goc('src/pages/DiemDenGiaoThongPage.tsx'), 'utf8');
    /* "Đang ngập" chỉ đến từ d.dangNgap (cán bộ xác nhận) */
    assert.doesNotMatch(ma, /dangNgap\s*=\s*[^;]*duBao/i);
    assert.match(ma, /Nguy cơ ngập/);
  });

  test('chuanDuBao: dữ liệu lạ từ máy chủ -> "khong_co_du_lieu"; đủ 4 mức có lời khuyên', { skip: BO_QUA_TS }, async () => {
    const u = await import(goc('src/utils/duBaoMua.ts').href);
    for (const rac of [null, 'x', 5, {}, { trangThai: 'la' }, { trangThai: 'co_du_lieu', muc: 7 },
      { trangThai: 'co_du_lieu', muc: 2 }, { trangThai: 'co_du_lieu', muc: '2', mua24h: 60 }]) {
      assert.equal(u.chuanDuBao(rac).trangThai, 'khong_co_du_lieu', JSON.stringify(rac));
    }
    const tot = u.chuanDuBao({ trangThai: 'co_du_lieu', muc: 2, ma: 'canh_bao', ten: 'Cảnh báo', lyDo: ['x'],
      mua24h: 60, mua12hLonNhat: 30, mua3hLonNhat: 7.5, mua3hVuaQua: 0, dinhMua: null,
      capNhatLuc: '2026-10-15T03:20:00.000Z', cu: false });
    assert.equal(tot.trangThai, 'co_du_lieu');
    assert.equal(tot.muc, 2);
    assert.equal(u.chuanDuBao({ trangThai: 'chua_cau_hinh' }).trangThai, 'chua_cau_hinh');
    for (const m of [0, 1, 2, 3]) {
      assert.ok(u.HIEN_MUC[m]?.ten && u.HIEN_MUC[m]?.loiKhuyen, `thiếu mức ${m}`);
    }
    assert.equal(u.coNguyCoNgap(tot), true);
    assert.equal(u.coNguyCoNgap({ ...tot, muc: 1 }), false);
    assert.equal(u.coNguyCoNgap({ trangThai: 'khong_co_du_lieu' }), false);
  });

  test('bảng giải thích mức ở giao diện khớp ngưỡng máy chủ', { skip: BO_QUA_TS }, async () => {
    const u = await import(goc('src/utils/duBaoMua.ts').href);
    assert.deepEqual(JSON.parse(JSON.stringify(u.NGUONG_HIEN)), mua.NGUONG);
    for (const m of [0, 1, 2, 3]) assert.ok(u.MO_TA_MUC[m], `thiếu mô tả mức ${m}`);
  });

  test('khoangGio: giờ Việt Nam, nói rõ hôm nay / ngày mai', { skip: BO_QUA_TS }, async () => {
    const u = await import(goc('src/utils/duBaoMua.ts').href);
    const bayGio = new Date('2026-10-15T03:20:00Z');               // 10:20 ngày 15/10 giờ VN
    assert.equal(u.khoangGio('2026-10-15T07:00:00Z', '2026-10-15T10:00:00Z', bayGio), '14:00–17:00 hôm nay');
    assert.equal(u.khoangGio('2026-10-15T20:00:00Z', '2026-10-15T23:00:00Z', bayGio), '03:00–06:00 ngày mai');
    assert.equal(u.khoangGio('2026-10-15T15:00:00Z', '2026-10-15T18:00:00Z', bayGio), '22:00 hôm nay – 01:00 ngày mai');
    assert.equal(u.khoangGio('2026-10-17T01:00:00Z', '2026-10-17T04:00:00Z', bayGio), '08:00–11:00 ngày 17/10');
  });
});
