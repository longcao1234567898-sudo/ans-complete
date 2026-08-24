/**
 * THIẾT BỊ TIN CẬY — MIỄN KHOÁ TỰ ĐỘNG CHO MÁY DÙNG CHUNG
 *
 * Máy kiosk, máy tính bảng ở nhà văn hoá, máy tại điểm hỗ trợ: nhiều người
 * dùng chung một device_id. Không miễn trừ thì một người gửi tin rác là khoá
 * cả máy, chặn oan mọi người sau. Mà đây đúng là thiết bị phục vụ người yếu
 * thế nhất — người không có điện thoại riêng.
 *
 * Miễn trừ này phải chắc: một chỗ quên xét là cả cơ chế thủng.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const doc = (p) => readFile(new URL(p, import.meta.url), 'utf8');
const LIB = '../src/lib/chan-spam.js';
const ROUTE = '../src/routes/admin/chat.js';

describe('TC1 — có hàm nhận biết thiết bị tin cậy', () => {
  test('export laThietBiTinCay, truy vấn kind = trusted_device', async () => {
    const ma = await doc(LIB);
    assert.match(ma, /export async function laThietBiTinCay/);
    const khoi = ma.slice(ma.indexOf('export async function laThietBiTinCay'),
                          ma.indexOf('export async function laThietBiTinCay') + 400);
    assert.match(khoi, /kind\s*=\s*'trusted_device'/,
      'phải truy vấn đúng loại trusted_device');
  });
});

describe('TC2 — MỌI đường khoá đều xét tin cậy trước', () => {
  /* Ba nơi có thể khoá một thiết bị: kiemTraBiKhoa (chặn lúc gửi), khoaThietBi
     (khoá 24h), xetKhoaTaiPham (khoá 30 ngày). Cả ba phải bỏ qua thiết bị tin
     cậy. Sót một chỗ là máy kiosk vẫn bị khoá qua đường đó. */

  test('kiemTraBiKhoa trả tinCay và không chặn', async () => {
    const ma = await doc(LIB);
    const khoi = ma.slice(ma.indexOf('export async function kiemTraBiKhoa'),
                          ma.indexOf('export async function laThietBiTinCay'));
    assert.match(khoi, /trusted_device/, 'kiemTraBiKhoa phải xét thiết bị tin cậy');
    assert.match(khoi, /tinCay:\s*true/, 'phải trả cờ tinCay để nơi gọi biết');
  });

  test('khoaThietBi bỏ qua thiết bị tin cậy', async () => {
    const ma = await doc(LIB);
    const khoi = ma.slice(ma.indexOf('export async function khoaThietBi'),
                          ma.indexOf('export async function khoaThietBi') + 500);
    assert.match(khoi, /laThietBiTinCay/,
      'khoaThietBi phải gọi laThietBiTinCay trước khi khoá');
  });

  test('xetKhoaTaiPham bỏ qua thiết bị tin cậy', async () => {
    const ma = await doc(LIB);
    const khoi = ma.slice(ma.indexOf('export async function xetKhoaTaiPham'),
                          ma.indexOf('export async function xetKhoaTaiPham') + 400);
    assert.match(khoi, /laThietBiTinCay/,
      'xetKhoaTaiPham phải gọi laThietBiTinCay trước khi khoá dài hạn');
  });

  test('mô phỏng: thiết bị tin cậy không bị khoá dù đánh dấu nhiều lần', () => {
    const tinCay = new Set(['kiosk-abc']);
    const khoa = (deviceId, soLanRac) => {
      if (tinCay.has(deviceId)) return false;       // tin cậy -> không khoá
      return soLanRac >= 3;                          // thường -> 3 lần thì khoá
    };
    assert.equal(khoa('kiosk-abc', 99), false, 'kiosk đánh 99 lần vẫn không khoá');
    assert.equal(khoa('may-la', 3), true, 'máy thường 3 lần thì khoá');
    assert.equal(khoa('may-la', 1), false);
  });
});

describe('TC3 — route quản trị thiết bị tin cậy', () => {
  test('có đủ xem/thêm/bỏ, chỉ admin và manager', async () => {
    const ma = await doc(ROUTE);
    assert.match(ma, /router\.get\('\/trusted-devices',\s*authorize\('admin', 'manager'\)/,
      'route xem phải chốt quyền admin/manager');
    assert.match(ma, /router\.post\('\/trusted-devices',\s*authorize\('admin', 'manager'\)/,
      'route thêm phải chốt quyền');
    assert.match(ma, /router\.delete\('\/trusted-devices\/:id',\s*authorize\('admin', 'manager'\)/,
      'route bỏ phải chốt quyền');
  });

  test('thêm có ghi nhật ký truy trách nhiệm', async () => {
    const ma = await doc(ROUTE);
    const khoi = ma.slice(ma.indexOf("router.post('/trusted-devices'"),
                          ma.indexOf("router.delete('/trusted-devices"));
    assert.match(khoi, /trust_device/, 'phải ghi nhật ký ai đánh dấu tin cậy');
  });

  test('chặn mã thiết bị quá ngắn', async () => {
    const ma = await doc(ROUTE);
    const khoi = ma.slice(ma.indexOf("router.post('/trusted-devices'"),
                          ma.indexOf("router.delete('/trusted-devices"));
    assert.match(khoi, /length\s*<\s*8/, 'phải từ chối mã thiết bị quá ngắn');
  });
});
