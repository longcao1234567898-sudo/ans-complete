/**
 * GIAO DIỆN TRÊN MÁY VIETTEL (Nginx) THAY NETLIFY/VERCEL (P67)
 * ============================================================================
 *
 * Người vận hành chuyển giao diện về máy chủ trong nước. Trên Netlify, header bảo
 * mật đến từ public/_headers; trên Vercel từ vercel.json; trên máy riêng thì từ
 * cấu hình Nginx trong deploy/nginx/. Ba nơi phải KHỚP: lệch là một nơi yếu hơn
 * mà không ai biết (trang vẫn chạy bình thường khi thiếu CSP).
 *
 * Địa chỉ máy chủ API trên Netlify ghi cứng trong CSP; trên máy Viettel thì
 * kịch bản dựng thay chỗ __MAY_CHU__ bằng VITE_API_URL (+ VITE_ADMIN_API_URL) —
 * cùng giá trị nhúng vào gói JS, nên CSP và gói JS không lệch nhau được.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const doc = (p) => readFile(new URL(`../../${p}`, import.meta.url), 'utf8');

/** Header trong khối "/*" của public/_headers: Map tên -> giá trị */
async function headerNetlify() {
  const dong = (await doc('public/_headers')).split('\n');
  const dau = dong.findIndex((d) => d.trim() === '/*');
  assert.ok(dau >= 0, 'public/_headers thiếu khối /*');
  const ra = new Map();
  for (const d of dong.slice(dau + 1)) {
    if (/^\S/.test(d) && !d.startsWith('#')) break;   // sang khối khác
    const m = d.match(/^\s+([A-Za-z-]+):\s*(.+?)\s*$/);
    if (m && !d.trim().startsWith('#')) ra.set(m[1], m[2]);
  }
  return ra;
}

/** Quy định lưu đệm theo đường dẫn trong public/_headers: Map đường -> giá trị */
async function luuDemNetlify() {
  const dong = (await doc('public/_headers')).split('\n');
  const ra = new Map();
  for (let i = 0; i < dong.length; i += 1) {
    const duong = dong[i].match(/^(\/\S+)\s*$/);
    const cc = duong && (dong[i + 1] || '').match(/^\s+Cache-Control:\s*(.+?)\s*$/);
    if (cc) ra.set(duong[1], cc[1]);
  }
  return ra;
}

/** add_header trong tệp Nginx (bỏ dòng chú thích): Map tên -> { giaTri, always } */
function headerNginx(nguon) {
  const ra = new Map();
  for (const d of nguon.split('\n')) {
    if (d.trim().startsWith('#')) continue;
    const m = d.match(/^\s*add_header\s+([A-Za-z-]+)\s+"([^"]*)"(\s+always)?\s*;/);
    if (m) ra.set(m[1], { giaTri: m[2], always: Boolean(m[3]) });
  }
  return ra;
}

