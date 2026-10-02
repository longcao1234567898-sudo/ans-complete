/**
 * TỆP SQL PHẢI TỰ ĐẶT MÃ HOÁ CHỮ — ND-043
 * ============================================================================
 *
 * README cài CSDL bằng `mysql ... < database/<tệp>.sql`. Công cụ `mysql` đọc
 * tệp theo bộ mã của MÁY CÀI chứ không theo tệp: máy chủ Linux tối giản
 * (locale POSIX) mặc định latin1, nên mọi chữ có dấu bị mã hoá hai lần — "Ấp"
 * thành "áº¤p" trên giao diện. Thí điểm P48 gặp thật, phải cài lại từ đầu.
 *
 * Không thể bắt người cài nhớ thêm cờ `--default-character-set=utf8mb4` cho
 * mỗi lệnh, nên mỗi tệp tự mở đầu bằng `SET NAMES utf8mb4;`: chạy bằng công
 * cụ nào, trên máy nào cũng đọc đúng. Test này canh mọi tệp, kể cả tệp thêm
 * về sau — tệp dữ liệu tin tức, địa bàn cũng có chữ có dấu.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';

const THU_MUC = new URL('../../database/', import.meta.url);

/** Câu lệnh đầu tiên của tệp, sau khi bỏ chú thích `--`, `#` và khối. */
function cauLenhDau(sql) {
  const khongChuThich = sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((d) => d.replace(/^\s*(--|#).*$/, ''))
    .join('\n');
  return khongChuThich.trim().split(';')[0].trim();
}

describe('Tệp SQL tự đặt mã hoá chữ utf8mb4 (ND-043)', async () => {
  const tep = (await readdir(THU_MUC)).filter((t) => t.endsWith('.sql')).sort();

  test('có tệp để kiểm (đường dẫn thư mục đúng)', () => {
    assert.ok(tep.includes('TRON_BO_DATABASE_V5.sql'), 'không thấy database/TRON_BO_DATABASE_V5.sql');
    assert.ok(tep.length > 20);
  });

  for (const ten of tep) {
    test(`${ten}: câu lệnh đầu là SET NAMES utf8mb4`, async () => {
      const sql = await readFile(new URL(ten, THU_MUC), 'utf8');
      assert.match(cauLenhDau(sql), /^SET\s+NAMES\s+utf8mb4\b/i,
        `${ten} phải mở đầu bằng "SET NAMES utf8mb4;" — thiếu thì máy cài mặc định latin1 làm vỡ chữ có dấu`);
    });
  }
});
