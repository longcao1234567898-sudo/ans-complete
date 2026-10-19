/**
 * MỤC B9 CỦA HƯỚNG DẪN TRIỂN KHAI — Nginx đứng trước hai máy chủ (ND-062)
 *
 * Người cài chép NGUYÊN khối cấu hình trong tài liệu. Ba điều trong khối đó phải
 * còn nguyên mỗi khi ai sửa tài liệu:
 *   · Giữ sẵn kết nối tới máy chủ (upstream keepalive): đo P68, 2.000 người bấm
 *     cùng lúc mà thiếu nó thì 1,2% lỗi 502; có thì 0 lỗi.
 *   · keepalive_timeout DƯỚI 5 s — máy chủ Node tự đóng kết nối rảnh sau 5 s.
 *   · X-Forwarded-For bị GHI ĐÈ bằng $remote_addr (luật 3): nối thêm vào giá trị
 *     trình duyệt tự gửi là kẻ phá đổi được IP, lách mọi giới hạn theo IP.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function khoiB9() {
  const s = await readFile(new URL('../../docs/HUONG-DAN-TRIEN-KHAI.md', import.meta.url), 'utf8');
  const b9 = s.slice(s.indexOf('### B9.'), s.indexOf('### B10.'));
  const m = b9.match(/```nginx\n([\s\S]*?)```/);
  assert.ok(m, 'mục B9 phải có khối ```nginx');
  return m[1].split('\n').map((d) => d.replace(/#.*$/, '')).join('\n');
}

test('hai upstream giữ sẵn kết nối, keepalive_timeout dưới 5 s', async () => {
  const k = await khoiB9();
  for (const ten of ['hop_thu_cong_khai', 'hop_thu_can_bo']) {
    const u = k.match(new RegExp(`upstream\\s+${ten}\\s*\\{([^}]*)\\}`));
    assert.ok(u, `thiếu upstream ${ten}`);
    assert.match(u[1], /keepalive\s+\d+\s*;/, `${ten} thiếu keepalive`);
    const t = u[1].match(/keepalive_timeout\s+(\d+)s\s*;/);
    assert.ok(t && Number(t[1]) < 5, `${ten}: keepalive_timeout phải dưới 5 s`);
  }
});

test('mọi location chuyển vào upstream, có Connection "" và GHI ĐÈ X-Forwarded-For', async () => {
  const k = await khoiB9();
  const ds = [...k.matchAll(/location\s+\/\s*\{([^}]*)\}/g)].map((m) => m[1]);
  assert.equal(ds.length, 2, 'phải có hai khối location (công khai, cán bộ)');
  for (const l of ds) {
    assert.match(l, /proxy_pass\s+http:\/\/hop_thu_(cong_khai|can_bo)\s*;/);
    assert.doesNotMatch(l, /proxy_pass\s+http:\/\/127\.0\.0\.1/, 'không gọi thẳng cổng — mất keepalive');
    assert.match(l, /proxy_http_version\s+1\.1\s*;/);
    assert.match(l, /proxy_set_header\s+Connection\s+""\s*;/);
    assert.match(l, /proxy_set_header\s+X-Forwarded-For\s+\$remote_addr\s*;/, 'luật 3: phải ghi đè, không nối');
    assert.doesNotMatch(l, /\$proxy_add_x_forwarded_for/);
  }
});
