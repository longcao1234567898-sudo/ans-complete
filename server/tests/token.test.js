/**
 * C2 — JWT_SECRET không được có giá trị mặc định.
 *
 * Bản cũ: `process.env.JWT_SECRET || 'doi-secret-nay-trong-file-env'`.
 * Chuỗi đó nằm công khai trong repo GitHub -> ai đọc mã nguồn cũng tự ký được
 * token admin, rồi gọi /api/admin/submissions/:id/reveal để lấy tên + SĐT +
 * email người tố giác ĐÃ GIẢI MÃ. Thà server không khởi động.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { napLai, TEST_JWT_SECRET } from './helpers-test.js';

const DUONG_DAN = '../src/lib/token.js';

test('JWT_SECRET rỗng -> nạp module là NÉM LỖI', async () => {
  await assert.rejects(
    () => napLai(DUONG_DAN, { JWT_SECRET: '' }),
    /JWT_SECRET/,
    'Không được im lặng rơi về một giá trị mặc định nào cả'
  );
});

test('JWT_SECRET không đặt -> nạp module là NÉM LỖI', async () => {
  await assert.rejects(() => napLai(DUONG_DAN, { JWT_SECRET: undefined }), /JWT_SECRET/);
});

test('JWT_SECRET quá ngắn (10 ký tự) -> NÉM LỖI', async () => {
  await assert.rejects(() => napLai(DUONG_DAN, { JWT_SECRET: '0123456789' }), /32/);
});

test('JWT_SECRET chỉ toàn khoảng trắng -> NÉM LỖI (phải trim trước khi đo)', async () => {
  await assert.rejects(() => napLai(DUONG_DAN, { JWT_SECRET: ' '.repeat(40) }), /JWT_SECRET/);
});

test('KHÔNG còn chuỗi mặc định cũ ở bất kỳ đâu trong module', async () => {
  const { readFile } = await import('node:fs/promises');
  const nguon = await readFile(new URL(DUONG_DAN, import.meta.url), 'utf8');
  assert.ok(
    !nguon.includes('doi-secret-nay-trong-file-env'),
    'Chuỗi secret mặc định cũ phải bị xoá hẳn, không được để lại kể cả trong comment'
  );
});

test('secret hợp lệ -> ký rồi xác minh trả đúng payload', async () => {
  const { signAccessToken, verifyAccessToken, JWT_SECRET } =
    await napLai(DUONG_DAN, { JWT_SECRET: TEST_JWT_SECRET });

  assert.equal(JWT_SECRET, TEST_JWT_SECRET, 'phải export secret để otp.js dùng chung');

  const token = signAccessToken({ id: 7, username: 'canbo', role: 'manager', full_name: 'Trần B' });
  const payload = verifyAccessToken(token);

  assert.equal(payload.sub, 7);
  assert.equal(payload.username, 'canbo');
  assert.equal(payload.role, 'manager');
  assert.equal(payload.name, 'Trần B');
});

test('token ký bằng secret KHÁC -> xác minh thất bại', async () => {
  const a = await napLai(DUONG_DAN, { JWT_SECRET: TEST_JWT_SECRET });
  const b = await napLai(DUONG_DAN, { JWT_SECRET: 'mot-secret-khac-hoan-toan-du-32-ky-tu' });

  const token = a.signAccessToken({ id: 1, username: 'x', role: 'admin', full_name: 'X' });
  assert.throws(() => b.verifyAccessToken(token));
});
