/**
 * GÓI LỚN: GIỚI HẠN SỐ ĐANG ĐỌC CÙNG LÚC, KIỂM VÉ TRƯỚC KHI ĐỌC (BUG-048 lần 2)
 *
 * RETEST độc lập kết luận BUG-048 "chưa fix triệt để": thứ tự đã đúng, nhưng hai đường còn được
 * 32 MB (POST /api/submissions, POST /api/chat/bo-sung) không cần đăng nhập — 30 yêu cầu song song
 * × 30 MB từ MỘT IP đẩy bộ nhớ tiến trình 92 -> 2825 MB. Giới hạn lượt đếm lượt, không đếm yêu cầu
 * đang chạy. /api/chat/bo-sung kiểm vé ở header nhưng chỉ SAU khi đọc trọn thân.
 *
 * Test giữ các lượt tải lên DỞ DANG (gửi một phần thân rồi treo) để có đúng tình huống "nhiều gói
 * lớn đang đọc cùng lúc", rồi xem lượt tiếp theo được trả lời NGAY hay phải chờ đọc.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import jwt from 'jsonwebtoken';
import { datBienMoiTruongHopLe } from './helpers-test.js';

datBienMoiTruongHopLe();
const nt = await import('../src/nen-tang.js');

const MB2 = 2 * 1024 * 1024;

async function dungApp() {
  const app = nt.taoApp({ ten: 'thu' });
  nt.ganDocThan(app);
  const tra = (req, res) => res.json({ ok: true, co: !!req.body });
  app.post('/api/submissions', tra);
  app.post('/api/chat/bo-sung', tra);
  const sv = await new Promise((ok) => { const s = app.listen(0, '127.0.0.1', () => ok(s)); });
  return sv;
}

/** Mở một lượt POST, gửi `gui` byte đầu của thân khai dài `dai`, CHƯA kết thúc. */
function moLuot(port, duong, { ip, dai = MB2, gui = 1024, header = {} }) {
  const req = http.request({
    host: '127.0.0.1', port, path: duong, method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': dai, 'X-Forwarded-For': ip, ...header },
  });
  const traLoi = new Promise((ok) => {
    req.on('response', (res) => { let t = ''; res.on('data', (c) => { t += c; }); res.on('end', () => ok({ status: res.statusCode, than: t })); });
    req.on('error', () => ok({ status: 'loi' }));
  });
  const than = Buffer.from('{"x":"' + 'a'.repeat(dai - 8) + '"}');
  req.write(than.subarray(0, gui));
  return {
    traLoi,
    xong: () => { req.end(than.subarray(gui)); return traLoi; },
    huy: () => req.destroy(),
  };
}
/** Trả lời trong `ms` mili giây hay không */
const trongVong = (p, ms) => Promise.race([p, new Promise((ok) => setTimeout(() => ok(null), ms))]);
const cho = (ms) => new Promise((ok) => setTimeout(ok, ms));

test('một mạng: tối đa 2 gói lớn đang đọc cùng lúc — lượt thứ 3 nhận 503 NGAY, không bị đọc', async () => {
  const sv = await dungApp();
  const port = sv.address().port;
  try {
    const a = moLuot(port, '/api/submissions', { ip: '198.51.100.1' });
    const b = moLuot(port, '/api/submissions', { ip: '198.51.100.1' });
    await cho(100);
    const c = moLuot(port, '/api/submissions', { ip: '198.51.100.1' });
    const r = await trongVong(c.traLoi, 1500);
    assert.ok(r, 'lượt thứ 3 cùng mạng không được trả lời ngay — máy chủ đang chờ đọc trọn gói');
    assert.equal(r.status, 503);
    assert.match(JSON.parse(r.than).error, /gửi lại/);
    c.huy();
    /* Hai lượt đầu vẫn chạy bình thường */
    assert.equal((await a.xong()).status, 200);
    assert.equal((await b.xong()).status, 200);
    /* Đọc xong thì trả chỗ: lượt mới cùng mạng lại vào được */
    const d = moLuot(port, '/api/submissions', { ip: '198.51.100.1' });
    assert.equal((await d.xong()).status, 200);
  } finally { sv.closeAllConnections(); sv.close(); }
});

test('cả máy chủ: tối đa 6 gói lớn đang đọc — mạng thứ 7 nhận 503; lượt bị huỷ giữa chừng cũng trả chỗ', async () => {
  const sv = await dungApp();
  const port = sv.address().port;
  try {
    const dang = Array.from({ length: 6 }, (_, i) => moLuot(port, '/api/submissions', { ip: `198.51.100.${10 + i}` }));
    await cho(150);
    const thu7 = moLuot(port, '/api/submissions', { ip: '198.51.100.30' });
    const r = await trongVong(thu7.traLoi, 1500);
    assert.ok(r && r.status === 503, `mạng thứ 7 phải nhận 503 ngay, đang ${r?.status ?? 'chờ đọc'}`);
    thu7.huy();
    /* Ý kiến chỉ có chữ (gói nhỏ) KHÔNG bị chặn khi đang đầy gói lớn */
    const nho = moLuot(port, '/api/submissions', { ip: '198.51.100.31', dai: 2000, gui: 10 });
    assert.equal((await nho.xong()).status, 200, 'gói nhỏ bị chặn lây');
    /* Huỷ hết sáu lượt treo -> trả chỗ -> lượt lớn mới vào được */
    for (const l of dang) l.huy();
    await cho(150);
    const moi = moLuot(port, '/api/submissions', { ip: '198.51.100.32' });
    assert.equal((await moi.xong()).status, 200, 'lượt bị huỷ không trả chỗ — sau vài lần là kẹt vĩnh viễn');
  } finally { sv.closeAllConnections(); sv.close(); }
});

test('/api/chat/bo-sung không có vé hợp lệ ở header: 401 NGAY, không đọc thân', async () => {
  const sv = await dungApp();
  const port = sv.address().port;
  try {
    for (const header of [{}, { Authorization: 'Bearer gia-mao' },
      { Authorization: `Bearer ${jwt.sign({ purpose: 'khac', sub: 1 }, process.env.JWT_SECRET)}` }]) {
      const l = moLuot(port, '/api/chat/bo-sung', { ip: '198.51.100.40', header });
      const r = await trongVong(l.traLoi, 1500);
      assert.ok(r, `${JSON.stringify(header).slice(0, 40)}: không có vé mà máy chủ vẫn đọc thân`);
      assert.equal(r.status, 401);
      l.huy();
    }
    /* Có vé đúng -> vào tới route như cũ */
    const ve = jwt.sign({ sub: 7, purpose: 'chat_reporter' }, process.env.JWT_SECRET, { expiresIn: '1h' });
    const ok = moLuot(port, '/api/chat/bo-sung', { ip: '198.51.100.41', header: { Authorization: `Bearer ${ve}` } });
    assert.equal((await ok.xong()).status, 200);
  } finally { sv.closeAllConnections(); sv.close(); }
});
