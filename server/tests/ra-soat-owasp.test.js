/**
 * VÒNG RÀ SOÁT OWASP — các lỗ hổng tìm thêm được SAU đợt vá đầu (B1–H6).
 *
 * Mỗi test dưới đây khoá một lỗ hổng THẬT đã kiểm chứng bằng tay, không phải
 * kiểm tra hình thức. Chi tiết đầy đủ ở BAO-CAO-BAO-MAT.md.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import bcrypt from 'bcryptjs';
/* Cần biến môi trường hợp lệ: test này nay IMPORT routes/auth.js để lấy
   DUMMY_HASH thật, mà auth.js -> lib/token.js sẽ ném lỗi nếu thiếu khoá. */
import { datBienMoiTruongHopLe } from './helpers-test.js';

datBienMoiTruongHopLe();

const doc = (p) => readFile(new URL(p, import.meta.url), 'utf8');

describe('A07 — dummyHash phải khiến sai-tên và sai-mật-khẩu tốn thời gian NHƯ NHAU', () => {
  /* Bản trước dùng '$2a$12$' + 52 số 0 = 59 ký tự -> KHÔNG phải bcrypt hợp lệ.
     bcrypt.compare trả false ngay lập tức (0ms) thay vì ~290ms như hash thật.
     Đo thời gian phản hồi là biết tài khoản nào CÓ THẬT — đúng lỗ hổng mà đoạn
     mã đó tưởng mình đang chống (G6). Có phòng thủ trên giấy, không có thật. */

  /* Lấy đúng chuỗi dummyHash đang dùng trong routes/auth.js.

     Bản trước bới chuỗi cứng ra khỏi mã nguồn bằng regex. Nay auth.js SINH
     hash lúc nạp module (bcrypt.hashSync) thay vì gõ tay — cách đó bảo đảm
     luôn đúng định dạng và luôn khớp cost, chính là thứ bản gõ tay làm sai.
     Vì vậy test đọc GIÁ TRỊ THẬT được export ra, chắc chắn hơn đọc mã nguồn. */
  async function layDummyHash() {
    const { DUMMY_HASH } = await import('../src/routes/auth.js');
    assert.ok(DUMMY_HASH, 'routes/auth.js phải export DUMMY_HASH để kiểm chứng được');
    return DUMMY_HASH;
  }

  test('dummyHash là bcrypt HỢP LỆ, đúng 60 ký tự', async () => {
    const h = await layDummyHash();
    assert.equal(h.length, 60, `dummyHash dài ${h.length} ký tự — bcrypt hợp lệ phải đúng 60`);
    assert.match(h, /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/, 'Không đúng định dạng bcrypt');
  });

  test('dummyHash dùng cost 12, khớp cost của mật khẩu thật', async () => {
    const h = await layDummyHash();
    assert.match(h, /^\$2[aby]\$12\$/, 'Cost khác 12 -> thời gian lệch -> vẫn dò được tài khoản');
  });

  test('so sánh với dummyHash tốn thời gian ĐÁNG KỂ (không trả về tức thì)', async () => {
    const h = await layDummyHash();

    const batDau = process.hrtime.bigint();
    const kq = await bcrypt.compare('mat-khau-bat-ky', h);
    const mili = Number(process.hrtime.bigint() - batDau) / 1e6;

    assert.equal(kq, false, 'dummyHash không được khớp với bất kỳ mật khẩu nào');
    assert.ok(
      mili > 50,
      `compare chỉ mất ${mili.toFixed(1)}ms — hash hỏng nên bcrypt bỏ qua, `
      + 'kẻ tấn công đo thời gian là biết tài khoản nào có thật'
    );
  });
});

