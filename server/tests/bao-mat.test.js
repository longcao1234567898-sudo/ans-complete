/**
 * KIỂM THỬ BA LỖ HỔNG BẢO MẬT ĐÃ VÁ
 * ============================================================================
 * Mục đích: canh không cho ba lỗi dưới đây tái diễn. Nếu ai sửa mã nguồn làm
 * hỏng một trong ba, bài kiểm thử sẽ đỏ ngay.
 *
 *   1. Router quản trị quên chặn xác thực
 *   2. Khoá ký phiên đăng nhập có giá trị dự phòng
 *   3. Địa chỉ IP đọc từ header do người gửi tự đặt
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');
const doc = (p) => fs.readFileSync(path.join(SRC, p), 'utf8');

describe('Bảo mật — chặn xác thực trang quản trị', () => {

  test('MỌI đường dẫn /api/admin đều qua requireAuth ở chỗ gắn router', () => {
    const s = doc('routes/admin/index.js');
    assert.match(s, /import \{[^}]*requireAuth[^}]*\} from/,
      'index.js phải import requireAuth');
    assert.match(s, /router\.use\(requireAuth\)/,
      'index.js PHẢI gọi router.use(requireAuth) — đây là tuyến phòng thủ chính. '
      + 'Thiếu dòng này thì router con nào quên chặn sẽ mở ra Internet.');

    /* Thứ tự quan trọng: chặn phải đứng TRƯỚC mọi router con.
       Express chạy middleware theo đúng thứ tự khai báo. */
    const viTriChan = s.indexOf('router.use(requireAuth)');
    const viTriRouterDau = s.search(/router\.use\('\//);
    assert.ok(viTriChan >= 0 && viTriChan < viTriRouterDau,
      'router.use(requireAuth) phải đặt TRƯỚC các router con, nếu không sẽ vô tác dụng');
  });

  /* Từng router con cũng phải tự chặn — phòng khi được gắn ở chỗ khác.
     trash.js và kiosk.js từng thiếu, khiến bất kỳ ai đọc được toàn bộ tin báo
     đã xoá kèm danh tính người tố giác, và chèn được tin báo giả. */
  const ROUTER = ['submissions', 'dashboard', 'banned-words', 'staff',
                  'reports', 'logs', 'kiosk', 'trash'];

  for (const ten of ROUTER) {
    test(`${ten}.js — có import VÀ có gọi requireAuth`, () => {
      const s = doc(`routes/admin/${ten}.js`);

      assert.match(s, /^import \{[^}]*requireAuth[^}]*\} from/m,
        `${ten}.js phải IMPORT requireAuth`);

      /* Bỏ hết chú thích trước khi kiểm — trash.js và kiosk.js từng nhắc
         requireAuth trong chú thích ("Route nằm sau requireAuth") mà không hề
         gọi. Chú thích khẳng định một tính chất an toàn không tồn tại còn
         nguy hiểm hơn là không viết gì. */
      const khongChuThich = s
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/[^\n]*/g, '');

      assert.match(khongChuThich, /router\.use\(\s*requireAuth/,
        `${ten}.js phải GỌI router.use(requireAuth) — import không thôi là vô nghĩa`);
    });
  }
});

