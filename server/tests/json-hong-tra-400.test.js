/**
 * JSON HỎNG TRẢ 400, KHÔNG PHẢI 500 (phát hiện phụ A của RETEST BUG-048 lần 3)
 *
 * Lỗi `entity.parse.failed` của bộ đọc thân rơi vào errorHandler chung -> 500 "Lỗi máy chủ":
 * nhật ký và giám sát báo lỗi máy chủ oan, người gửi nhận thông báo sai. Lỗi là của yêu cầu.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { datBienMoiTruongHopLe } from './helpers-test.js';

datBienMoiTruongHopLe();
const nt = await import('../src/nen-tang.js');
const { errorHandler } = await import('../src/middleware/errorHandler.js');

test('thân JSON hỏng tới đường thường và đường gói lớn: 400 kèm lời dễ hiểu', async () => {
  const app = nt.taoApp({ ten: 'thu' });
  nt.ganDocThan(app);
  app.post('/api/submissions', (_req, res) => res.json({ ok: true }));
  app.post('/api/news/x', (_req, res) => res.json({ ok: true }));
  nt.ganDuoi(app, errorHandler);
  const sv = await new Promise((ok) => { const s = app.listen(0, '127.0.0.1', () => ok(s)); });
  try {
    for (const d of ['/api/submissions', '/api/news/x']) {
      const r = await fetch(`http://127.0.0.1:${sv.address().port}${d}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{hong',
      });
      assert.equal(r.status, 400, `${d}: JSON hỏng ra ${r.status}`);
      assert.match((await r.json()).error, /không đúng định dạng/);
    }
  } finally { sv.closeAllConnections(); sv.close(); }
});
