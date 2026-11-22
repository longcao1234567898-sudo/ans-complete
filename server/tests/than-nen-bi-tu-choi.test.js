/**
 * THÂN YÊU CẦU NÉN BỊ TỪ CHỐI TRƯỚC KHI ĐỌC (BUG-048 lần 3)
 *
 * RETEST độc lập lần 2 kết luận BUG-048 "chưa fix triệt để": lớp giới hạn gói lớn đo "lớn" bằng
 * Content-Length — số byte TRÊN ĐƯỜNG TRUYỀN. Gửi 30 MB JSON nén gzip thì đường truyền chỉ ~30 KB:
 * coi là gói nhỏ, bỏ qua giới hạn số gói đang đọc lẫn bước kiểm vé đường bổ sung; bộ đọc giải nén
 * trọn 32 MB vào bộ nhớ rồi mới JSON.parse. 30 lượt từ một IP: 2871 MB; 100 lượt: 6604 MB — kẻ tấn
 * công tốn ~3 MB băng thông. deflate, viết hoa GZIP như nhau; 'br' thì lỗi 500.
 *
 * Giao diện không bao giờ nén thân yêu cầu (không có Content-Encoding / CompressionStream trong
 * src/). Allow-list (luật 5): chỉ nhận thân không nén.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { datBienMoiTruongHopLe } from './helpers-test.js';

datBienMoiTruongHopLe();
const nt = await import('../src/nen-tang.js');

async function dung() {
  const app = nt.taoApp({ ten: 'thu' });
  nt.ganDocThan(app);
  const tra = (req, res) => res.json({ ok: true, x: typeof req.body?.x });
  for (const d of ['/api/submissions', '/api/chat/bo-sung', '/api/news/x']) app.post(d, tra);
  return new Promise((ok) => { const s = app.listen(0, '127.0.0.1', () => ok(s)); });
}

const THAN = JSON.stringify({ x: 'a'.repeat(2 * 1024 * 1024) });

test('thân nén (gzip, deflate, br, viết hoa) tới mọi đường: 415, không giải nén, không vào route', async () => {
  const sv = await dung();
  const goc = `http://127.0.0.1:${sv.address().port}`;
  try {
    const nen = {
      gzip: zlib.gzipSync(THAN), GZIP: zlib.gzipSync(THAN), deflate: zlib.deflateSync(THAN),
      br: zlib.brotliCompressSync(THAN), 'gzip, identity': zlib.gzipSync(THAN),
    };
    for (const d of ['/api/submissions', '/api/chat/bo-sung', '/api/news/x']) {
      for (const [ma, than] of Object.entries(nen)) {
        const r = await fetch(goc + d, {
          method: 'POST', body: than,
          headers: { 'Content-Type': 'application/json', 'Content-Encoding': ma, 'X-Forwarded-For': '198.51.100.70' },
        });
        assert.equal(r.status, 415, `${d} với Content-Encoding: ${ma} -> ${r.status} (máy chủ đã giải nén?)`);
      }
    }
  } finally { sv.closeAllConnections(); sv.close(); }
});

test('đối chứng: thân không nén (không khai, hoặc khai identity) vẫn nhận như cũ', async () => {
  const sv = await dung();
  const goc = `http://127.0.0.1:${sv.address().port}`;
  try {
    for (const header of [{}, { 'Content-Encoding': 'identity' }]) {
      const r = await fetch(goc + '/api/submissions', {
        method: 'POST', body: THAN,
        headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '198.51.100.71', ...header },
      });
      assert.equal(r.status, 200, JSON.stringify(header));
      assert.equal((await r.json()).x, 'string');
    }
  } finally { sv.closeAllConnections(); sv.close(); }
});
