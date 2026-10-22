/**
 * HƯỚNG DẪN TRIỂN KHAI: KHÔNG DÙNG VERCEL (quyết định người vận hành, P79)
 *
 * Giao diện, máy chủ người dân và máy chủ cán bộ cùng chạy trên một máy Viettel.
 * Người cài làm theo đúng thứ tự E1 — một bước "đưa lên Vercel" còn sót là họ lại
 * đặt nơi người dân gõ danh tính lên máy chủ nước ngoài.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const tai = () => readFile(new URL('../../docs/HUONG-DAN-TRIEN-KHAI.md', import.meta.url), 'utf8');
const doan = (s, dau, cuoi) => s.slice(s.indexOf(dau), s.indexOf(cuoi, s.indexOf(dau)));

test('không còn phần hướng dẫn đưa giao diện lên Vercel', async () => {
  const s = await tai();
  assert.doesNotMatch(s, /^## Phần A/m);
  assert.doesNotMatch(s, /vercel\.com\b(?!\/docs)/, 'còn chỉ dẫn mở trang vercel.com');
  assert.doesNotMatch(s, /\(A[4-9](-\d)?\)/, 'còn trỏ tới mục A đã xoá');
});

test('thứ tự làm E1: giao diện và hai máy chủ trên Viettel, không bước nào đưa lên Vercel', async () => {
  const e1 = doan(await tai(), '### E1.', '### E2.');
  for (const dong of e1.split('\n').filter((d) => /^\| \d+ \|/.test(d))) {
    assert.doesNotMatch(dong.split('|')[2], /^\s*\*\*Phần A|đưa giao diện lên Vercel/, dong);
  }
  assert.match(e1, /F2–F5/, 'giao diện dựng trên máy Viettel trước đêm chuyển');
  assert.match(e1, /\*\*Phần G\*\*/, 'sao lưu ngay sau đêm chuyển');
});

test('bức tranh chung: giao diện ở máy Viettel', async () => {
  const s = await tai();
  const bang = doan(s, '| Phần | Giữ gì |', '**Hai điều');
  assert.match(bang, /1\. Giao diện[^\n]*\*\*Máy Viettel\*\* \(Phần F\)/);
  assert.match(bang, /2\. Máy chủ[^\n]*\*\*Cùng máy Viettel\*\* \(Phần B\)/);
});
