/**
 * BUG-049 — /api/health CÔNG KHAI CHỈ TRẢ {ok, db}
 * ============================================================================
 *
 * /api/health là đường ai cũng gọi được (Render dùng để kiểm sống, giao diện dùng để
 * đưa người dân sang trang dự phòng có số 113 khi kho chết — kiemTraMayChu, ND-084).
 * Trước đây nó trả thêm phiên bản, tên máy chủ, AI bật chưa, và MÃ HOÁ DANH TÍNH BẬT
 * CHƯA — kẻ tấn công nhìn là biết máy nào cấu hình yếu, bản nào chưa vá.
 *
 * Yêu cầu: thân trả lời đúng hai khoá `ok`, `db` (allow-list, luật 5 — không phải "bỏ
 * mấy khoá kia"), mã 200 kể cả khi kho chết. Không có cách nào lấy chi tiết qua HTTP —
 * kể cả gửi X-Forwarded-For mang IP trong ADMIN_ALLOWED_IPS khi gọi thẳng cổng (luật 3:
 * `trust proxy 1` tin chặng đầu, gọi thẳng cổng thì req.ip là IP tự khai).
 *
 * Chi tiết chuyển sang NHẬT KÝ KHỞI ĐỘNG của từng máy (người vận hành chọn, P123): chỉ
 * người quản trị máy đọc được, và máy nào tự báo cho chính nó — máy công khai là máy mã
 * hoá danh tính, nên phải tự in trạng thái mã hoá của mình.
 *
 * Kiểm thật: fork NGUYÊN VĂN ba điểm khởi động (tệp nạp trước của lưới ma trận quyền:
 * CSDL giả, chặn gọi mạng ra ngoài, nghe cổng ngẫu nhiên), gọi bằng HTTP.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { TEST_JWT_SECRET, TEST_PEPPER, TEST_ENCRYPTION_KEY } from './helpers-test.js';

const GOC = fileURLToPath(new URL('..', import.meta.url));
const NAP_TRUOC = pathToFileURL(fileURLToPath(new URL('./gia-lap/khoi-dong-ma-tran.js', import.meta.url))).href;
const DIEM_KHOI_DONG = ['src/index.js', 'src/may-chu-can-bo.js', 'src/may-chu-cong-khai.js'];

const IP_CO_QUAN = '10.9.8.7';
const KHOA_DUOC_PHEP = ['db', 'ok'];

function moiTruongCon(them) {
  const giu = ['PATH', 'Path', 'SystemRoot', 'SYSTEMROOT', 'windir', 'TEMP', 'TMP', 'TMPDIR', 'HOME', 'USERPROFILE'];
  const env = {};
  for (const k of giu) if (process.env[k] !== undefined) env[k] = process.env[k];
  Object.assign(env, {
    JWT_SECRET: TEST_JWT_SECRET,
    HASH_PEPPER: TEST_PEPPER,
    ENCRYPTION_KEY: TEST_ENCRYPTION_KEY,
    /* BUG-002: máy thật thiếu khoá Turnstile thì không khởi động — khoá giả để máy lên được. */
    TURNSTILE_SECRET_KEY: 'khoa-turnstile-gia-bug-049',
    /* server/.env của máy không được lọt vào (dotenv không ghi đè biến đã có) */
    DOTENV_CONFIG_PATH: fileURLToPath(new URL('./gia-lap/khong-co-tep-nay.env', import.meta.url)),
    /* Có khoá AI giả: nếu health còn trả `ai` thì nó là true — dễ thấy trong output đỏ. */
    GEMINI_API_KEY: 'khoa-ai-gia-bug-049',
    ADMIN_ALLOWED_IPS: '',
  });
  for (const [k, v] of Object.entries(them)) {
    if (v === undefined) delete env[k]; else env[k] = v;
  }
  return env;
}

/** Dựng một điểm khởi động (NODE_ENV không đặt = máy thật, start() chạy) -> { cong, log(), dung() } */
function dung(tep, them = {}) {
  return new Promise((ok, loi) => {
    const con = fork(tep, [], {
      cwd: GOC, env: moiTruongCon(them), execArgv: ['--import', NAP_TRUOC], stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    });
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
        log: () => log,
        dung: () => new Promise((xong) => {
          con.once('exit', xong);
          con.send('dung');
          setTimeout(() => { con.kill(); xong(); }, 5_000).unref();
        }),
      });
    });
  });
}

/** Chờ nhật ký có đủ dòng khởi động (callback của listen chạy ngay sau khi báo sẵn sàng). */
async function choLog(may, mau, msToiDa = 5_000) {
  const t0 = Date.now();
  while (Date.now() - t0 < msToiDa) {
    if (mau.every((m) => m.test(may.log()))) return may.log();
    await new Promise((r) => setTimeout(r, 50));
  }
  return may.log();
}

async function goi(cong, duong, { method = 'GET', headers = {} } = {}) {
  const r = await fetch(`http://127.0.0.1:${cong}${duong}`, { method, headers });
  const chu = await r.text();
  let j = null;
  try { j = chu ? JSON.parse(chu) : null; } catch { /* không phải JSON */ }
  return { ma: r.status, chu, j };
}

