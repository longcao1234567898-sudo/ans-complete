/**
 * C3 — clientIp() phải BỎ QUA hoàn toàn header X-Forwarded-For.
 *
 * Phần tử ĐẦU TIÊN của X-Forwarded-For do CHÍNH CLIENT đặt (proxy chỉ nối thêm
 * vào cuối) -> giả mạo được bằng một dòng `curl -H`. Bản cũ đọc đúng phần tử đó
 * ở 8 chỗ, vô hiệu cùng lúc: cooldown 10 phút gửi ẩn danh, ANON_MAX_PER_DAY=2,
 * MAX_PER_HOUR=5, lớp chống trùng "cùng IP", giới hạn xin mã ẩn danh — và tệ
 * nhất là làm MÙ hệ thống cảnh báo dò mật khẩu (logs.js gom nhóm theo IP:
 * đổi header mỗi request thì mỗi "IP" chỉ có 1 lần thất bại, `co_canh_bao`
 * vĩnh viễn false trong khi hệ thống đang bị tấn công).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clientIp } from '../src/lib/helpers.js';

test('KHÔNG lấy giá trị từ header x-forwarded-for do client tự đặt', () => {
  const req = { ip: '203.0.113.9', headers: { 'x-forwarded-for': '1.2.3.4' } };
  assert.equal(clientIp(req), '203.0.113.9');
});

test('kể cả khi client nhồi nhiều hop giả vào header', () => {
  const req = {
    ip: '203.0.113.9',
    headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8, 9.10.11.12' },
  };
  assert.equal(clientIp(req), '203.0.113.9');
});

test('bóc tiền tố IPv4-mapped ::ffff:', () => {
  assert.equal(clientIp({ ip: '::ffff:192.168.1.7', headers: {} }), '192.168.1.7');
});

test('giữ nguyên IPv6 thật (không bóc nhầm)', () => {
  assert.equal(clientIp({ ip: '2001:db8::1', headers: {} }), '2001:db8::1');
});

test('cắt tối đa 45 ký tự cho vừa cột VARCHAR(45)', () => {
  const dai = 'a'.repeat(200);
  assert.equal(clientIp({ ip: dai, headers: {} }).length, 45);
});

test('req.ip undefined -> trả chuỗi rỗng, KHÔNG ném lỗi', () => {
  assert.equal(clientIp({ headers: {} }), '');
  assert.equal(clientIp({ ip: undefined, headers: {} }), '');
  assert.equal(clientIp({ ip: null, headers: {} }), '');
});

test('không còn chỗ nào trong server/src đọc x-forwarded-for thủ công', async () => {
  const { readdir, readFile } = await import('node:fs/promises');

  async function quet(thuMuc) {
    const ketQua = [];
    for (const muc of await readdir(thuMuc, { withFileTypes: true })) {
      const duong = new URL(`${muc.name}${muc.isDirectory() ? '/' : ''}`, thuMuc);
      if (muc.isDirectory()) ketQua.push(...await quet(duong));
      else if (muc.name.endsWith('.js')) {
        const nguon = await readFile(duong, 'utf8');
        // Bắt việc ĐỌC header, không bắt phần comment giải thích vì sao không đọc
        // (comment đó là tài sản — nó ngăn người sau vô tình làm lại).
        if (/headers\s*\[\s*['"]x-forwarded-for['"]/i.test(nguon)) ketQua.push(muc.name);
      }
    }
    return ketQua;
  }

  const dinhLoi = await quet(new URL('../src/', import.meta.url));
  assert.deepEqual(
    dinhLoi, [],
    'Bỏ sót một chỗ là còn nguyên đường vòng — mọi nơi phải dùng clientIp(req)'
  );
});
