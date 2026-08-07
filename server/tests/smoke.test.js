/**
 * B1 — Nạp được toàn bộ router mà không ném lỗi.
 *
 * Đây là test rẻ nhất trong cả bộ và chặn được đúng loại lỗi đã làm chết backend
 * trên bản chạy thật: `routes/ai.js` import `geminiAnalyze` / `geminiModerateImage`
 * từ `lib/ai.js` trong khi file đó không hề export hai thứ này. ESM kiểm tra
 * liên kết TRƯỚC khi chạy -> SyntaxError, process chết ngay lúc khởi động, không
 * một dòng log nghiệp vụ nào kịp in ra.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { datBienMoiTruongHopLe } from './helpers-test.js';

datBienMoiTruongHopLe();

const CAC_ROUTER = [
  '../src/routes/ai.js',
  '../src/routes/auth.js',
  '../src/routes/tracking.js',
  '../src/routes/news.js',
  '../src/routes/otp.js',
  '../src/routes/submissions.js',
  '../src/routes/admin/index.js',
];

for (const duongDan of CAC_ROUTER) {
  test(`nạp được ${duongDan} mà không ném lỗi`, async () => {
    const mod = await import(duongDan);
    assert.ok(mod.default, `${duongDan} phải export default một Router`);
  });
}

/* ĐỌC danh sách import thẳng từ mã nguồn, KHÔNG liệt kê cứng.
   Bản cũ liệt kê cứng ['aiAvailable','geminiChat','geminiAnalyze','geminiModerateImage'].
   Khi phân loại chuyển sang chạy nội bộ bằng lib/phan-loai.js, hai hàm gemini*
   kia bị bỏ đi ĐÚNG CHỦ Ý — nhưng test vẫn đòi nên báo đỏ, khiến người đọc
   tưởng có hồi quy. Đọc từ nguồn thì test luôn kiểm đúng thứ đang được import. */
test('lib/ai.js export ĐỦ những gì routes/ai.js import', async () => {
  const { readFileSync } = await import('node:fs');
  const nguon = readFileSync(new URL('../src/routes/ai.js', import.meta.url), 'utf8');
  const khop = nguon.match(/import\s*\{([^}]+)\}\s*from\s*['"]\.\.\/lib\/ai\.js['"]/);
  assert.ok(khop, 'routes/ai.js phải import từ ../lib/ai.js');

  const canCo = khop[1].split(',').map((s) => s.trim().split(/\s+as\s+/)[0]).filter(Boolean);
  assert.ok(canCo.length > 0, 'phải import ít nhất một thứ');

  const ai = await import('../src/lib/ai.js');
  for (const ten of canCo) {
    assert.equal(typeof ai[ten], 'function', `lib/ai.js phải export hàm ${ten}`);
  }
});

test('nạp được src/index.js mà KHÔNG mở cổng, KHÔNG cần MySQL', async () => {
  // NODE_ENV=test -> index.js không gọi start(), nên test chạy được trên máy
  // không có MySQL. Nếu ai đó bỏ điều kiện đó đi, test này sẽ treo/đỏ.
  const mod = await import('../src/index.js');
  assert.ok(mod.default, 'index.js phải export app để test nạp được');
});
