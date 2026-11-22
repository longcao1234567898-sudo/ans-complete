/**
 * XIN XOÁ DANH TÍNH CHỊU CÙNG GIỚI HẠN DÒ MÃ VỚI TRA CỨU (BUG-051)
 *
 * GET /api/tracking/:code có giới hạn 30 lượt/phút/mạng (gioiHanTraCuu) — mã tra cứu 6 ký tự
 * là thứ duy nhất đứng giữa người lạ và hồ sơ. POST /:code/request-deletion nhận cùng mã đó
 * nhưng không gắn giới hạn này (chỉ chịu mức chung 300 lượt GỬI/15 phút): phản hồi khác nhau
 * giữa 404 / 'nothing' (ẩn danh) / 'done' / 'pending' là một cửa dò mã thứ hai, nhanh hơn cửa
 * chính 2,5 lần — và mã đúng thì xoá được danh tính của hồ sơ đã đóng.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { datBienMoiTruongHopLe } from './helpers-test.js';
import { BO_QUA, dungCsdl } from './khung-sqlite.js';

datBienMoiTruongHopLe();
const { pool } = await import('../src/db.js');
const { default: trackingRouter } = await import('../src/routes/tracking.js');

test('POST request-deletion: quá 30 lượt/phút từ một mạng thì 429, như tra cứu', { skip: BO_QUA }, async () => {
  dungCsdl(pool);
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json());
  app.use('/api/tracking', trackingRouter);
  const sv = await new Promise((ok) => { const s = app.listen(0, '127.0.0.1', () => ok(s)); });
  try {
    const goi = (ma, ip) => fetch(`http://127.0.0.1:${sv.address().port}/api/tracking/${ma}/request-deletion`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip },
    });
    const maCac = [];
    for (let i = 0; i < 31; i++) maCac.push((await goi(`ZZ${String(i).padStart(4, '0')}`, '198.51.100.9')).status);
    assert.ok(maCac.slice(0, 30).every((m) => m === 404), `30 lượt đầu phải tới xử lý: ${maCac.slice(0, 30)}`);
    assert.equal(maCac[30], 429, 'lượt thứ 31 trong một phút vẫn được dò mã');
    /* Mạng khác không bị vạ lây */
    assert.equal((await goi('ZZ9999', '198.51.100.10')).status, 404);
  } finally { sv.close(); }
});
