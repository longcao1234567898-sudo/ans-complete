/**
 * MÁY CHỦ CÔNG KHAI KHÔNG NHẬN ĐĂNG NHẬP CÁN BỘ (BUG-045)
 *
 * Bản tách: giới hạn IP cơ quan (ADMIN_ALLOWED_IPS) nằm ở máy chủ cán bộ. Máy chủ công khai mà
 * vẫn gắn /api/auth thì từ bất kỳ đâu cũng so được mật khẩu cán bộ — và làm khoá tài khoản cán
 * bộ — vòng qua lớp chặn IP. Không route công khai nào cần phiên cán bộ; giao diện đăng nhập ở
 * VITE_ADMIN_API_URL, cùng nơi có /api/admin.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

const src = (f) => readFile(new URL(`../src/${f}`, import.meta.url), 'utf8');
const boChuThich = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('may-chu-cong-khai.js không gắn /api/auth, không nạp routes/auth.js', async () => {
  const ck = boChuThich(await src('may-chu-cong-khai.js'));
  assert.doesNotMatch(ck, /['"]\/api\/auth['"]/, 'máy chủ công khai còn gắn /api/auth');
  assert.doesNotMatch(ck, /routes\/auth\.js/, 'máy chủ công khai còn nạp routes/auth.js');
});

test('bản gộp và máy chủ cán bộ vẫn có đăng nhập', async () => {
  for (const f of ['index.js', 'may-chu-can-bo.js']) {
    assert.match(boChuThich(await src(f)), /app\.use\('\/api\/auth', authRouter\)/, f);
  }
});

test('không route công khai nào cần phiên cán bộ (bỏ /api/auth không làm hỏng trang người dân)', async () => {
  const ck = boChuThich(await src('may-chu-cong-khai.js'));
  const tep = [...ck.matchAll(/from '\.\/routes\/([^']+)'/g)].map((m) => m[1]);
  assert.ok(tep.length > 0);
  for (const f of tep) {
    const ma = boChuThich(await src(`routes/${f}`));
    assert.doesNotMatch(ma, /requireAuth|authorize\(|req\.staff/, `routes/${f} cần phiên cán bộ`);
  }
});
