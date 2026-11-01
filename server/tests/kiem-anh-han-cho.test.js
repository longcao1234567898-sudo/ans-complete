/**
 * KIỂM ẢNH NHẠY CẢM QUA MÁY CHỦ CÓ HẠN CHỜ (ND-081)
 *
 * Máy chủ có AI mà mạng "treo" (có wifi không ra internet) thì lời gọi moderate-image
 * chờ mãi -> bước đính ảnh kẹt (cùng gốc lỗi "kẹt ở Phân tích" đã vá ở ee07644). Hết hạn
 * thì rơi xuống kiểm trên máy như khi máy chủ lỗi — không chặn người dân.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const SRC = new URL('../../src/', import.meta.url);
const boChuThich = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('kiểm ảnh nhạy cảm qua máy chủ có hạn chờ và bỏ qua khi mất mạng (ND-081)', async () => {
  const s = boChuThich(await readFile(new URL('services/moderationService.ts', SRC), 'utf8'));
  const goi = s.slice(s.indexOf("'/api/ai/moderate-image'") - 200, s.indexOf("'/api/ai/moderate-image'") + 300);
  assert.match(goi, /signal:\s*hanCho\(/, 'lời gọi moderate-image phải có signal: hanCho(...)');
  assert.match(s, /dangMatMang\(\)/, 'mất mạng thì không gọi máy chủ');
});
