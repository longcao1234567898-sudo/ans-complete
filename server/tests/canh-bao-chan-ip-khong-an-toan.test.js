/**
 * BUG-047 (ND-093) — BẬT CHẶN IP CÁN BỘ MÀ APP KHÔNG NGHE LOCALHOST THÌ PHẢI BÁO
 * ============================================================================
 *
 * Chặn IP cán bộ (ADMIN_ALLOWED_IPS, nen-tang.js chanTheoIp) tin vào req.ip qua
 * `trust proxy 1`. Điều đó chỉ ĐÚNG khi app nằm sau Nginx và KHÔNG nối thẳng từ
 * ngoài được. RA-SOAT P113 chứng minh: nối THẲNG vào cổng app kèm X-Forwarded-For
 * giả thì lách được chặn IP (qua Nginx thì spoof thất bại — 403). An toàn hiện
 * dựa vào HOST=127.0.0.1 + tường lửa chặn cổng app — lớp ngoài tầm mã nguồn.
 *
 * Nên: khai ADMIN_ALLOWED_IPS mà HOST không phải localhost -> BÁO TO lúc khởi
 * động, để người vận hành kiểm tường lửa / sửa HOST. KHÔNG từ chối khởi động:
 * có topology hợp lệ dùng HOST là IP nội bộ sau tường lửa.
 *
 * Hai điểm khởi động ÁP chặn IP cán bộ (index.js che do gop, may-chu-can-bo.js)
 * phải in cảnh báo. may-chu-cong-khai.js KHÔNG áp chặn IP nên KHÔNG cần
 * (CLAUDE.md: sửa lớp bảo vệ phải kiểm các biến thể khởi động liên quan).
 */
import { describe, test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const { canhBaoChanIpKhongAnToan } = await import('../src/nen-tang.js');

let cu;
beforeEach(() => { cu = { DS: process.env.ADMIN_ALLOWED_IPS, HOST: process.env.HOST }; });
afterEach(() => {
  for (const [k, v] of [['ADMIN_ALLOWED_IPS', cu.DS], ['HOST', cu.HOST]]) {
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
});

describe('BUG-047: cảnh báo chặn IP cán bộ có thể bị lách', () => {
  test('ADMIN_ALLOWED_IPS trống -> không cảnh báo (chưa bật chặn IP)', () => {
    delete process.env.ADMIN_ALLOWED_IPS;
    process.env.HOST = '';
    assert.equal(canhBaoChanIpKhongAnToan(), null);
  });

  for (const h of ['127.0.0.1', 'localhost', '::1', '127.0.0.5']) {
    test(`ADMIN_ALLOWED_IPS bật + HOST=${h} (nội bộ) -> không cảnh báo`, () => {
      process.env.ADMIN_ALLOWED_IPS = '10.9.9.9';
      process.env.HOST = h;
      assert.equal(canhBaoChanIpKhongAnToan(), null);
    });
  }

  for (const [ten, h] of [['để trống (nghe mọi giao diện)', ''], ['0.0.0.0', '0.0.0.0'], ['IP công khai', '10.0.0.5']]) {
    test(`ADMIN_ALLOWED_IPS bật + HOST ${ten} -> CÓ cảnh báo nêu HOST và BUG-047`, () => {
      process.env.ADMIN_ALLOWED_IPS = '10.9.9.9';
      process.env.HOST = h;
      const cb = canhBaoChanIpKhongAnToan();
      assert.ok(cb, 'phải trả cảnh báo');
      assert.match(cb, /HOST/);
      assert.match(cb, /BUG-047/);
      assert.match(cb, /X-Forwarded-For|tường lửa/i);
    });
  }
});

describe('BUG-047: các điểm khởi động áp chặn IP cán bộ phải in cảnh báo', () => {
  for (const tep of ['index.js', 'may-chu-can-bo.js']) {
    test(`${tep} gọi canhBaoChanIpKhongAnToan lúc khởi động`, async () => {
      const src = await readFile(new URL(`../src/${tep}`, import.meta.url), 'utf8');
      assert.match(src, /canhBaoChanIpKhongAnToan\s*\(/, `${tep} chưa in cảnh báo chặn IP`);
    });
  }

  test('may-chu-cong-khai.js KHÔNG cần (không áp chặn IP cán bộ)', async () => {
    const src = await readFile(new URL('../src/may-chu-cong-khai.js', import.meta.url), 'utf8');
    assert.doesNotMatch(src, /chanTheoIp\b/, 'máy chủ công khai không được áp chặn IP cán bộ');
  });
});
