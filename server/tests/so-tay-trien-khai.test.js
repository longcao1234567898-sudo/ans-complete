/**
 * SỔ TAY TRIỂN KHAI (P81) — mọi chỗ trỏ sang tài liệu kỹ thuật phải có thật
 *
 * Sổ tay cho người không biết lập trình không chép lại khối lệnh dài, mà chỉ "mở tài liệu
 * kỹ thuật, mục B8 chép khối này". Ai đổi tên/xoá mục ở HUONG-DAN-TRIEN-KHAI.md mà quên
 * sổ tay thì người cài đứng giữa chừng không biết chép gì — test này bắt chỗ lệch đó.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const doc = (p) => readFile(new URL(`../../docs/${p}`, import.meta.url), 'utf8');

test('mọi mục kỹ thuật sổ tay nhắc tới (B3, C3, F7, G6…) đều có trong tài liệu kỹ thuật', async () => {
  const soTay = await doc('SO-TAY-TRIEN-KHAI.md');
  const kyThuat = await doc('HUONG-DAN-TRIEN-KHAI.md');
  const muc = new Set([...soTay.matchAll(/\b([BCDEFG])(\d{1,2})\b/g)].map((m) => m[1] + m[2]));
  assert.ok(muc.size >= 15, `sổ tay chỉ nhắc ${muc.size} mục — có vẻ đã bị cắt`);
  const thieu = [...muc].filter((m) => !kyThuat.includes(`### ${m}.`));
  assert.deepEqual(thieu, [], `sổ tay trỏ tới mục không còn trong tài liệu kỹ thuật: ${thieu.join(', ')}`);
  for (const phan of ['Phần D', 'Phần F', 'Phần G']) {
    if (soTay.includes(phan)) assert.ok(kyThuat.includes(`## ${phan} —`), `thiếu ${phan}`);
  }
  if (soTay.includes('VIỆC CHỜ')) assert.ok(kyThuat.includes('## Phụ lục — VIỆC CHỜ'));
});

test('sổ tay giữ các quy tắc an toàn: không gửi khoá, không mở cổng nội bộ, chép ba khoá ra giấy', async () => {
  const s = await doc('SO-TAY-TRIEN-KHAI.md');
  assert.match(s, /\*\*Không bao giờ\*\* gửi cho ai/);
  assert.match(s, /Không mở 4000, 4001, 3306/);
  assert.match(s, /ENCRYPTION_KEY.*sai một ký tự.*mất vĩnh viễn/);
  assert.match(s, /Private Access/);
});
