/**
 * BUG-051 — CORS CHỈ MỞ CHO localhost KHI MÁY KHAI RÕ NODE_ENV=development
 * ============================================================================
 *
 * Danh sách origin CORS đi kèm `credentials: true`: origin nào lọt vào danh sách
 * thì trang chạy ở origin đó gọi được API bằng cookie phiên của trình duyệt và
 * ĐỌC được kết quả. Ba origin localhost (cổng 3000/4173/5173 của Vite) chỉ có
 * nghĩa trên máy lập trình. Máy chạy thật mà vẫn mở cho chúng thì một tiến trình
 * bất kỳ nghe ở các cổng đó trên máy cán bộ đọc được dữ liệu cán bộ.
 *
 * Quyết định F6 của người vận hành: chỉ đúng chuỗi "development" (chữ thường,
 * khai tường minh) mới được nới. Không đặt (Render không tự đặt NODE_ENV), "",
 * "production", "test", "Development"... đều là máy thật.
 *
 * Kiểm thật: fork NGUYÊN VĂN ba điểm khởi động (tệp nạp trước của lưới ma trận
 * quyền: CSDL giả, chặn gọi mạng ra ngoài, nghe cổng ngẫu nhiên), gọi bằng HTTP
 * cả preflight OPTIONS lẫn yêu cầu thật, đọc Access-Control-Allow-Origin và
 * Access-Control-Allow-Credentials.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { fork, spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { TEST_JWT_SECRET, TEST_PEPPER, TEST_ENCRYPTION_KEY } from './helpers-test.js';

const GOC = fileURLToPath(new URL('..', import.meta.url));
const NAP_TRUOC = pathToFileURL(fileURLToPath(new URL('./gia-lap/khoi-dong-ma-tran.js', import.meta.url))).href;
const DIEM_KHOI_DONG = ['src/index.js', 'src/may-chu-can-bo.js', 'src/may-chu-cong-khai.js'];

const LOCALHOST_DEV = ['http://localhost:3000', 'http://localhost:4173', 'http://localhost:5173'];
const ORIGIN_THAT = 'https://hop-thu.vi-du.gov.vn';
const ORIGIN_CAN_BO = 'https://can-bo.vi-du.gov.vn';

/* Không bao giờ được mở, kể cả ở máy development: danh sách là so khớp CHÍNH XÁC. */
const KHONG_BAO_GIO_MO = [
  'http://localhost:3000.evil.com',
  'http://localhost:3000@evil.com',
  'null',
  'http://localhost:8080',          // localhost cổng lạ
  'http://localhost',               // không cổng
  'http://127.0.0.1:3000',
  'http://[::1]:3000',
  'http://localhost:3000/',         // thừa dấu /
  'http://LOCALHOST:3000',          // hoa thường
  'https://localhost:3000',         // khác giao thức
  'https://evil.com',
];

const U = undefined;
/* Mọi giá trị KHÔNG phải đúng "development" là máy thật (F6). */
const MAY_THAT = [
  ['NODE_ENV không đặt', U],
  ['NODE_ENV=""', ''],
  ['NODE_ENV=production', 'production'],
  ['NODE_ENV=Production (hoa)', 'Production'],
  ['NODE_ENV=test', 'test'],
  ['NODE_ENV=Development (hoa)', 'Development'],
  ['NODE_ENV=DEVELOPMENT', 'DEVELOPMENT'],
  ['NODE_ENV=dev', 'dev'],
  ['NODE_ENV="development " (thừa dấu cách)', 'development '],
];

function moiTruongCon(them) {
  const giu = ['PATH', 'Path', 'SystemRoot', 'SYSTEMROOT', 'windir', 'TEMP', 'TMP', 'TMPDIR', 'HOME', 'USERPROFILE'];
  const env = {};
  for (const k of giu) if (process.env[k] !== undefined) env[k] = process.env[k];
  Object.assign(env, {
    JWT_SECRET: TEST_JWT_SECRET,
    HASH_PEPPER: TEST_PEPPER,
    ENCRYPTION_KEY: TEST_ENCRYPTION_KEY,
    /* BUG-002: máy thật thiếu khoá Turnstile thì không khởi động — khoá giả để máy lên được. */
    TURNSTILE_SECRET_KEY: 'khoa-turnstile-gia-bug-051',
    /* server/.env của máy không được lọt vào (dotenv không ghi đè biến đã có) */
    DOTENV_CONFIG_PATH: fileURLToPath(new URL('./gia-lap/khong-co-tep-nay.env', import.meta.url)),
    ADMIN_ALLOWED_IPS: '',
    CORS_ORIGIN: ORIGIN_THAT,
    ADMIN_CORS_ORIGIN: ORIGIN_CAN_BO,
  });
  for (const [k, v] of Object.entries(them)) {
    if (v === undefined) delete env[k]; else env[k] = v;
  }
  return env;
}