/** Bỏ chú thích để soi cấu trúc */
const boChuThich = (s) => s.split('\n').map((d) => d.replace(/#.*$/, '')).join('\n');

/** Các khối location { ... } (không lồng nhau trong tệp này) */
const khoiLocation = (s) => [...boChuThich(s).matchAll(/location\s+([^{]+)\{([^}]*)\}/g)]
  .map((m) => ({ ten: m[1].trim(), than: m[2] }));

describe('Header bảo mật trên Nginx khớp public/_headers', () => {
  test('đủ năm header (trừ CSP) giống hệt từng ký tự, đều có "always"', async () => {
    const netlify = await headerNetlify();
    const nginx = headerNginx(await doc('deploy/nginx/hop-thu-header.conf'));
    for (const ten of ['Strict-Transport-Security', 'X-Frame-Options', 'X-Content-Type-Options',
      'Referrer-Policy', 'Permissions-Policy']) {
      assert.ok(netlify.has(ten), `public/_headers thiếu ${ten} — cách đọc tệp đã hỏng`);
      assert.ok(nginx.has(ten), `Nginx thiếu header ${ten}`);
      assert.equal(nginx.get(ten).giaTri, netlify.get(ten), `${ten} lệch giữa Nginx và Netlify`);
      /* Thiếu "always" thì Nginx BỎ header ở trang lỗi (404, 500) — trang lỗi
         cũng cần chống nhúng iframe và CSP như mọi trang khác */
      assert.ok(nginx.get(ten).always, `${ten} thiếu "always"`);
    }
  });

  test('CSP: thay __MAY_CHU__ bằng địa chỉ máy chủ của Netlify thì GIỐNG HỆT CSP Netlify', async () => {
    const netlify = await headerNetlify();
    const cspNetlify = netlify.get('Content-Security-Policy');
    assert.ok(cspNetlify, 'public/_headers thiếu CSP');
    const nginx = headerNginx(await doc('deploy/nginx/hop-thu-header.conf'));
    assert.ok(nginx.has('Content-Security-Policy'), 'Nginx thiếu CSP');
    const { giaTri: cspNginx, always } = nginx.get('Content-Security-Policy');
    assert.ok(always, 'CSP thiếu "always"');

    /* Địa chỉ máy chủ trên Netlify = các nguồn trong media-src trừ 'self'
       (âm thanh đọc tiếng Việt do máy chủ trả về — chỉ máy chủ có ở đây) */
    const media = cspNetlify.match(/media-src ([^;]+)/)[1].split(/\s+/).filter((x) => x !== "'self'");
    assert.ok(media.length > 0, 'không đọc được địa chỉ máy chủ từ CSP Netlify');
    assert.equal(cspNginx.replaceAll('__MAY_CHU__', media.join(' ')), cspNetlify,
      'CSP Nginx (sau khi thay __MAY_CHU__) phải giống hệt CSP Netlify');

    /* Địa chỉ máy chủ KHÔNG được ghi cứng: phải là chỗ thay ở cả connect-src lẫn media-src */
    assert.match(cspNginx, /connect-src [^;]*__MAY_CHU__/);
    assert.match(cspNginx, /media-src [^;]*__MAY_CHU__/);
    assert.ok(!/onrender\.com/.test(cspNginx), 'CSP Nginx không được ghi cứng địa chỉ Render');
  });
});

describe('Tệp site Nginx của giao diện', () => {
  test('MỌI location có add_header riêng đều include lại header bảo mật', async () => {
    /* Bẫy của Nginx: location nào có add_header của riêng nó thì KHÔNG thừa kế
       add_header của server. Quên include là đúng các tệp đó (index.html, sw.js,
       /assets/) chạy KHÔNG có CSP — mà đó lại là các tệp quan trọng nhất. */
    const nguon = await doc('deploy/nginx/hop-thu-giao-dien.conf');
    const ds = khoiLocation(nguon);
    assert.ok(ds.length >= 4, 'thiếu các khối location');
    for (const { ten, than } of ds) {
      if (/add_header/.test(than)) {
        assert.match(than, /include\s+snippets\/hop-thu-header\.conf\s*;/,
          `location ${ten} có add_header riêng mà không include header bảo mật`);
      }
    }
    assert.match(boChuThich(nguon), /server\s*\{[\s\S]*include\s+snippets\/hop-thu-header\.conf\s*;/,
      'cấp server cũng phải include header bảo mật');
    assert.match(boChuThich(nguon), /server_tokens\s+off\s*;/);
  });

  test('lưu đệm giống public/_headers: sw.js, index.html, manifest, /assets/', async () => {
    const netlify = await luuDemNetlify();
    const ds = khoiLocation(await doc('deploy/nginx/hop-thu-giao-dien.conf'));
    const cua = (dk) => ds.find((l) => dk(l.ten));
    const giaTri = (l) => (l?.than.match(/add_header\s+Cache-Control\s+"([^"]*)"(\s+always)?\s*;/) || [])[1];
    assert.equal(giaTri(cua((t) => t === '= /sw.js')), netlify.get('/sw.js'), 'sw.js');
    assert.equal(giaTri(cua((t) => t === '= /index.html')), netlify.get('/index.html'), 'index.html');
    assert.equal(giaTri(cua((t) => t === '= /manifest.json')), netlify.get('/manifest.json'), 'manifest.json');
    assert.equal(giaTri(cua((t) => t === '/assets/')), netlify.get('/assets/*'), '/assets/');
    /* "immutable, 1 năm" mà có "always" thì gắn cả vào trang 404: trình duyệt nhớ
       "không có tệp" suốt một năm. Bắt được khi chạy Nginx thật ở P67. */
    assert.doesNotMatch(cua((t) => t === '/assets/').than, /Cache-Control\s+"[^"]*immutable[^"]*"\s+always/,
      'Cache-Control immutable của /assets/ không được có "always" (404 sẽ bị lưu đệm 1 năm)');
  });

  test('ứng dụng một trang: đường lạ trả index.html, nhưng /assets/ thiếu tệp thì 404', async () => {
    const ds = khoiLocation(await doc('deploy/nginx/hop-thu-giao-dien.conf'));
    assert.match(ds.find((l) => l.ten === '/').than, /try_files\s+\$uri\s+\$uri\/\s+\/index\.html\s*;/);
    /* Tệp JS cũ đã xoá mà trả index.html thì trình duyệt báo lỗi MIME khó hiểu */
    assert.match(ds.find((l) => l.ten === '/assets/').than, /try_files\s+\$uri\s+=404\s*;/);
  });
});

describe('Kịch bản dựng và đổi bản', () => {
  test('dừng ngay khi lỗi, kiểm địa chỉ máy chủ TRƯỚC khi ghi vào Nginx, kiểm nginx -t trước khi nạp', async () => {
    const sh = boChuThich(await doc('deploy/dung-giao-dien.sh'));
    assert.match(sh, /set -euo pipefail/);
    /* Địa chỉ đi thẳng vào tệp cấu hình Nginx chạy bằng root: chỉ nhận đúng dạng
       https://ten-mien (allow-list), không nhận dấu ; " ' $ hay khoảng trắng */
    const kiem = sh.indexOf('la_goc_https "$VITE_API_URL"');
    const thay = sh.indexOf('__MAY_CHU__');
    assert.ok(kiem >= 0, 'phải kiểm VITE_API_URL bằng la_goc_https');
    assert.ok(thay > kiem, 'phải kiểm địa chỉ TRƯỚC khi thay vào cấu hình Nginx');
    const t = sh.indexOf('nginx -t');
    const nap = sh.indexOf('systemctl reload nginx');
    assert.ok(t >= 0 && nap > t, 'phải chạy nginx -t trước khi reload');
    assert.match(sh, /grep -rqF "\$VITE_API_URL" dist/, 'phải kiểm gói JS thật sự chứa địa chỉ máy chủ');
  });
});
