/**
 * BUG-002 — LỚP CHỐNG DÒ MẬT KHẨU CÁN BỘ KHÔNG ĐƯỢC TỰ TẮT
 * ============================================================================
 *
 * Dự án cố ý KHÔNG khoá tài khoản khi sai mật khẩu (test G5, khong-duoc-pha):
 * lớp thay thế là bắt CAPTCHA Turnstile sau 3 lần sai. Lớp đó chỉ có nghĩa khi
 * nó CHẶN được — nên mọi đường "không xác minh được" đều phải là TỪ CHỐI:
 *
 *   · Máy chạy thật thiếu TURNSTILE_SECRET_KEY (rỗng, toàn khoảng trắng,
 *     NODE_ENV không đặt như Render, NODE_ENV viết hoa...) -> máy chủ KHÔNG
 *     khởi động, ở CẢ BA điểm khởi động. Chỉ máy khai rõ development mới được
 *     chạy không khoá (kèm cảnh báo đỏ). Quyết định D5 của người vận hành.
 *   · Có khoá mà Cloudflare không trả lời được (lỗi mạng, hết giờ, trả trang
 *     lỗi, trả dữ liệu lạ) -> từ chối, không cho qua (D5).
 *   · captchaToken thiếu / rỗng -> từ chối, không gọi Cloudflare.
 *
 * Kiểm thật: dựng máy chủ Express với router thật, gọi qua HTTP; ba điểm khởi
 * động được fork nguyên văn (tệp nạp trước của lưới ma trận quyền: CSDL giả,
 * chặn gọi mạng ra ngoài, nghe cổng ngẫu nhiên).
 */
