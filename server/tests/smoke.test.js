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

test('lib/ai.js export ĐỦ những gì routes/ai.js import', async () => {
  const ai = await import('../src/lib/ai.js');
  for (const ten of ['aiAvailable', 'geminiChat', 'geminiAnalyze', 'geminiModerateImage']) {
    assert.equal(typeof ai[ten], 'function', `lib/ai.js phải export hàm ${ten}`);
  }
});

test('nạp được src/index.js mà KHÔNG mở cổng, KHÔNG cần MySQL', async () => {
  // NODE_ENV=test -> index.js không gọi start(), nên test chạy được trên máy
  // không có MySQL. Nếu ai đó bỏ điều kiện đó đi, test này sẽ treo/đỏ.
  const mod = await import('../src/index.js');
  assert.ok(mod.default, 'index.js phải export app để test nạp được');
});