describe('Bảo mật — khoá ký phiên đăng nhập', () => {

  test('token.js KHÔNG được có giá trị dự phòng cho JWT_SECRET', () => {
    const s = doc('lib/token.js');
    const khongChuThich = s
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '');

    /* Chỉ cấm giá trị dự phòng KHÁC RỖNG.
       `(process.env.JWT_SECRET || '')` là hợp lệ — chuỗi rỗng rồi sẽ bị chặn ở
       bước kiểm tra bên dưới. Còn `|| 'abc'` mới là giá trị dự phòng thật. */
    assert.doesNotMatch(khongChuThich, /process\.env\.JWT_SECRET\s*\|\|\s*['"`][^'"`]+['"`]/,
      'JWT_SECRET không được có giá trị dự phòng khác rỗng. Giá trị đó nằm trong '
      + 'mã nguồn công khai, ai đọc được cũng tự ký được token quản trị.');

    // Và phải ném lỗi khi thiếu, chứ không âm thầm chạy tiếp
    assert.match(khongChuThich, /throw new Error/,
      'token.js phải NÉM LỖI khi thiếu khoá, không được chạy tiếp');
  });

  async function napVoi(bimat) {
    process.env.JWT_SECRET = bimat;
    // Thêm tham số ngẫu nhiên để Node nạp lại module thay vì dùng bản nhớ sẵn
    return import(`../src/lib/token.js?v=${Math.random()}`);
  }

  test('thiếu khoá -> KHÔNG khởi động được', async () => {
    await assert.rejects(() => napVoi(''), /THIẾU JWT_SECRET/);
  });

  test('khoá quá ngắn -> KHÔNG khởi động được', async () => {
    await assert.rejects(() => napVoi('abc123'), /quá ngắn/);
  });

  test('đúng chuỗi dự phòng cũ -> KHÔNG khởi động được', async () => {
    /* Chuỗi này dài 29 ký tự nên bị chặn ngay ở bước kiểm độ dài, trước cả
       bước kiểm danh sách cấm. Chặn bằng đường nào cũng được, miễn là chặn. */
    await assert.rejects(
      () => napVoi('doi-secret-nay-trong-file-env'),
      /quá ngắn|mặc định|ví dụ/
    );
  });

  test('thêm ký tự vào chuỗi cấm cũng KHÔNG lọt qua', async () => {
    /* Danh sách cấm so khớp kiểu "có chứa", nên nối thêm ký tự vẫn bị bắt. */
    await assert.rejects(
      () => napVoi('doi-secret-nay-trong-file-env-them-vai-ky-tu-cho-du-dai'),
      /mặc định/
    );
    await assert.rejects(() => napVoi('changeme'.padEnd(40, 'z')), /mặc định/);
  });

  test('chuỗi dài nhưng lặp một ký tự -> KHÔNG khởi động được', async () => {
    /* Đây là lỗ hổng mà danh sách cấm không bắt được: đủ dài, không nằm trong
       danh sách, nhưng dò ra trong vài giây. */
    await assert.rejects(() => napVoi('a'.repeat(64)), /dễ đoán|ký tự khác nhau/);
    await assert.rejects(() => napVoi('abab'.repeat(16)), /dễ đoán|ký tự khác nhau/);
  });

  test('khoá hợp lệ -> ký và xác minh được', async () => {
    const m = await napVoi('3f8a1c9e2b7d4056af13e8c25d90b467a2c58e1f3b74d902e6a8c41f57b03d9e2');
    const token = m.signAccessToken({ id: 1, username: 'test', role: 'admin', full_name: 'Test' });
    const kq = m.verifyAccessToken(token);
    assert.equal(kq.username, 'test');
    assert.equal(kq.role, 'admin');
  });
});

describe('Bảo mật — địa chỉ IP không được để người gửi tự đặt', () => {

  /* Header X-Forwarded-For là danh sách nối dài. Render NỐI THÊM IP thật vào
     CUỐI. Lấy phần tử [0] tức lấy đúng phần người gửi tự điền -> giả được IP
     bất kỳ -> vô hiệu toàn bộ chống spam và làm sai lệch nhật ký. */
  const FILE = [
    'routes/submissions.js', 'routes/tracking.js', 'routes/otp.js',
    'routes/auth.js', 'routes/admin/submissions.js',
    'routes/admin/trash.js', 'routes/admin/kiosk.js',
  ];

  for (const f of FILE) {
    test(`${f} — không đọc thẳng header x-forwarded-for`, () => {
      const khongChuThich = doc(f)
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/[^\n]*/g, '');

      assert.doesNotMatch(khongChuThich, /req\.headers\[['"]x-forwarded-for['"]\]/i,
        `${f} phải dùng layIpThat(req) thay vì đọc header. `
        + 'Header đó do người gửi tự đặt, giả được.');
    });
  }

  test('có hàm layIpThat dùng req.ip', async () => {
    const m = await import('../src/lib/helpers.js');
    assert.equal(typeof m.layIpThat, 'function');

    // Giả lập: Express đã lọc đúng, req.ip là IP thật
    assert.equal(m.layIpThat({ ip: '203.0.113.7' }), '203.0.113.7');
    assert.equal(m.layIpThat({}), '');
    assert.equal(m.layIpThat(null), '');

    // Dù người gửi có tự đặt header, hàm này KHÔNG đọc tới
    assert.equal(
      m.layIpThat({ ip: '203.0.113.7', headers: { 'x-forwarded-for': '1.2.3.4' } }),
      '203.0.113.7',
      'layIpThat phải bỏ qua header do người gửi đặt'
    );
  });

  test('máy chủ có bật trust proxy — nếu không req.ip cũng sai', () => {
    assert.match(doc('index.js'), /app\.set\(\s*['"]trust proxy['"]/,
      'Thiếu app.set("trust proxy", 1) thì req.ip trả về IP của proxy Render, '
      + 'mọi người dùng sẽ chung một IP.');
  });
});