import { describe, test, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { readFile, readdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import express from 'express';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { datBienMoiTruongHopLe, TEST_JWT_SECRET, TEST_PEPPER, TEST_ENCRYPTION_KEY } from './helpers-test.js';

datBienMoiTruongHopLe();

const { pool } = await import('../src/db.js');
const { default: authRouter } = await import('../src/routes/auth.js');
const { default: congVaoRouter } = await import('../src/routes/cong-vao.js');
const { verifyTurnstile } = await import('../src/lib/turnstile.js');

const KHOA = 'khoa-turnstile-thu-nghiem-bug-002';
const MAT_KHAU = 'mat-khau-dung-cua-can-bo-4';
const HASH = bcrypt.hashSync(MAT_KHAU, 4);

/* ---------------- Cloudflare giả ----------------
   cheDoCf quyết định Cloudflare "trả lời" thế nào; mọi địa chỉ khác đi fetch thật
   (test gọi máy chủ Express của chính nó qua 127.0.0.1). */
const fetchThat = globalThis.fetch;
let cheDoCf = 'that';
let soLanGoiCf = 0;
const CHE_DO_HONG = {
  'loi-mang': () => { throw new TypeError('fetch failed'); },
  'het-gio': () => { throw new DOMException('The operation was aborted due to timeout', 'TimeoutError'); },
  'trang-loi-502': () => new Response('<html>502 Bad Gateway</html>', { status: 502, headers: { 'Content-Type': 'text/html' } }),
  'success-chuoi': () => Response.json({ success: 'false' }),
  'success-thieu': () => Response.json({ 'error-codes': ['internal-error'] }),
};
before(() => {
  globalThis.fetch = async (url, opts) => {
    if (String(url).includes('challenges.cloudflare.com')) {
      soLanGoiCf++;
      if (cheDoCf === 'that') {
        const token = new URLSearchParams(String(opts.body)).get('response');
        return Response.json({ success: token === 'that' });
      }
      return CHE_DO_HONG[cheDoCf]();
    }
    return fetchThat(url, opts);
  };
});
after(() => { globalThis.fetch = fetchThat; });

/* ---------------- CSDL giả cho route đăng nhập ---------------- */
let soLanSai = 0;
let daCapPhien = false;
const queryGoc = pool.query.bind(pool);
before(() => {
  pool.query = async (sql) => {
    const s = String(sql);
    if (/FROM staff WHERE username/.test(s)) {
      return [[{ id: 4, full_name: 'Cán bộ Bốn', username: 'cb4', password_hash: HASH, role: 'handler',
        is_active: 1, failed_attempts: soLanSai, locked_until: null }]];
    }
    if (/INSERT INTO refresh_tokens/.test(s)) daCapPhien = true;
    return [{ affectedRows: 1, insertId: 1 }];
  };
});
after(() => { pool.query = queryGoc; });

let cu;
beforeEach(() => {
  cu = { NODE_ENV: process.env.NODE_ENV, KHOA: process.env.TURNSTILE_SECRET_KEY };
  process.env.TURNSTILE_SECRET_KEY = KHOA;
  cheDoCf = 'that';
  soLanGoiCf = 0;
  soLanSai = 0;
  daCapPhien = false;
});
afterEach(() => {
  for (const [k, v] of [['NODE_ENV', cu.NODE_ENV], ['TURNSTILE_SECRET_KEY', cu.KHOA]]) {
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
});

const veVaoCua = () => jwt.sign({ purpose: 'cong_vao' }, TEST_JWT_SECRET, { expiresIn: '6h', jwtid: crypto.randomUUID() });

/* Mỗi lượt gọi một địa chỉ riêng: loginLimiter (5 lần / 15 phút / IP) là lớp KHÁC, không
   phải thứ test này đo — để nó chặn thì test đỏ vì 429 chứ không vì CAPTCHA. */
let soIp = 0;
async function goiHttp(duongGoc, router, duong, body) {
  const app = express();
  app.set('trust proxy', true);
  app.use(express.json());
  app.use(cookieParser());
  app.use(duongGoc, router);
  const sv = app.listen(0, '127.0.0.1');
  await new Promise((ok) => sv.once('listening', ok));
  try {
    const r = await fetch(`http://127.0.0.1:${sv.address().port}${duongGoc}${duong}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': `198.51.100.${++soIp % 250}` },
      body: JSON.stringify(body),
    });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  } finally { sv.close(); }
}
const dangNhap = (body) => goiHttp('/api/auth', authRouter, '/login', { username: 'cb4', ...body });
const xinVe = (body) => goiHttp('/api/cong-vao', congVaoRouter, '/xac-minh', body);

/* ============================================================================
   (b) CÓ KHOÁ MÀ CLOUDFLARE KHÔNG XÁC NHẬN ĐƯỢC -> TỪ CHỐI
   ============================================================================ */
describe('BUG-002 (b): Cloudflare không xác nhận được thì từ chối', () => {
  for (const cheDo of Object.keys(CHE_DO_HONG)) {
    test(`verifyTurnstile — Cloudflare "${cheDo}" -> ok: false`, async () => {
      cheDoCf = cheDo;
      const kq = await verifyTurnstile('token-bat-ky', '203.0.113.7');
      assert.equal(kq.ok, false, `Cloudflare "${cheDo}" mà vẫn cho qua`);
      assert.equal(soLanGoiCf, 1, 'phải thật sự hỏi Cloudflare');
    });

    test(`đăng nhập sau 3 lần sai, Cloudflare "${cheDo}", ĐÚNG mật khẩu -> 401 canCaptcha, không cấp phiên`, async () => {
      cheDoCf = cheDo;
      soLanSai = 3;
      const r = await dangNhap({ password: MAT_KHAU, veVaoCua: veVaoCua(), captchaToken: 'token-bat-ky' });
      assert.equal(r.status, 401, `Cloudflare "${cheDo}" mà đăng nhập được: ${JSON.stringify(r.body)}`);
      assert.equal(r.body.canCaptcha, true);
      assert.equal(r.body.accessToken, undefined);
      assert.equal(daCapPhien, false, 'đã cấp refresh token');
    });
  }

  test('cổng vào, giao diện cũ gửi captchaToken (không có vé), Cloudflare lỗi mạng -> 403 CAN_XAC_MINH', async () => {
    cheDoCf = 'loi-mang';
    const r = await dangNhap({ password: MAT_KHAU, captchaToken: 'token-bat-ky' });
    assert.equal(r.status, 403, JSON.stringify(r.body));
    assert.equal(r.body.code, 'CAN_XAC_MINH');
    assert.equal(daCapPhien, false);
  });

  test('xin vé cổng vào, Cloudflare lỗi mạng -> 400, không có vé', async () => {
    cheDoCf = 'loi-mang';
    const r = await xinVe({ captchaToken: 'token-bat-ky' });
    assert.equal(r.status, 400, JSON.stringify(r.body));
    assert.equal(r.body.ve, undefined);
  });

  test('đối chứng: Cloudflare xác nhận "that" + đúng mật khẩu -> 200 (khung test không chặn oan)', async () => {
    soLanSai = 3;
    const r = await dangNhap({ password: MAT_KHAU, veVaoCua: veVaoCua(), captchaToken: 'that' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.ok(r.body.accessToken);
    assert.equal(daCapPhien, true);
  });
});

/* ============================================================================
   (c) captchaToken THIẾU HOẶC RỖNG -> TỪ CHỐI, KHÔNG GỌI CLOUDFLARE
   ============================================================================ */
describe('BUG-002 (c): captchaToken thiếu hoặc rỗng', () => {
  for (const [ten, them] of [['thiếu hẳn trường', {}], ['chuỗi rỗng', { captchaToken: '' }]]) {
    test(`sau 3 lần sai, ${ten}, đúng mật khẩu -> 401, không hỏi Cloudflare`, async () => {
      soLanSai = 3;
      const r = await dangNhap({ password: MAT_KHAU, veVaoCua: veVaoCua(), ...them });
      assert.equal(r.status, 401, JSON.stringify(r.body));
      assert.equal(r.body.canCaptcha, true);
      assert.equal(daCapPhien, false);
      assert.equal(soLanGoiCf, 0);
    });
  }
});

/* ============================================================================
   (a) THIẾU KHOÁ LÚC CHẠY (phòng khi có lối khởi động bỏ qua bước kiểm)
   ============================================================================ */
describe('BUG-002 (a): thiếu khoá lúc chạy — chỉ development mới được bỏ qua', () => {
  const MOI_TRUONG = [['không đặt (Render)', undefined], ['production', 'production'],
    ['Production (hoa)', 'Production'], ['test', 'test'], ['Development (hoa)', 'Development']];
  for (const [tenMt, nodeEnv] of MOI_TRUONG) {
    for (const [tenKhoa, khoa] of [['không có', undefined], ['rỗng', ''], ['toàn khoảng trắng', '  \t ']]) {
      test(`NODE_ENV ${tenMt}, khoá ${tenKhoa}: đăng nhập sau 3 lần sai, không captcha -> 401`, async () => {
        if (nodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = nodeEnv;
        if (khoa === undefined) delete process.env.TURNSTILE_SECRET_KEY; else process.env.TURNSTILE_SECRET_KEY = khoa;
        soLanSai = 3;
        assert.equal((await verifyTurnstile(undefined, '203.0.113.7')).ok, false);
        const r = await dangNhap({ password: MAT_KHAU });
        assert.equal(r.status, 401, JSON.stringify(r.body));
        assert.equal(daCapPhien, false);
      });
    }
  }

  test('NODE_ENV development, không khoá: vẫn bỏ qua như cũ (máy cá nhân)', async () => {
    process.env.NODE_ENV = 'development';
    delete process.env.TURNSTILE_SECRET_KEY;
    soLanSai = 3;
    const r = await dangNhap({ password: MAT_KHAU });
    assert.equal(r.status, 200, JSON.stringify(r.body));
  });
});

/* ============================================================================
   (a) + (d) BA ĐIỂM KHỞI ĐỘNG: MÁY THẬT THIẾU KHOÁ THÌ KHÔNG KHỞI ĐỘNG
   ============================================================================ */
const GOC = fileURLToPath(new URL('..', import.meta.url));
const NAP_TRUOC = pathToFileURL(fileURLToPath(new URL('./gia-lap/khoi-dong-ma-tran.js', import.meta.url))).href;
const DIEM_KHOI_DONG = ['src/index.js', 'src/may-chu-can-bo.js', 'src/may-chu-cong-khai.js'];

function moiTruongCon(them) {
  const giu = ['PATH', 'Path', 'SystemRoot', 'SYSTEMROOT', 'windir', 'TEMP', 'TMP', 'TMPDIR', 'HOME', 'USERPROFILE'];
  const env = {};
  for (const k of giu) if (process.env[k] !== undefined) env[k] = process.env[k];
  Object.assign(env, {
    JWT_SECRET: TEST_JWT_SECRET,
    HASH_PEPPER: TEST_PEPPER,
    ENCRYPTION_KEY: TEST_ENCRYPTION_KEY,
    /* server/.env của máy không được lọt vào (dotenv không ghi đè biến đã có) */
    DOTENV_CONFIG_PATH: fileURLToPath(new URL('./gia-lap/khong-co-tep-nay.env', import.meta.url)),
    ADMIN_ALLOWED_IPS: '',
  });
  for (const [k, v] of Object.entries(them)) {
    if (v === undefined) delete env[k]; else env[k] = v;
  }
  return env;
}

/** -> { daNghe: boolean, maThoat: number|null, log: string } */
function chay(tep, them, coThem = []) {
  return new Promise((ok) => {
    const con = fork(tep, [], {
      cwd: GOC, env: moiTruongCon(them), execArgv: [...coThem, '--import', NAP_TRUOC], stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    });
    let log = '';
    con.stdout.on('data', (d) => { log += d; });
    con.stderr.on('data', (d) => { log += d; });
    const hen = setTimeout(() => { con.kill(); ok({ daNghe: false, maThoat: 'treo', log }); }, 60_000);
    con.on('message', (m) => {
      if (m?.loai !== 'san-sang') return;
      clearTimeout(hen);
      con.removeAllListeners('exit');
      con.once('exit', () => ok({ daNghe: true, maThoat: null, log }));
      con.send('dung');
      setTimeout(() => con.kill(), 5_000).unref();
    });
    con.once('exit', (ma) => { clearTimeout(hen); ok({ daNghe: false, maThoat: ma, log }); });
  });
}

const TU_CHOI = [
  ['NODE_ENV không đặt, không có biến khoá', { NODE_ENV: undefined, TURNSTILE_SECRET_KEY: undefined }],
  ['NODE_ENV không đặt, khoá rỗng', { NODE_ENV: undefined, TURNSTILE_SECRET_KEY: '' }],
  ['NODE_ENV không đặt, khoá toàn khoảng trắng', { NODE_ENV: undefined, TURNSTILE_SECRET_KEY: '   ' }],
  ['NODE_ENV=production', { NODE_ENV: 'production', TURNSTILE_SECRET_KEY: undefined }],
  ['NODE_ENV=Production (hoa)', { NODE_ENV: 'Production', TURNSTILE_SECRET_KEY: undefined }],
  ['NODE_ENV=Development (hoa)', { NODE_ENV: 'Development', TURNSTILE_SECRET_KEY: undefined }],
  ['NODE_ENV=test', { NODE_ENV: 'test', TURNSTILE_SECRET_KEY: undefined }],
];

describe('BUG-002 (a)(d): ba điểm khởi động — máy thật thiếu khoá thì không khởi động', () => {
  for (const tep of DIEM_KHOI_DONG) {
    test(`${tep}: thiếu khoá -> thoát mã khác 0, không nghe cổng, báo tên biến`, async () => {
      /* index.js không gọi start() khi NODE_ENV=test (để bộ test nạp được) — trường hợp đó
         không có máy chủ nào nghe cổng, không áp dụng. */
      const ca = TU_CHOI.filter(([, mt]) => !(tep === 'src/index.js' && mt.NODE_ENV === 'test'));
      const kq = await Promise.all(ca.map(([, mt]) => chay(tep, mt)));
      ca.forEach(([ten], i) => {
        assert.equal(kq[i].daNghe, false, `${tep} [${ten}] VẪN KHỞI ĐỘNG:\n${kq[i].log.slice(-600)}`);
        assert.notEqual(kq[i].maThoat, 0, `${tep} [${ten}] thoát mã 0`);
        assert.notEqual(kq[i].maThoat, 'treo', `${tep} [${ten}] treo, không thoát:\n${kq[i].log.slice(-600)}`);
        assert.match(kq[i].log, /TURNSTILE_SECRET_KEY/, `${tep} [${ten}] không nói thiếu biến nào`);
      });
    });

    test(`${tep}: NODE_ENV=development không khoá -> chạy, có cảnh báo đỏ; có khoá -> chạy`, async () => {
      const [dev, coKhoa] = await Promise.all([
        chay(tep, { NODE_ENV: 'development', TURNSTILE_SECRET_KEY: undefined }),
        chay(tep, { NODE_ENV: undefined, TURNSTILE_SECRET_KEY: 'khoa-that-gia' }),
      ]);
      assert.equal(dev.daNghe, true, `development không khoá phải chạy được:\n${dev.log.slice(-600)}`);
      assert.match(dev.log, /🔴[^\n]*TURNSTILE_SECRET_KEY|TURNSTILE_SECRET_KEY[^\n]*🔴/u, 'development không khoá phải có cảnh báo đỏ');
      assert.equal(coKhoa.daNghe, true, `có khoá phải chạy được:\n${coKhoa.log.slice(-600)}`);
    });
  }

  /* Trọng tài B11: lối miễn duy nhất là NODE_ENV=development — mà nếu chính tệp mẫu đặt sẵn
     giá trị đó thì "khai rõ" không còn là khai rõ. README hướng dẫn `cp .env.example .env` rồi
     chỉ điền ba khoá: làm đúng như vậy trên máy thật thì phải bị từ chối khởi động. */
  test('chép nguyên server/.env.example, chỉ điền ba khoá bắt buộc -> cả ba điểm khởi động từ chối', async () => {
    const mau = await readFile(new URL('../.env.example', import.meta.url), 'utf8');
    const dien = mau
      .replace(/^JWT_SECRET=.*$/m, `JWT_SECRET=${TEST_JWT_SECRET}`)
      .replace(/^ENCRYPTION_KEY=.*$/m, `ENCRYPTION_KEY=${TEST_ENCRYPTION_KEY}`)
      .replace(/^HASH_PEPPER=.*$/m, `HASH_PEPPER=${TEST_PEPPER}`);
    const thuMucTam = await mkdtemp(path.join(tmpdir(), 'bug002-env-'));
    const tepEnv = path.join(thuMucTam, '.env');
    await writeFile(tepEnv, dien);
    /* Ba khoá và các biến khác chỉ đến từ tệp đã chép — không đặt sẵn trong môi trường. */
    const them = { DOTENV_CONFIG_PATH: tepEnv, JWT_SECRET: undefined, HASH_PEPPER: undefined,
      ENCRYPTION_KEY: undefined, NODE_ENV: undefined, TURNSTILE_SECRET_KEY: undefined, ADMIN_ALLOWED_IPS: undefined };
    let kq;
    try {
      kq = await Promise.all(DIEM_KHOI_DONG.map((tep) => chay(tep, them)));
    } finally {
      await rm(thuMucTam, { recursive: true, force: true });
    }
    DIEM_KHOI_DONG.forEach((tep, i) => {
      assert.equal(kq[i].daNghe, false, `${tep} chạy được từ tệp mẫu chép nguyên:\n${kq[i].log.slice(-600)}`);
      assert.match(kq[i].log, /THIẾU TURNSTILE_SECRET_KEY/, `${tep} không từ chối vì thiếu khoá:\n${kq[i].log.slice(-600)}`);
    });
  });

  /* code-review: từ chối khởi động không được dựa vào cách Node xử lý unhandledRejection mặc
     định — chạy với --unhandled-rejections=warn thì start() ném lỗi chỉ thành một dòng cảnh báo. */
  test('chạy với --unhandled-rejections=warn, thiếu khoá -> cả ba điểm khởi động vẫn THOÁT mã khác 0', async () => {
    const kq = await Promise.all(DIEM_KHOI_DONG.map((tep) =>
      chay(tep, { NODE_ENV: undefined, TURNSTILE_SECRET_KEY: undefined }, ['--unhandled-rejections=warn'])));
    DIEM_KHOI_DONG.forEach((tep, i) => {
      assert.equal(kq[i].daNghe, false, `${tep} vẫn nghe cổng:\n${kq[i].log.slice(-400)}`);
      assert.ok(kq[i].maThoat !== 0 && kq[i].maThoat !== 'treo', `${tep} mã thoát ${kq[i].maThoat}:\n${kq[i].log.slice(-400)}`);
    });
  });

  test('MỌI tệp trong src/ có .listen( đều kiểm khoá TRƯỚC khi nghe cổng (điểm khởi động thứ tư không lọt)', async () => {
    const thuMuc = fileURLToPath(new URL('../src/', import.meta.url));
    const tep = (await readdir(thuMuc, { recursive: true })).filter((f) => f.endsWith('.js'));
    let soTepNghe = 0;
    for (const f of tep) {
      const ma = await readFile(path.join(thuMuc, f), 'utf8');
      const viTriNghe = ma.search(/\.listen\(/);
      if (viTriNghe < 0) continue;
      soTepNghe++;
      const viTriKiem = ma.search(/kiemKhoaTurnstileKhiKhoiDong\(\)/);
      assert.ok(viTriKiem >= 0 && viTriKiem < viTriNghe, `${f} nghe cổng mà không gọi kiemKhoaTurnstileKhiKhoiDong() trước`);
    }
    assert.ok(soTepNghe >= 3, `chỉ thấy ${soTepNghe} tệp nghe cổng — biểu thức tìm đã hỏng?`);
  });
});
