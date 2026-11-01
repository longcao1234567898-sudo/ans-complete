/**
 * TÀI KHOẢN CSDL CỦA ỨNG DỤNG — ÍT QUYỀN NHẤT (ND-082)
 *
 * Trigger "nhật ký chỉ ghi thêm" (v27) chỉ có tác dụng khi tài khoản ứng dụng KHÔNG gỡ
 * được trigger. Dùng root của kho (ALL PRIVILEGES) thì máy chủ bị chiếm là DROP TRIGGER
 * rồi sửa/xoá nhật ký — đúng thứ lớp đó chống. Lúc chạy ứng dụng chỉ cần đọc/ghi/xoá
 * dữ liệu và gọi thủ tục (đã soát mã P99: không có DDL, không GET_LOCK, không GRANT).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const doc = (ten) => readFile(new URL(`../../docs/${ten}`, import.meta.url), 'utf8');
const QUYEN_DU = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'EXECUTE'];

test('hướng dẫn có lệnh tạo tài khoản ứng dụng chỉ với quyền đủ dùng', async () => {
  const s = await doc('HUONG-DAN-TRIEN-KHAI.md');
  const m = s.match(/GRANT\s+([A-Z, _]+?)\s+ON\s+hop_thu_an_ninh_so\.\*\s+TO\s+'hop_thu_ung_dung'/);
  assert.ok(m, "thiếu lệnh GRANT ... ON hop_thu_an_ninh_so.* TO 'hop_thu_ung_dung'");
  const quyen = m[1].split(',').map((q) => q.trim()).sort();
  assert.deepEqual(quyen, [...QUYEN_DU].sort(), `quyền phải đúng ${QUYEN_DU.join(', ')}`);
});

test('mẫu .env ở B7 và sổ tay chặng 8 không cho ứng dụng dùng root', async () => {
  const s = await doc('HUONG-DAN-TRIEN-KHAI.md');
  const b7 = s.slice(s.indexOf('### B7.'), s.indexOf('### B8.'));
  for (const k of b7.matchAll(/```ini\n([\s\S]*?)```/g)) {
    assert.doesNotMatch(k[1], /^DB_USER=root\b/m, 'B7: DB_USER không được là root');
  }
  const t = await doc('SO-TAY-TRIEN-KHAI.md');
  const c8 = t.slice(t.indexOf('## Chặng 8'), t.indexOf('## Chặng 9'));
  assert.doesNotMatch(c8, /\|\s*`DB_USER`\s*\|\s*`root`/, 'chặng 8: DB_USER không được là root');
  assert.match(c8, /hop_thu_ung_dung/, 'chặng 8 phải ghi DB_USER = hop_thu_ung_dung');
});