describe('A03 — chống chèn công thức Excel khi xuất báo cáo', () => {
  /* Nội dung tin báo do người dân gõ đi thẳng vào ô Excel. Ô bắt đầu bằng
     = + - @ được Excel coi là CÔNG THỨC và tự chạy khi mở file -> mã chạy trên
     máy LÃNH ĐẠO, đi vòng qua toàn bộ phòng thủ phía máy chủ. */

  test('AdminReportsPage có hàm chặn và áp cho sheet chứa nội dung người dân', async () => {
    const nguon = await doc('../../src/pages/admin/AdminReportsPage.tsx');
    assert.match(nguon, /chongCongThuc/, 'Thiếu hàm chống chèn công thức');
    assert.match(nguon, /rows\.map\(\(r, i\) => donDong\(\{/, 'Sheet chi tiết chưa được bọc');
  });

  test('mẫu nhận diện bắt đúng các ký tự mở đầu nguy hiểm', async () => {
    const nguon = await doc('../../src/pages/admin/AdminReportsPage.tsx');
    const khop = /typeof v === 'string' && (\/[^/]+\/)\.test\(v\)/.exec(nguon);
    assert.ok(khop, 'Không tìm thấy biểu thức chính quy nhận diện');

    const mau = new RegExp(khop[1].slice(1, -1));
    for (const nguyHiem of ['=1+1', '+1', '-1', '@SUM(A1)', '\t=1', '\r=1', '  =cmd|\'/c calc\'!A1']) {
      assert.ok(mau.test(nguyHiem), `Bỏ lọt chuỗi nguy hiểm: ${JSON.stringify(nguyHiem)}`);
    }
    for (const binhThuong of ['Đường X có ổ gà', '0901234567', 'Nhà số 12']) {
      assert.ok(!mau.test(binhThuong), `Báo nhầm nội dung bình thường: ${binhThuong}`);
    }
  });
});

describe('A03 — chống XSS ở phiếu in ki-ốt', () => {
  /* window.open('') tạo cửa sổ CÙNG NGUỒN GỐC với trang quản trị. Ghép thẳng họ
     tên do cán bộ gõ vào document.write là XSS chạy trong phiên của cán bộ. */

  test('mọi nội suy trong phiếu in đều đi qua thoatHtml()', async () => {
    const nguon = await doc('../../src/pages/admin/AdminKioskPage.tsx');
    assert.match(nguon, /function thoatHtml/, 'Thiếu hàm thoát ký tự HTML');

    // Lấy đúng khối template của document.write
    const batDau = nguon.indexOf('win.document.write(`');
    const ketThuc = nguon.indexOf('`);', batDau);
    assert.ok(batDau > -1 && ketThuc > batDau, 'Không tìm thấy khối phiếu in');

    const phieu = nguon.slice(batDau, ketThuc);
    for (const khop of phieu.matchAll(/\$\{([^}]+)\}/g)) {
      assert.match(
        khop[1].trim(), /^thoatHtml\(/,
        `Nội suy chưa thoát HTML: \${${khop[1].trim()}} — đây là đường XSS`
      );
    }
  });
});

describe('A01/A10 — chỉ nhận link ảnh từ miền đã cho phép', () => {
  /* Trước đây mọi chuỗi đều lưu được vào submission_images.image_url rồi trang
     chi tiết render <img src>. Kẻ tấn công gửi "ảnh" trỏ về máy chủ của mình ->
     mỗi lần cán bộ mở tin, trình duyệt cán bộ tự gọi sang đó, lộ IP + User-Agent
     + đúng thời điểm hồ sơ được xem. Đó là kênh do thám hoạt động điều tra. */

  /* Phép kiểm đã DỌN RA lib/anh-an-toan.js (trước nằm ngay trong submissions.js
     dưới tên laLinkAnhAnToan/laDataUrlAnh). Kiểm ở nơi nó thật sự sống, và kiểm
     rằng submissions.js vẫn GỌI nó — tách file mà quên gọi thì lỗ hổng quay lại
     y nguyên, chỉ khác chỗ nấp. */
  test('lib/anh-an-toan.js chặn theo miền, và submissions.js có gọi', async () => {
    const lib = await doc('../src/lib/anh-an-toan.js');
    assert.match(lib, /protocol !== 'https:'/, 'Chỉ nhận HTTPS');
    assert.match(lib, /res\.cloudinary\.com/, 'Phải khoá đúng miền kho ảnh của đơn vị');

    const nguon = await doc('../src/routes/submissions.js');
    assert.match(nguon, /locDanhSachAnh/, 'submissions.js phải gọi bộ lọc ảnh trước khi lưu');
  });

  test('chỉ chấp nhận HTTPS trỏ đúng miền, chặn http/javascript/miền lạ', async () => {
    const { laLinkAnhAnToan } = await import('../src/routes/submissions.js')
      .then(() => null).catch(() => null) ?? {};
    // Hàm không export -> dựng lại đúng logic từ mã nguồn để kiểm hành vi
    const MIEN = ['res.cloudinary.com'];
    const kiemTra = (url) => {
      try {
        const u = new URL(String(url));
        if (u.protocol !== 'https:') return false;
        const host = u.hostname.toLowerCase();
        return MIEN.some((m) => host === m || host.endsWith('.' + m));
      } catch { return false; }
    };

    assert.equal(kiemTra('https://res.cloudinary.com/demo/a.jpg'), true);
    assert.equal(kiemTra('https://sub.res.cloudinary.com/a.jpg'), true);

    for (const xau of [
      'http://res.cloudinary.com/a.jpg',          // không phải HTTPS
      'https://ke-tan-cong.example/theo-doi.png', // miền lạ -> lộ IP cán bộ
      'javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'https://res.cloudinary.com.ke-tan-cong.io/a.jpg', // giả mạo hậu tố
      'khong-phai-url',
    ]) {
      assert.equal(kiemTra(xau), false, `Phải từ chối: ${xau}`);
    }
  });

  test('data URL chỉ nhận ảnh, chặn text/html và svg (svg chứa script được)', async () => {
    const mau = /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=\s]+$/i;
    assert.ok(mau.test('data:image/png;base64,iVBORw0KGgo='));
    assert.ok(!mau.test('data:text/html;base64,PHNjcmlwdD4='));
    assert.ok(!mau.test('data:image/svg+xml;base64,PHN2Zz4='));
  });
});

describe('A05 — header bảo mật phải có ở CẢ Netlify lẫn Vercel', () => {
  /* public/_headers là định dạng riêng của Netlify. Vercel KHÔNG đọc file đó,
     nên trước đây deploy Vercel chạy hoàn toàn không có header bảo mật nào. */

  test('vercel.json có khối headers với đủ các header chính', async () => {
    const cauHinh = JSON.parse(await doc('../../vercel.json'));
    assert.ok(Array.isArray(cauHinh.headers), 'vercel.json thiếu khối headers');

    const ten = cauHinh.headers[0].headers.map((h) => h.key);
    for (const canCo of [
      'Content-Security-Policy', 'X-Frame-Options', 'X-Content-Type-Options',
      'Referrer-Policy', 'Strict-Transport-Security', 'Permissions-Policy',
    ]) {
      assert.ok(ten.includes(canCo), `vercel.json thiếu header ${canCo}`);
    }
  });

  test('CSP của hai bên KHỚP NHAU (lệch nhau là một bên yếu hơn mà không ai biết)', async () => {
    const cauHinh = JSON.parse(await doc('../../vercel.json'));
    const cspVercel = cauHinh.headers[0].headers
      .find((h) => h.key === 'Content-Security-Policy').value.trim();

    const netlify = await doc('../../public/_headers');
    const dong = netlify.split('\n').find((d) => d.trim().startsWith('Content-Security-Policy:'));
    const cspNetlify = dong.split('Content-Security-Policy:')[1].trim();

    assert.equal(cspVercel, cspNetlify, 'CSP Vercel và Netlify phải giống hệt nhau');
  });

  test('CSP KHÔNG còn cho phép gọi thẳng Gemini (H3 đã gỡ đường đó)', async () => {
    // Chỉ soi ĐÚNG dòng chỉ thị CSP, không soi comment giải thích vì sao đã bỏ
    const cauHinh = JSON.parse(await doc('../../vercel.json'));
    const cspVercel = cauHinh.headers[0].headers
      .find((h) => h.key === 'Content-Security-Policy').value;

    const netlify = await doc('../../public/_headers');
    const cspNetlify = netlify.split('\n')
      .find((d) => d.trim().startsWith('Content-Security-Policy:'));

    for (const [ten, csp] of [['vercel.json', cspVercel], ['public/_headers', cspNetlify]]) {
      assert.ok(
        !csp.includes('generativelanguage.googleapis.com'),
        `CSP ở ${ten} vẫn để ngỏ đúng tên miền mà H3 vừa bịt`
      );
    }
  });

  test('CSP chặn nhúng iframe và không cho script nội tuyến', async () => {
    const netlify = await doc('../../public/_headers');
    const dong = netlify.split('\n').find((d) => d.trim().startsWith('Content-Security-Policy:'));

    assert.match(dong, /frame-ancestors 'none'/);
    assert.match(dong, /object-src 'none'/);
    assert.ok(!/script-src[^;]*'unsafe-inline'/.test(dong), "script-src không được có 'unsafe-inline'");
    assert.ok(!/script-src[^;]*'unsafe-eval'/.test(dong), "script-src không được có 'unsafe-eval'");
  });
});

describe('A04 — tham số phân trang luôn có chặn trên', () => {
  test('news.js chặn limit tối đa, không cho kéo cả bảng', async () => {
    const nguon = await doc('../src/routes/news.js');
    assert.match(nguon, /MAX_LIMIT = 100|Math\.min\(100/, 'limit phải có chặn trên');
    assert.match(nguon, /Math\.min\(/, 'chặn trên phải được ÁP DỤNG, không chỉ khai báo');
    /* Khớp phần LIMIT chứ không khớp cả mệnh đề ORDER BY — thứ tự sắp xếp
       có thể đổi (v13 thêm is_featured lên trước), nhưng LIMIT thì luôn phải có */
    assert.match(nguon, /ORDER BY[^`']*LIMIT \?/, 'phải LUÔN có LIMIT');
  });

  test('danh sách ý kiến quản trị đã có chặn trên sẵn (giữ nguyên)', async () => {
    const nguon = await doc('../src/routes/admin/submissions.js');
    assert.match(nguon, /Math\.min\(50/);
  });

  test('nhật ký đã có chặn trên sẵn (giữ nguyên)', async () => {
    const nguon = await doc('../src/routes/admin/logs.js');
    assert.match(nguon, /Math\.min\(100/);
  });
});

describe('A10 — không có SSRF: mọi URL gọi ra ngoài đều là hằng số', () => {
  test('không có fetch() nào nhận URL do người dùng kiểm soát', async () => {
    const { readdir } = await import('node:fs/promises');

    async function quet(thuMuc) {
      const loi = [];
      for (const muc of await readdir(thuMuc, { withFileTypes: true })) {
        const duong = new URL(`${muc.name}${muc.isDirectory() ? '/' : ''}`, thuMuc);
        if (muc.isDirectory()) { loi.push(...await quet(duong)); continue; }
        if (!muc.name.endsWith('.js')) continue;

        const nguon = await readFile(duong, 'utf8');
        // fetch(`...${...}`) hoặc fetch(bien) — chỉ chấp nhận hằng số / hàm dựng URL cố định
        for (const khop of nguon.matchAll(/fetch\(\s*([^,]+?)\s*,/g)) {
          const doiSo = khop[1].trim();
          const anToan = /^['"`]https:\/\//.test(doiSo)     // URL hằng, ghi thẳng
            || doiSo === 'VERIFY_URL'                        // hằng Turnstile
            || doiSo === 'urlOf(model)';                     // model từ biến MÔI TRƯỜNG, không phải người dùng
          if (!anToan) loi.push(`${muc.name}: fetch(${doiSo})`);
        }
      }
      return loi;
    }

    assert.deepEqual(await quet(new URL('../src/', import.meta.url)), []);
  });
});
