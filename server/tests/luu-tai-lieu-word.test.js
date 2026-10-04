/**
 * TỆP WORD (.docx) NGƯỜI DÂN GỬI KÈM KHÔNG ĐƯỢC MẤT KHI LƯU (P52, nang_cap_v32.sql)
 * ============================================================================
 *
 * Phát hiện khi thử OCR P52 trên MySQL thật: cột submission_images.mime_type là
 * VARCHAR(50), mà kiểu tệp Word
 *   application/vnd.openxmlformats-officedocument.wordprocessingml.document
 * dài 71 ký tự. MySQL chế độ chặt (mặc định MySQL 8, MariaDB) từ chối cả dòng
 * ("Data too long"); routes/submissions.js bắt lỗi rồi bỏ qua để không chặn ý
 * kiến — nên tệp Word, và mọi tài liệu xếp SAU nó trong cùng tin, không được lưu,
 * người dân vẫn thấy "gửi thành công". Mất bằng chứng âm thầm.
 *
 * Đỏ trước khi sửa: cột 50 ký tự, không có tệp nâng cấp nới cột.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const doc = (p) => readFile(new URL(`../../${p}`, import.meta.url), 'utf8');

/** Mọi kiểu tệp (mime) mà máy chủ nhận làm tệp đính kèm */
async function cacMime() {
  const tl = await doc('server/src/lib/tai-lieu-an-toan.js');
  const anh = await doc('server/src/lib/anh-an-toan.js');
  return [...`${tl}\n${anh}`.matchAll(/mime:\s*'([^']+)'/g)].map((m) => m[1]);
}

test('kiểu tệp dài nhất máy chủ nhận vẫn vừa cột mime_type của tệp nâng cấp mới nhất', async () => {
  const mime = await cacMime();
  assert.ok(mime.includes('application/vnd.openxmlformats-officedocument.wordprocessingml.document'));
  const dai = Math.max(...mime.map((m) => m.length));
  const sql = await doc('database/nang_cap_v32.sql');
  const m = sql.match(/MODIFY\s+(?:COLUMN\s+)?mime_type\s+VARCHAR\((\d+)\)/i);
  assert.ok(m, 'nang_cap_v32.sql phải nới cột mime_type');
  assert.ok(Number(m[1]) >= dai, `cột ${m[1]} ký tự < kiểu tệp dài ${dai} ký tự`);
  assert.match(sql, /^SET NAMES utf8mb4;/);
  assert.doesNotMatch(sql, /^\s*(USE|DROP)\b/im);
});

test('tệp cài mới cũng tạo cột đủ dài (không phải đợi chạy nâng cấp)', async () => {
  const dai = Math.max(...(await cacMime()).map((m) => m.length));
  for (const tep of ['database/TRON_BO_DATABASE_V5.sql', 'database/hop_thu_an_ninh_so.sql']) {
    const m = (await doc(tep)).match(/CREATE TABLE[^;]*submission_images[\s\S]*?mime_type\s+VARCHAR\((\d+)\)/i);
    assert.ok(m, `${tep}: không thấy cột mime_type`);
    assert.ok(Number(m[1]) >= dai, `${tep}: mime_type VARCHAR(${m[1]}) ngắn hơn ${dai}`);
  }
});
