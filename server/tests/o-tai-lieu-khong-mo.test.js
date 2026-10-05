/**
 * Ô TÀI LIỆU PDF / WORD Ở TRANG HỒ SƠ: KHÔNG ẢNH VỠ, KHÔNG MỞ TRÊN TRÌNH DUYỆT (P52)
 * ============================================================================
 *
 * Phát hiện khi làm OCR P52: KhuTepDinhKem vẽ MỌI tệp bằng thẻ ảnh, nên tài liệu
 * PDF/Word (lưu chung bảng với ảnh) hiện thành ô ảnh vỡ — cán bộ tưởng tệp hỏng.
 * Bấm vào lại có nút "Mở ở tab mới" — tức mở tài liệu ngay trong phiên đăng nhập
 * xem được danh tính, đúng điều lib/tai-lieu-an-toan.js dặn không bao giờ làm.
 * Sửa: ô tài liệu riêng, khung mở to chỉ giải thích và cho TẢI VỀ.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const goc = (p) => new URL(`../../${p}`, import.meta.url);

test('ô tài liệu: không vẽ bằng thẻ ảnh, không "Mở ở tab mới", chỉ tải về', async () => {
  const ma = await readFile(goc('src/components/admin/KhuTepDinhKem.tsx'), 'utf8');
  assert.match(ma, /export function laTaiLieu/);
  /* Ô nhỏ: nhánh tài liệu đứng TRƯỚC nhánh ảnh */
  assert.match(ma, /\{taiLieu \? \([\s\S]*?<FileText[\s\S]*?\) : video \?/);
  /* Khung mở to: tài liệu không có thẻ ảnh/video, nút mở tab mới bị chặn bằng !laTaiLieu */
  assert.match(ma, /\{laTaiLieu\(dangMo\.t\) \? \([\s\S]*?\) : laVideo\(dangMo\.t\) \?/);
  assert.match(ma, /\{!laTaiLieu\(dangMo\.t\) && \(\s*<a[\s\S]*?Mở ở tab mới/);
});
