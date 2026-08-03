/**
 * C4 — Băm định danh phải CÓ PEPPER.
 *
 * Bản cũ: `hashPhone` = SHA-256 trần. Miền giá trị SĐT di động Việt Nam chỉ
 * khoảng 10^8 -> dựng bảng tra ngược TOÀN BỘ số điện thoại Việt Nam mất vài
 * phút trên laptop. Nghĩa là cột `sender_phone_hash` đã PHÁ VỠ HOÀN TOÀN lớp
 * AES-256-GCM của cột `sender_phone` nằm ngay bên cạnh: lộ database là biết
 * ngay số điện thoại người tố giác, khỏi cần khoá mã hoá.
 *
 * Pepper nằm ở biến môi trường, KHÔNG nằm trong database -> lộ database vẫn
 * không dò ngược được.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { napLai, TEST_PEPPER, TEST_ENCRYPTION_KEY } from './helpers-test.js';

const DUONG_DAN = '../src/lib/crypto.js';
const MOI_TRUONG = { HASH_PEPPER: TEST_PEPPER, ENCRYPTION_KEY: TEST_ENCRYPTION_KEY };

test('HASH_PEPPER không đặt -> ném lỗi khi băm', async () => {
  const m = await napLai(DUONG_DAN, { ...MOI_TRUONG, HASH_PEPPER: undefined });
  assert.throws(() => m.hashIdentifier('0901234567'), /HASH_PEPPER/);
});

test('HASH_PEPPER rỗng -> ném lỗi', async () => {
  const m = await napLai(DUONG_DAN, { ...MOI_TRUONG, HASH_PEPPER: '' });
  assert.throws(() => m.hashIdentifier('0901234567'), /HASH_PEPPER/);
});

test('HASH_PEPPER dưới 32 ký tự -> ném lỗi', async () => {
  const m = await napLai(DUONG_DAN, { ...MOI_TRUONG, HASH_PEPPER: 'qua-ngan' });
  assert.throws(() => m.hashIdentifier('0901234567'), /32/);
});

test('cùng đầu vào + cùng pepper -> cùng kết quả (đối chiếu được)', async () => {
  const m = await napLai(DUONG_DAN, MOI_TRUONG);
  assert.equal(m.hashIdentifier('0901234567'), m.hashIdentifier('0901234567'));
});

test('ĐỔI PEPPER -> ra kết quả KHÁC (chứng minh pepper thực sự tham gia)', async () => {
  const a = await napLai(DUONG_DAN, MOI_TRUONG);
  // Băm NGAY để module a đọc và nhớ pepper thứ nhất, TRƯỚC khi đổi biến môi
  // trường — getPepper() đọc lười nên gọi sau là đọc nhầm pepper thứ hai.
  const bamA = a.hashIdentifier('0901234567');

  const b = await napLai(DUONG_DAN, { ...MOI_TRUONG, HASH_PEPPER: 'pepper-hoan-toan-khac-du-32-ky-tu-abc' });
  const bamB = b.hashIdentifier('0901234567');

  assert.notEqual(
    bamA, bamB,
    'Kết quả không đổi khi đổi pepper -> pepper KHÔNG được dùng, vẫn là băm trần!'
  );
});

test('KHÁC hẳn SHA-256 trần của cùng chuỗi', async () => {
  const crypto = await import('node:crypto');
  const m = await napLai(DUONG_DAN, MOI_TRUONG);

  const tran = crypto.createHash('sha256').update('0901234567').digest('hex');
  assert.notEqual(m.hashIdentifier('0901234567'), tran);
});

test('hashPhone dùng lại hashIdentifier (một đường băm duy nhất)', async () => {
  const m = await napLai(DUONG_DAN, MOI_TRUONG);
  assert.equal(m.hashPhone('0901234567'), m.hashIdentifier('0901234567'));
});

test('đầu vào khác nhau -> kết quả khác nhau', async () => {
  const m = await napLai(DUONG_DAN, MOI_TRUONG);
  assert.notEqual(m.hashIdentifier('0901234567'), m.hashIdentifier('0901234568'));
});

test('null / undefined không ném lỗi', async () => {
  const m = await napLai(DUONG_DAN, MOI_TRUONG);
  assert.doesNotThrow(() => m.hashIdentifier(null));
  assert.doesNotThrow(() => m.hashIdentifier(undefined));
});

test('64 ký tự hexa -> vừa khít cột CHAR(64), không cần migration', async () => {
  const m = await napLai(DUONG_DAN, MOI_TRUONG);
  assert.match(m.hashIdentifier('0901234567'), /^[0-9a-f]{64}$/);
});

test('cắt 32 ký tự để lọt cột ip_address VARCHAR(45)', async () => {
  const m = await napLai(DUONG_DAN, MOI_TRUONG);
  const ipHash = m.hashIdentifier('203.0.113.9').slice(0, 32);

  assert.equal(ipHash.length, 32);
  assert.ok(ipHash.length <= 45, 'Phải lọt VARCHAR(45) để không phải ALTER TABLE');
  // 32 ký tự hex = 128 bit, xác suất trùng không đáng kể
  assert.match(ipHash, /^[0-9a-f]{32}$/);
});

test('IP khác nhau -> ipHash 32 ký tự vẫn khác nhau', async () => {
  const m = await napLai(DUONG_DAN, MOI_TRUONG);
  assert.notEqual(
    m.hashIdentifier('203.0.113.9').slice(0, 32),
    m.hashIdentifier('203.0.113.10').slice(0, 32)
  );
});