function chiOkDb(kq, nhan, dbMongDoi) {
  assert.equal(kq.ma, 200, `${nhan}: mã phải là 200 (Render kiểm sống) — được ${kq.ma}`);
  assert.ok(kq.j && typeof kq.j === 'object', `${nhan}: thân không phải JSON: ${kq.chu.slice(0, 200)}`);
  assert.deepEqual(Object.keys(kq.j).sort(), KHOA_DUOC_PHEP,
    `${nhan}: chỉ được có khoá ${KHOA_DUOC_PHEP.join(', ')} — thân thật: ${kq.chu}`);
  assert.equal(kq.j.db, dbMongDoi, `${nhan}: db phải là ${dbMongDoi} — thân thật: ${kq.chu}`);
  assert.equal(kq.j.ok, dbMongDoi, `${nhan}: ok phải đi cùng db — thân thật: ${kq.chu}`);
}

describe('BUG-049 — /api/health công khai chỉ trả {ok, db}', { timeout: 300_000 }, () => {
  for (const tep of DIEM_KHOI_DONG) {
    test(`${tep}: kịch bản gốc + (b) đường/phương thức khác + (c) X-Forwarded-For IP cơ quan`, async () => {
      const may = await dung(tep, { ADMIN_ALLOWED_IPS: IP_CO_QUAN });
      try {
        // Kịch bản gốc
        chiOkDb(await goi(may.cong, '/api/health'), `${tep} GET /api/health`, true);

        // (b) Express không phân biệt hoa thường, bỏ qua dấu / cuối — cùng một handler, cùng thân
        for (const duong of ['/API/HEALTH', '/api/Health', '/api/health/']) {
          chiOkDb(await goi(may.cong, duong), `${tep} GET ${duong}`, true);
        }
        // (b) HEAD: không có thân, mã 200 (Render có thể kiểm bằng HEAD)
        const head = await goi(may.cong, '/api/health', { method: 'HEAD' });
        assert.equal(head.ma, 200, `${tep} HEAD: mã ${head.ma}`);
        assert.equal(head.chu, '', `${tep} HEAD: không được có thân`);

        // (c) Gọi thẳng cổng, tự khai X-Forwarded-For là IP cơ quan — req.ip thành IP cơ quan,
        //     nhưng health không có nhánh "chi tiết cho IP cơ quan" nào để lọt.
        for (const xff of [IP_CO_QUAN, `1.2.3.4, ${IP_CO_QUAN}`, `${IP_CO_QUAN}, 1.2.3.4`]) {
          chiOkDb(await goi(may.cong, '/api/health', { headers: { 'X-Forwarded-For': xff } }),
            `${tep} XFF="${xff}"`, true);
        }
        // (c) thêm các header proxy khác hay bị tin nhầm
        chiOkDb(await goi(may.cong, '/api/health', {
          headers: { 'X-Real-IP': IP_CO_QUAN, 'X-Client-IP': IP_CO_QUAN, Forwarded: `for=${IP_CO_QUAN}` },
        }), `${tep} X-Real-IP/Forwarded`, true);
        // Tham số truy vấn kiểu "?chi_tiet=1" không mở được gì
        chiOkDb(await goi(may.cong, '/api/health?chi_tiet=1&verbose=true&debug=1'), `${tep} ?chi_tiet`, true);
      } finally { await may.dung(); }
    });

    test(`${tep}: (d) CSDL chết -> vẫn 200, {ok:false, db:false} (trang 113, Render vẫn kiểm sống)`, async () => {
      const may = await dung(tep, { MA_TRAN_CSDL_HONG: '1' });
      try {
        chiOkDb(await goi(may.cong, '/api/health'), `${tep} CSDL chết`, false);
      } finally { await may.dung(); }
    });

    test(`${tep}: thiếu ENCRYPTION_KEY -> health KHÔNG báo ra ngoài (không còn "encryption":false)`, async () => {
      const may = await dung(tep, { ENCRYPTION_KEY: undefined });
      try {
        chiOkDb(await goi(may.cong, '/api/health'), `${tep} thiếu ENCRYPTION_KEY`, true);
      } finally { await may.dung(); }
    });

    /* Phần thay thế: người vận hành đọc chi tiết ở nhật ký khởi động, máy nào tự báo máy đó. */
    test(`${tep}: nhật ký khởi động in phiên bản, AI, trạng thái mã hoá (đủ khoá)`, async () => {
      const may = await dung(tep);
      try {
        const mau = [/Phiên bản backend: v\d+-\d{4}-\d{2}/, /AI \(Gemini\): ĐÃ BẬT/, /Mã hoá danh tính: ĐÃ BẬT/];
        const log = await choLog(may, mau);
        for (const m of mau) assert.match(log, m, `${tep}: nhật ký thiếu ${m}\n--- nhật ký ---\n${log.slice(-1500)}`);
        assert.doesNotMatch(log, /KHÔNG HOẠT ĐỘNG/, `${tep}: đủ khoá mà nhật ký báo mã hoá hỏng`);
      } finally { await may.dung(); }
    });

    test(`${tep}: nhật ký khởi động báo ĐỎ khi thiếu ENCRYPTION_KEY, kèm lý do`, async () => {
      const may = await dung(tep, { ENCRYPTION_KEY: undefined, GEMINI_API_KEY: undefined });
      try {
        const mau = [/MÃ HOÁ DANH TÍNH KHÔNG HOẠT ĐỘNG/, /Lý do: \S/, /AI \(Gemini\): chưa cấu hình/];
        const log = await choLog(may, mau);
        for (const m of mau) assert.match(log, m, `${tep}: nhật ký thiếu ${m}\n--- nhật ký ---\n${log.slice(-1500)}`);
        assert.doesNotMatch(log, /Mã hoá danh tính: ĐÃ BẬT/, `${tep}: thiếu khoá mà nhật ký báo đã bật`);
      } finally { await may.dung(); }
    });
  }
});
