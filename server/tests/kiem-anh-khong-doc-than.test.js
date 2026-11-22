/**
 * ĐƯỜNG KIỂM ẢNH KHÔNG BỊ GIỚI HẠN 1 MB (hồi quy do bản vá BUG-048, RETEST độc lập phát hiện)
 *
 * Giao diện gửi { dataUrl } của ảnh (không phải ảnh tố giác) tới POST /api/ai/moderate-image; máy
 * chủ luôn trả blocked:false và giao diện lấy kết quả đó GHI ĐÈ phép đo màu da ở trình duyệt. BUG-048
 * hạ mọi đường khác hai đường nhận tệp xuống 1 MB: ảnh có data URL > 1 MB nhận 413, giao diện rơi
 * xuống phép đo màu da và có thể CHẶN OAN ảnh chân dung cận cảnh. Đường này không đọc thân — không
 * cần đọc gì, kể cả 1 MB.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { datBienMoiTruongHopLe } from './helpers-test.js';

datBienMoiTruongHopLe();
const nt = await import('../src/nen-tang.js');
const { default: aiRouter } = await import('../src/routes/ai.js');

test('POST /api/ai/moderate-image với data URL ~1,5 MB: vẫn trả blocked:false, không 413', async () => {
  const app = nt.taoApp({ ten: 'thu' });
  nt.ganDocThan(app);
  app.use('/api/ai', aiRouter);
  const sv = await new Promise((ok) => { const s = app.listen(0, '127.0.0.1', () => ok(s)); });
  try {
    const dataUrl = 'data:image/jpeg;base64,' + 'A'.repeat(1.5 * 1024 * 1024);
    const r = await fetch(`http://127.0.0.1:${sv.address().port}/api/ai/moderate-image`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dataUrl }),
    });
    assert.equal(r.status, 200, `đường kiểm ảnh trả ${r.status} — giao diện sẽ rơi xuống đo màu da`);
    assert.equal((await r.json()).blocked, false);
  } finally { sv.closeAllConnections(); sv.close(); }
});

test('đường khác vẫn giữ giới hạn 1 MB (đối chứng: chỉ đúng đường kiểm ảnh được miễn đọc)', async () => {
  const app = nt.taoApp({ ten: 'thu' });
  nt.ganDocThan(app);
  app.use('/api/ai', aiRouter);
  const sv = await new Promise((ok) => { const s = app.listen(0, '127.0.0.1', () => ok(s)); });
  try {
    const r = await fetch(`http://127.0.0.1:${sv.address().port}/api/ai/analyze`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'a'.repeat(1.5 * 1024 * 1024) }),
    });
    assert.equal(r.status, 413);
  } finally { sv.closeAllConnections(); sv.close(); }
});