/**
 * Dựng một điểm khởi động -> { cong, dung() }.
 * index.js không gọi start() khi NODE_ENV=test (để bộ test nạp được module); ca đó nạp
 * NGUYÊN module rồi gọi listen — danh sách origin dựng lúc nạp module, nên vẫn đo đúng.
 */
function dung(tep, them) {
  return new Promise((ok, loi) => {
    const env = moiTruongCon(them);
    const con = (tep === 'src/index.js' && env.NODE_ENV === 'test')
      ? spawn(process.execPath, ['--import', NAP_TRUOC, '--input-type=module', '-e',
        "const m = await import('./src/index.js'); m.default.listen(0);"],
      { cwd: GOC, env, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] })
      : fork(tep, [], { cwd: GOC, env, execArgv: ['--import', NAP_TRUOC], stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
    let log = '';
    con.stdout.on('data', (d) => { log += d; });
    con.stderr.on('data', (d) => { log += d; });
    const hen = setTimeout(() => { con.kill(); loi(new Error(`${tep} không lên sau 60 s:\n${log.slice(-600)}`)); }, 60_000);
    con.once('exit', (ma) => { clearTimeout(hen); loi(new Error(`${tep} thoát (mã ${ma}) trước khi nghe cổng:\n${log.slice(-600)}`)); });
    con.on('message', (m) => {
      if (m?.loai !== 'san-sang') return;
      clearTimeout(hen);
      con.removeAllListeners('exit');
      ok({
        cong: m.cong,
        dung: () => new Promise((xong) => {
          con.once('exit', xong);
          con.send('dung');
          setTimeout(() => { con.kill(); xong(); }, 5_000).unref();
        }),
      });
    });
  });
}

/** Gọi preflight OPTIONS và yêu cầu GET thật với một Origin -> [{ kieu, ma, acao, acac }] */
async function goi(cong, duong, origin) {
  const hd = origin === undefined ? {} : { Origin: origin };
  const kq = [];
  const pre = await fetch(`http://127.0.0.1:${cong}${duong}`, {
    method: 'OPTIONS',
    headers: { ...hd, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type,authorization' },
  });
  await pre.arrayBuffer();
  kq.push({ kieu: 'OPTIONS', ma: pre.status, acao: pre.headers.get('access-control-allow-origin'), acac: pre.headers.get('access-control-allow-credentials') });
  const that = await fetch(`http://127.0.0.1:${cong}${duong}`, { headers: hd });
  await that.arrayBuffer();
  kq.push({ kieu: 'GET', ma: that.status, acao: that.headers.get('access-control-allow-origin'), acac: that.headers.get('access-control-allow-credentials') });
  return kq;
}

/* /api/auth/me là đúng kịch bản khai thác gốc (máy chủ công khai không có /api/auth — BUG-045 —
   nên ở đó chỉ còn đường không tồn tại; lớp CORS chạy trước mọi route nên vẫn đo được). */
const duongCua = (tep) => (tep === 'src/may-chu-cong-khai.js' ? ['/api/khong-ton-tai-bug-051'] : ['/api/auth/me', '/api/khong-ton-tai-bug-051']);

function phaiDong(kq, nhan) {
  for (const r of kq) {
    assert.equal(r.acao, null, `${nhan} ${r.kieu}: Access-Control-Allow-Origin = ${r.acao} (phải không có)`);
    assert.equal(r.acac, null, `${nhan} ${r.kieu}: Access-Control-Allow-Credentials = ${r.acac} (phải không có)`);
  }
}
function phaiMo(kq, origin, nhan) {
  for (const r of kq) {
    assert.equal(r.acao, origin, `${nhan} ${r.kieu}: Access-Control-Allow-Origin = ${r.acao} (phải = ${origin})`);
    assert.equal(r.acac, 'true', `${nhan} ${r.kieu}: Access-Control-Allow-Credentials = ${r.acac} (phải = true)`);
  }
}

describe('BUG-051: CORS localhost chỉ mở khi NODE_ENV=development — ba điểm khởi động, HTTP thật', () => {
  for (const tep of DIEM_KHOI_DONG) {
    test(`${tep}: máy thật (mọi NODE_ENV khác đúng "development") -> không mở cho localhost`, async () => {
      const may = await Promise.all(MAY_THAT.map(([, gt]) => dung(tep, { NODE_ENV: gt })));
      const sai = [];
      try {
        for (let i = 0; i < MAY_THAT.length; i++) {
          const [ten] = MAY_THAT[i];
          for (const duong of duongCua(tep)) {
            for (const o of [...LOCALHOST_DEV, ...KHONG_BAO_GIO_MO]) {
              try { phaiDong(await goi(may[i].cong, duong, o), `[${ten}] ${duong} Origin ${o}`); } catch (e) { sai.push(e.message); }
            }
            /* Đối chứng: origin khai ở CORS_ORIGIN vẫn mở, kèm credentials. */
            try { phaiMo(await goi(may[i].cong, duong, ORIGIN_THAT), ORIGIN_THAT, `[${ten}] ${duong} CORS_ORIGIN`); } catch (e) { sai.push(e.message); }
            /* Không có header Origin (curl, máy chủ gọi máy chủ): như cũ — không bị CORS chặn. */
            for (const r of await goi(may[i].cong, duong, undefined)) {
              if (r.ma === 403 || r.acao !== null) sai.push(`[${ten}] ${duong} không Origin ${r.kieu}: mã ${r.ma}, ACAO ${r.acao}`);
            }
          }
        }
      } finally {
        await Promise.all(may.map((m) => m.dung()));
      }
      assert.deepEqual(sai, [], `${sai.length} chỗ sai:\n${sai.slice(0, 40).join('\n')}`);
    });

    test(`${tep}: NODE_ENV=development -> mở đúng 3 origin localhost của Vite, không hơn`, async () => {
      const may = await dung(tep, { NODE_ENV: 'development' });
      const sai = [];
      try {
        for (const duong of duongCua(tep)) {
          for (const o of LOCALHOST_DEV) {
            try { phaiMo(await goi(may.cong, duong, o), o, `[development] ${duong} Origin ${o}`); } catch (e) { sai.push(e.message); }
          }
          for (const o of KHONG_BAO_GIO_MO) {
            try { phaiDong(await goi(may.cong, duong, o), `[development] ${duong} Origin ${o}`); } catch (e) { sai.push(e.message); }
          }
          try { phaiMo(await goi(may.cong, duong, ORIGIN_THAT), ORIGIN_THAT, `[development] ${duong} CORS_ORIGIN`); } catch (e) { sai.push(e.message); }
        }
      } finally {
        await may.dung();
      }
      assert.deepEqual(sai, [], `${sai.length} chỗ sai:\n${sai.join('\n')}`);
    });

    /* Bộ test và máy thật cần localhost thì KHAI TƯỜNG MINH qua CORS_ORIGIN (BUG-051 (f)). */
    test(`${tep}: NODE_ENV không đặt + CORS_ORIGIN khai rõ http://localhost:5173 -> chỉ origin đó mở`, async () => {
      const may = await dung(tep, { NODE_ENV: U, CORS_ORIGIN: 'http://localhost:5173' });
      try {
        const duong = duongCua(tep)[0];
        phaiMo(await goi(may.cong, duong, 'http://localhost:5173'), 'http://localhost:5173', 'CORS_ORIGIN khai rõ');
        phaiDong(await goi(may.cong, duong, 'http://localhost:3000'), 'localhost:3000 không khai');
      } finally {
        await may.dung();
      }
    });
  }

  test('src/may-chu-can-bo.js: ADMIN_CORS_ORIGIN vẫn mở cho trang cán bộ ở máy thật', async () => {
    const may = await dung('src/may-chu-can-bo.js', { NODE_ENV: U });
    try {
      phaiMo(await goi(may.cong, '/api/auth/me', ORIGIN_CAN_BO), ORIGIN_CAN_BO, 'ADMIN_CORS_ORIGIN');
    } finally {
      await may.dung();
    }
  });
});
