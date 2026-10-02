/**
 * BUG-027 — MẬT KHẨU TÀI KHOẢN ADMIN PHẢI QUA CÙNG LUẬT VỚI CÁN BỘ
 * ============================================================================
 *
 * scripts-them-can-bo.js đòi mật khẩu 12 ký tự đủ bốn loại (comment ở đó: mật
 * khẩu 6 ký tự dò hết trong vài phút, mà tài khoản này xem được danh tính người
 * tố giác). Nhưng scripts-create-admin.js — đặt mật khẩu cho `admin`, tài khoản
 * quyền cao nhất, đúng tệp README bảo chạy sau khi cài — chỉ đòi 6 ký tự, và in
 * nguyên mật khẩu ra màn hình. Hai luật cho hai cửa vào cùng một quyền.
 *
 * Sửa: một luật duy nhất ở src/lib/mat-khau.js, cả hai script cùng dùng; script
 * admin không in mật khẩu.
 *
 * Chạy script thật bằng tiến trình con, trỏ CSDL vào cổng 1 (không có gì nghe):
 * mật khẩu yếu phải bị từ chối TRƯỚC khi chạm CSDL; lỡ lọt qua thì cũng chỉ gặp
 * lỗi kết nối, không bao giờ đổi được mật khẩu của CSDL nào trên máy chạy test.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { datBienMoiTruongHopLe } from './helpers-test.js';

datBienMoiTruongHopLe();
const THU_MUC = fileURLToPath(new URL('..', import.meta.url));

function chayScriptAdmin(matKhau) {
  return spawnSync(process.execPath, ['scripts-create-admin.js', matKhau], {
    cwd: THU_MUC,
    env: { ...process.env, DB_HOST: '127.0.0.1', DB_PORT: '1', DB_USER: 'khong_ai', DB_PASSWORD: 'x', DB_NAME: 'khong_co' },
    encoding: 'utf8',
    timeout: 20000,
  });
}

describe('BUG-027: mật khẩu admin qua cùng luật với cán bộ', () => {
  for (const [ten, mk] of [
    ['9 ký tự đủ bốn loại (cũ: lọt vì chỉ đòi 6)', 'Abc@12345'],
    ['16 ký tự toàn chữ thường', 'abcdefghijklmnop'],
    ['12 ký tự thiếu ký tự đặc biệt', 'TramDieu2026x'],
  ]) {
    test(`scripts-create-admin.js từ chối: ${ten}`, () => {
      const r = chayScriptAdmin(mk);
      const ra = r.stdout + r.stderr;
      assert.equal(r.status, 1, `phải thoát mã 1, nhận ${r.status}: ${ra}`);
      assert.match(ra, /Mật khẩu cần:/, `phải báo theo luật chung, nhận: ${ra}`);
      assert.doesNotMatch(ra, /Đã đặt mật khẩu/);
      assert.doesNotMatch(ra, /ECONNREFUSED|kết nối/i, 'mật khẩu yếu phải bị chặn TRƯỚC khi chạm CSDL');
    });
  }

  test('luật dùng chung: mật khẩu mạnh qua, mật khẩu chứa tên đăng nhập hay cụm quen thuộc bị chặn', async () => {
    const { kiemMatKhau } = await import('../src/lib/mat-khau.js');
    assert.equal(kiemMatKhau('Tr@mXanh#2026q', 'truong'), null);
    assert.match(kiemMatKhau('Truong@2026xyz', 'truong'), /tên đăng nhập/);
    assert.match(kiemMatKhau('Admin@2026xyzq', 'truong'), /quen thuộc/);
  });

  test('hai script cùng nạp một luật, không giữ bản riêng', async () => {
    for (const tep of ['scripts-create-admin.js', 'scripts-them-can-bo.js']) {
      const ma = await readFile(new URL(`../${tep}`, import.meta.url), 'utf8');
      assert.match(ma, /import\s*\{\s*kiemMatKhau\s*\}\s*from\s*'\.\/src\/lib\/mat-khau\.js'/, `${tep} chưa nạp luật chung`);
      assert.doesNotMatch(ma, /function\s+kiemMatKhau/, `${tep} còn giữ bản luật riêng`);
    }
  });

  test('script admin không in mật khẩu ra màn hình', async () => {
    const ma = await readFile(new URL('../scripts-create-admin.js', import.meta.url), 'utf8');
    assert.doesNotMatch(ma, /console\.\w+\([^)]*\bpassword\b[^)]*\)/, 'còn câu in biến password');
  });
});
