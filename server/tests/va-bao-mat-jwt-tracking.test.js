/**
 * HAI BẢN VÁ BẢO MẬT — GHIM THUẬT TOÁN JWT VÀ GIỚI HẠN TRA CỨU
 *
 * Cả hai đều là lớp phòng thủ chiều sâu: chưa bị khai thác, nhưng để hở là mở
 * đường cho lỗ hổng về sau. Khoá lại bằng test để không ai vô tình gỡ ra khi
 * sửa mã quanh đó.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const doc = (p) => readFile(new URL(p, import.meta.url), 'utf8');

describe('V1 — jwt.verify phải ghim thuật toán HS256', () => {
  /* Không ghim thì jwt.verify chấp nhận mọi thuật toán token tự khai. Nguy hiểm
     nhất khi chuyển sang khoá bất đối xứng về sau: kẻ tấn công ép về HS256 rồi
     ký bằng public key. Ghim ngay để cửa đó đóng vĩnh viễn. */

  test('verifyAccessToken truyền algorithms: [HS256]', async () => {
    const ma = await doc('../src/lib/token.js');
    const goi = ma.slice(ma.indexOf('export function verifyAccessToken'));
    assert.match(goi, /jwt\.verify\([\s\S]*?algorithms:\s*\[\s*['"]HS256['"]\s*\]/,
      'verifyAccessToken không ghim algorithms — token tự khai thuật toán sẽ lọt');
  });

  test('mô phỏng: ghim HS256 thì token alg khác bị loại', () => {
    /* Tự dựng lại logic ghim để chứng minh ý nghĩa, không phụ thuộc thư viện. */
    const verifyGhim = (algToken) => {
      const CHO_PHEP = ['HS256'];
      if (!CHO_PHEP.includes(algToken)) throw new Error('thuật toán không được phép');
      return { ok: true };
    };
    assert.deepEqual(verifyGhim('HS256'), { ok: true });
    assert.throws(() => verifyGhim('none'), /không được phép/, 'alg:none phải bị loại');
    assert.throws(() => verifyGhim('RS256'), /không được phép/, 'ép RS256 phải bị loại');
    assert.throws(() => verifyGhim('HS512'), /không được phép/);
  });
});

describe('V2 — route tra cứu có giới hạn tần suất riêng', () => {
  /* Giới hạn chung 300/15 phút vẫn cho 28.800 lượt/ngày một máy — đủ dò có mục
     tiêu. Tra cứu là route công khai không cần đăng nhập nên là bề mặt tấn công
     rộng nhất; phải có bức tường riêng. */

  test('tracking.js có khai rateLimit riêng', async () => {
    const ma = await doc('../src/routes/tracking.js');
    assert.match(ma, /import rateLimit from 'express-rate-limit'/,
      'chưa import express-rate-limit');
    assert.match(ma, /rateLimit\(\{[\s\S]*?max:\s*30[\s\S]*?\}\)/,
      'chưa đặt giới hạn 30 lượt/phút');
  });

  test('giới hạn được gắn vào route GET /:code', async () => {
    const ma = await doc('../src/routes/tracking.js');
    assert.match(ma, /router\.get\('\/:code',\s*gioiHanTraCuu/,
      'giới hạn khai ra nhưng chưa gắn vào route — vô tác dụng');
  });

  test('khoá theo IP đã chuẩn hoá, không theo header người dùng', async () => {
    const ma = await doc('../src/routes/tracking.js');
    const khoi = ma.slice(ma.indexOf('const gioiHanTraCuu'), ma.indexOf('router.get'));
    assert.match(khoi, /keyGenerator:.*layIpThat/,
      'phải khoá theo layIpThat — không thì kẻ tấn công đổi header là qua mặt');
  });

  test('mô phỏng: quá 30 lượt/phút thì chặn', () => {
    let dem = 0;
    const MAX = 30;
    const thu = () => (++dem <= MAX ? 200 : 429);
    for (let i = 0; i < 30; i++) assert.equal(thu(), 200);
    assert.equal(thu(), 429, 'lượt thứ 31 phải bị chặn');
    assert.equal(thu(), 429);
  });
});
