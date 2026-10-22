/**
 * PHẦN G CỦA HƯỚNG DẪN TRIỂN KHAI — sao lưu mã hoá sang nhà cung cấp khác (P78)
 *
 * Người cài chép NGUYÊN khối lệnh trong tài liệu. Những điều dưới đây đã chạy thử
 * thật (MySQL 8.0, 2026-10-20) và phải còn nguyên mỗi khi ai sửa tài liệu:
 *   · Chữ trần không chạm đĩa: dump -> nén -> mã hoá -> tải lên trong MỘT đường ống,
 *     có pipefail để hỏng ở khâu nào cũng biết.
 *   · Tải lên dưới tên tạm, chỉ đổi tên khi thành công — đã thử sai mật khẩu: không
 *     để lại tệp cụt trông như bản sao lưu.
 *   · Tài khoản sao lưu PHẢI có SHOW_ROUTINE — thiếu thì mysqldump lặng lẽ bỏ hết
 *     thủ tục mà vẫn báo thành công (đã gặp: 4 thủ tục -> 0).
 *   · Diễn tập khôi phục so cả số thủ tục, không chỉ số bảng.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

async function phanG() {
  const s = await readFile(new URL('../../docs/HUONG-DAN-TRIEN-KHAI.md', import.meta.url), 'utf8');
  const dau = s.indexOf('## Phần G');
  assert.ok(dau > 0, 'thiếu Phần G');
  return s.slice(dau, s.indexOf('## Phụ lục', dau));
}

async function tepLenh() {
  const g = await phanG();
  const m = g.match(/```bash\n(#!\/bin\/bash[\s\S]*?)```/);
  assert.ok(m, 'G3 phải có tệp lệnh bắt đầu bằng #!/bin/bash');
  return m[1];
}

test('tệp lệnh sao lưu đúng cú pháp bash', async () => {
  const tep = join(await mkdtemp(join(tmpdir(), 'sao-luu-')), 'sl.sh');
  await writeFile(tep, await tepLenh());
  execFileSync('bash', ['-n', tep]);
});

test('một đường ống dump -> nén -> mã hoá -> tải lên, có pipefail, không tệp trung gian', async () => {
  const s = await tepLenh();
  assert.match(s, /set -euo pipefail/);
  assert.match(s, /mysqldump[\s\S]*?\|\s*gzip[^|]*\|\s*age -r "\$AGE_RECIPIENT"\s*\|\s*rclone rcat/);
  assert.doesNotMatch(s, /mysqldump[^|]*>\s*\S/, 'không ghi bản sao chữ trần ra tệp');
  assert.match(s, /--defaults-extra-file=/, 'mật khẩu CSDL nằm trong tệp, không trên dòng lệnh');
  assert.doesNotMatch(s, /\s-p\S|--password=/);
});

test('tải lên dưới tên tạm, hỏng thì xoá, chỉ đổi tên khi thành công', async () => {
  const s = await tepLenh();
  assert.match(s, /rclone rcat "\$RCLONE_DICH\/\$TEN\.dang-tai"/);
  assert.match(s, /rclone deletefile "\$RCLONE_DICH\/\$TEN\.dang-tai"/);
  assert.match(s, /rclone moveto "\$RCLONE_DICH\/\$TEN\.dang-tai" "\$RCLONE_DICH\/\$TEN"/);
  assert.match(s, /--include "hop-thu-\*\.sql\.gz\.age"/, 'chỉ xoá bản sao cũ, không đụng tệp khác trong kho');
});

test('tài khoản sao lưu chỉ đọc, có SHOW_ROUTINE; diễn tập khôi phục so cả thủ tục', async () => {
  const g = await phanG();
  const grant = g.match(/GRANT SELECT[^;]*;/);
  assert.ok(grant);
  assert.doesNotMatch(grant[0], /INSERT|UPDATE|DELETE|ALL PRIVILEGES/);
  assert.match(g, /GRANT SHOW_ROUTINE ON \*\.\*/);
  assert.match(g, /information_schema\.routines/);
  assert.match(g, /information_schema\.triggers/);
});

test('bộ hẹn giờ ghi rõ múi giờ Việt Nam — máy để UTC thì "2:30" thành 9:30 sáng giờ làm việc', async () => {
  const g = await phanG();
  assert.match(g, /OnCalendar=\*-\*-\* 02:30:00 Asia\/Ho_Chi_Minh/);
  assert.match(g, /Persistent=true/, 'máy tắt đúng giờ hẹn thì phải chạy bù');
});
