/**
 * GIỮ MÁY CHỦ THỨC (P63) — Render gói miễn phí cho máy chủ ngủ sau 15 phút không có
 * lượt gọi nào; lượt đầu sau đó chờ 30–60 giây, trang người dân tưởng máy chủ hỏng
 * và bật trang dự phòng. Máy chủ tự gọi /api/health của chính nó qua địa chỉ công khai
 * mỗi 10 phút thì không bao giờ đủ 15 phút vắng.
 *
 * Bật bằng GIU_THUC=1 (không bật ngầm): gói miễn phí chỉ có 750 giờ/tháng cho CẢ tài
 * khoản — giữ thức hai dịch vụ là hết giờ giữa tháng, mọi dịch vụ miễn phí bị dừng.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { datBienMoiTruongHopLe } from './helpers-test.js';

datBienMoiTruongHopLe();
const { batGiuThuc, CHU_KY_GIU_THUC_MS } = await import('../src/lib/giu-thuc.js');

function gia(env) {
  const goi = []; const hen = []; const log = [];
  const t = batGiuThuc({
    env,
    fetchFn: async (url, opt) => { goi.push({ url, opt }); return { status: 200 }; },
    henGio: (fn, ms) => { hen.push({ fn, ms }); return { unref() {} }; },
    ghiLog: (...a) => log.push(a.join(' ')),
  });
  return { t, goi, hen, log };
}

test('mặc định TẮT: không khai GIU_THUC thì không hẹn giờ, không gọi gì', () => {
  const { t, hen, goi } = gia({ RENDER_EXTERNAL_URL: 'https://hop-thu.onrender.com' });
  assert.equal(t, null); assert.equal(hen.length, 0); assert.equal(goi.length, 0);
});

test('GIU_THUC=1 + RENDER_EXTERNAL_URL: gọi /api/health của chính mình, chu kỳ dưới 15 phút', async () => {
  const { t, hen, goi } = gia({ GIU_THUC: '1', RENDER_EXTERNAL_URL: 'https://hop-thu-so-v2.onrender.com/' });
  assert.ok(t);
  assert.equal(hen.length, 1);
  assert.ok(hen[0].ms < 15 * 60_000 && hen[0].ms >= 5 * 60_000, `chu kỳ ${hen[0].ms}`);
  assert.equal(hen[0].ms, CHU_KY_GIU_THUC_MS);
  await hen[0].fn();
  assert.equal(goi.length, 1);
  assert.equal(goi[0].url, 'https://hop-thu-so-v2.onrender.com/api/health');
  assert.ok(goi[0].opt?.signal, 'phải có hết giờ, không treo mãi');
});

test('GIU_THUC_URL ghi đè; chỉ lấy phần gốc (bỏ đường dẫn, tham số)', async () => {
  const { hen, goi } = gia({ GIU_THUC: '1', RENDER_EXTERNAL_URL: 'https://a.onrender.com', GIU_THUC_URL: 'https://api.don-vi.vn/x/y?z=1' });
  await hen[0].fn();
  assert.equal(goi[0].url, 'https://api.don-vi.vn/api/health');
});

test('địa chỉ không hợp lệ hoặc không phải https -> không chạy, báo rõ trong log', () => {
  for (const url of ['http://a.onrender.com', 'không-phải-url', 'javascript:alert(1)', '']) {
    const { t, hen, log } = gia({ GIU_THUC: '1', RENDER_EXTERNAL_URL: url });
    assert.equal(t, null, url); assert.equal(hen.length, 0, url);
    assert.ok(log.some((d) => /GIU_THUC/.test(d)), `phải báo vì sao không chạy (${url})`);
  }
});

test('gọi lỗi không làm sập máy chủ, chỉ ghi log', async () => {
  const log = []; const hen = [];
  batGiuThuc({ env: { GIU_THUC: '1', RENDER_EXTERNAL_URL: 'https://a.onrender.com' },
    fetchFn: async () => { throw new Error('mất mạng'); }, henGio: (fn, ms) => { hen.push({ fn, ms }); return { unref() {} }; },
    ghiLog: (...a) => log.push(a.join(' ')) });
  await hen[0].fn();
  assert.ok(log.some((d) => /mất mạng/.test(d)));
});

test('cả ba điểm vào đều bật giữ thức (sửa một file phải kiểm cả ba)', async () => {
  for (const f of ['index.js', 'may-chu-cong-khai.js', 'may-chu-can-bo.js']) {
    const ma = await readFile(new URL(`../src/${f}`, import.meta.url), 'utf8');
    assert.match(ma, /batGiuThuc\(/, `${f} chưa gọi batGiuThuc`);
  }
});
