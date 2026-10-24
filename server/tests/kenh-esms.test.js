/**
 * P89 — BỘ KẾT NỐI eSMS.vn (Zalo ZNS + SMS thương hiệu)
 *
 * Không gọi eSMS thật: thay `fetch` bằng bản giả ghi lại lệnh gửi. Mục đích là
 * chứng minh (1) thiếu biến môi trường thì kênh KHÔNG đăng ký — cấu hình khai
 * kênh đó sẽ tắt cả tính năng thay vì âm thầm không gửi; (2) chỉ "100" mới là
 * nhận lệnh; (3) trả lời mập mờ thì ném lỗi để không gửi thêm kênh tốn tiền;
 * (4) nhật ký không chứa số điện thoại, mã, khoá.
 */
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

const { dangKyEsms, DUONG_ZALO, DUONG_SMS } = await import('../src/lib/kenh/esms.js');
const { cauHinhKenh, guiQuaKenh } = await import('../src/lib/kenh-gui-ma.js');

const KHOA = { ESMS_API_KEY: 'khoa-api-bi-mat', ESMS_SECRET_KEY: 'khoa-bi-mat-2' };
const ZALO = { ...KHOA, ESMS_ZALO_OAID: '4097311281936189049', ESMS_ZALO_TEMPID: '200607' };
const SO = '0912345678';
const MA = '482913';

const fetchGoc = globalThis.fetch;
const errorGoc = console.error;
let lenh; let traLoi; let nhatKy;
beforeEach(() => {
  lenh = [];
  nhatKy = [];
  traLoi = async () => new Response(JSON.stringify({ CodeResult: '100', SMSID: 'x' }), { status: 200 });
  globalThis.fetch = async (url, opt) => { lenh.push({ url: String(url), than: JSON.parse(opt.body), opt }); return traLoi(); };
  console.error = (...a) => nhatKy.push(a.map(String).join(' '));
});
afterEach(() => {
  globalThis.fetch = fetchGoc;
  console.error = errorGoc;
});

const gui = (kenh) => guiQuaKenh([kenh], { soDienThoai: SO, noiDung: `Ma xac nhan cua ban: ${MA}.`, ma: MA });

test('thiếu khoá API: không đăng ký kênh nào', () => {
  assert.deepEqual(dangKyEsms({}), []);
  assert.deepEqual(dangKyEsms({ ESMS_API_KEY: 'k' }), []);
  assert.deepEqual(dangKyEsms({ ...KHOA, ESMS_ZALO_OAID: 'oa' }), [], 'Zalo thiếu mẫu tin (TempID)');
});

/* Chạy TRƯỚC mọi test đăng ký SMS (test trong một tệp chạy lần lượt; bảng kênh
   không gỡ được) */
test('chỉ khai Zalo: chỉ có kênh zalo — SMS chưa mở mà cấu hình "zalo,sms" thì TẮT, không âm thầm bỏ SMS', () => {
  assert.deepEqual(dangKyEsms(ZALO), ['zalo']);
  assert.equal(cauHinhKenh({ KENH_XAC_MINH_SDT: 'zalo' }).bat, true);
  const kq = cauHinhKenh({ KENH_XAC_MINH_SDT: 'zalo,sms' });
  assert.equal(kq.bat, false);
  assert.match(kq.lyDo, /sms/);
});

test('Zalo: gửi đúng địa chỉ, mẫu đã duyệt, biến duy nhất là mã; eSMS trả 100 là nhận lệnh', async () => {
  assert.deepEqual(dangKyEsms(ZALO), ['zalo']);
  assert.deepEqual(await gui('zalo'), { ok: true, kenh: 'zalo' });
  assert.equal(lenh.length, 1);
  assert.equal(lenh[0].url, DUONG_ZALO);
  assert.equal(lenh[0].url.startsWith('https://'), true);
  assert.deepEqual(lenh[0].than, {
    ApiKey: KHOA.ESMS_API_KEY, SecretKey: KHOA.ESMS_SECRET_KEY,
    OAID: ZALO.ESMS_ZALO_OAID, TempID: ZALO.ESMS_ZALO_TEMPID,
    Phone: SO, Params: [MA], Sandbox: '0',
  });
  assert.ok(lenh[0].opt.signal, 'phải có hẹn giờ — eSMS treo thì không giữ yêu cầu mãi');
});

test('ESMS_SANDBOX=1: eSMS tạo tin nhưng không gửi — dùng khi thử nghiệm', async () => {
  dangKyEsms({ ...ZALO, ESMS_SANDBOX: '1' });
  await gui('zalo');
  assert.equal(lenh[0].than.Sandbox, '1');
});

test('SMS (xây sẵn): tin không dấu, loại CSKH, đúng tên thương hiệu', async () => {
  assert.deepEqual(dangKyEsms({ ...KHOA, ESMS_BRANDNAME: 'TEN_DON_VI' }), ['sms']);
  assert.deepEqual(await gui('sms'), { ok: true, kenh: 'sms' });
  assert.equal(lenh[0].url, DUONG_SMS);
  assert.deepEqual(lenh[0].than, {
    ApiKey: KHOA.ESMS_API_KEY, SecretKey: KHOA.ESMS_SECRET_KEY,
    Phone: SO, Content: `Ma xac nhan cua ban: ${MA}.`, Brandname: 'TEN_DON_VI', SmsType: '2', IsUnicode: '0', Sandbox: '0',
  });
});

test('eSMS từ chối rõ ràng (mã khác 100): báo không gửi được — nhật ký có mã lỗi, không có số/mã/khoá', async () => {
  dangKyEsms(ZALO);
  traLoi = async () => new Response(JSON.stringify({ CodeResult: '146', ErrorMessage: `Phone ${SO} invalid` }), { status: 200 });
  assert.deepEqual(await gui('zalo'), { ok: false, lyDo: 'tu_choi' });
  const log = nhatKy.join('\n');
  assert.match(log, /146/);
  for (const bi of [SO, MA, KHOA.ESMS_API_KEY, KHOA.ESMS_SECRET_KEY]) assert.ok(!log.includes(bi), `nhật ký lộ ${bi}`);
});

test('trả lời mập mờ (đứt mạng, hết giờ, máy chủ eSMS lỗi, không đọc được): coi là CÓ THỂ đã gửi — không thử kênh sau', async () => {
  dangKyEsms({ ...ZALO, ESMS_BRANDNAME: 'TEN_DON_VI' });
  for (const hong of [
    async () => { throw new TypeError('fetch failed'); },
    async () => { throw new DOMException('timeout', 'TimeoutError'); },
    async () => new Response('<html>502 Bad Gateway</html>', { status: 502 }),
    async () => new Response('{}', { status: 200 }),
  ]) {
    lenh = [];
    traLoi = hong;
    const kq = await guiQuaKenh(['zalo', 'sms'], { soDienThoai: SO, noiDung: 'x', ma: MA });
    assert.deepEqual(kq, { ok: false, lyDo: 'map_mo' });
    assert.equal(lenh.length, 1, 'đã gửi thêm SMS sau khi Zalo trả lời mập mờ');
  }
  const log = nhatKy.join('\n');
  for (const bi of [SO, MA, KHOA.ESMS_API_KEY, KHOA.ESMS_SECRET_KEY]) assert.ok(!log.includes(bi), `nhật ký lộ ${bi}`);
});
