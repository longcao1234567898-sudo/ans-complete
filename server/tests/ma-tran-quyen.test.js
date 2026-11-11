/**
 * LƯỚI AN TOÀN: MA TRẬN ROUTE × LOẠI VÉ CHO CẢ BA ĐIỂM KHỞI ĐỘNG (S1.0)
 *
 * Vì sao có test này: các test quyền có sẵn phần lớn ĐỌC MÃ NGUỒN bằng regex, mỗi test canh
 * một route. Chúng không bắt được (1) route mới quên chặn, (2) một điểm khởi động gắn lệch
 * (ND-010, ND-086), (3) Express khớp đường dẫn khác cách người viết nghĩ (RETEST P104: /API/ADMIN).
 *
 * Cách làm — chạy THẬT, không dựng req giả:
 *  - fork từng điểm khởi động (index.js, may-chu-can-bo.js, may-chu-cong-khai.js) nguyên văn,
 *    chỉ nạp trước tests/gia-lap/khoi-dong-ma-tran.js: CSDL giả, cổng ngẫu nhiên, chặn mạng ngoài;
 *  - danh sách route lấy từ ROUTER STACK lúc chạy, so với tests/ma-tran-quyen-ky-vong.js:
 *    route chưa khai, gắn sai máy chủ, hay kỳ vọng thừa -> đỏ;
 *  - gọi HTTP từng ô route × loại vé, và các biến thể đường dẫn / HEAD.
 *
 * "Qua" nghĩa là vào tới thân route: KHÔNG phải 401/403, và không phải 404 "Endpoint không tồn
 * tại." của phần đuôi chung. Thân route với CSDL giả rỗng trả 2xx/400/404/500 tuỳ nghiệp vụ —
 * mã đó không thuộc lớp quyền nên không so. (CSDL giả cố ý nghèo dữ liệu: xem csdl-ma-tran.js.)
 *
 * GIỚI HẠN (trọng tài S1.0 chỉ ra — lưới xanh KHÔNG có nghĩa phân quyền đúng hết):
 *  - không đo phạm vi THEO HÀNG (cán bộ thường thấy hồ sơ nào: tests/pham-vi-ho-so*.test.js),
 *    tham số truy vấn (?phan=...), tham số đường dẫn khác `1`, vé đặt ở cookie/chuỗi truy vấn;
 *  - không đo bộ đệm trạng thái tài khoản 30 s (khoá giữa phiên — BUG-003) và vai trò trong vé
 *    lệch vai trò trong CSDL (R-BUG-008-1).
 *
 * Môi trường tiến trình con dựng từ đầu, KHÔNG thừa hưởng biến của máy (máy thật có server/.env
 * với ADMIN_ALLOWED_IPS, khoá AI...). NODE_ENV cố ý KHÔNG đặt — đúng như Render.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import jwt from 'jsonwebtoken';
import { KY_VONG, LOP_GIUA, doiChieu } from './ma-tran-quyen-ky-vong.js';
import { TEST_JWT_SECRET, TEST_PEPPER, TEST_ENCRYPTION_KEY } from './helpers-test.js';

const GOC = fileURLToPath(new URL('..', import.meta.url));
const NAP_TRUOC = pathToFileURL(fileURLToPath(new URL('./gia-lap/khoi-dong-ma-tran.js', import.meta.url))).href;

const DIEM_KHOI_DONG = [
  { ten: 'gop', tep: 'src/index.js' },
  { ten: 'can-bo', tep: 'src/may-chu-can-bo.js' },
  { ten: 'cong-khai', tep: 'src/may-chu-cong-khai.js' },
];

function moiTruongCon(them = {}) {
  const giu = ['PATH', 'Path', 'SystemRoot', 'SYSTEMROOT', 'windir', 'TEMP', 'TMP', 'TMPDIR', 'HOME', 'USERPROFILE'];
  const env = {};
  for (const k of giu) if (process.env[k] !== undefined) env[k] = process.env[k];
  return {
    ...env,
    JWT_SECRET: TEST_JWT_SECRET,
    HASH_PEPPER: TEST_PEPPER,
    ENCRYPTION_KEY: TEST_ENCRYPTION_KEY,
    /* Có khoá để lưới không vỡ khi chạy thật bắt buộc khoá (S1.1); mọi lời gọi Cloudflare đã bị
       chặn ở tệp nạp trước. */
    TURNSTILE_SECRET_KEY: 'ma-tran-quyen-khoa-turnstile-gia',
    /* dotenv không ghi đè biến đã có (kể cả rỗng); trỏ DOTENV_CONFIG_PATH vào tệp không tồn tại
       để server/.env của máy không lọt vào. */
    DOTENV_CONFIG_PATH: fileURLToPath(new URL('./gia-lap/khong-co-tep-nay.env', import.meta.url)),
    ADMIN_ALLOWED_IPS: '',
    ...them,
  };
}

/** Khởi động một điểm khởi động thật -> { cong, routes, dung() } */
function khoiDong(tep, them = {}) {
  return new Promise((ok, loi) => {
    const con = fork(tep, [], {
      cwd: GOC,
      env: moiTruongCon(them),
      execArgv: ['--import', NAP_TRUOC],
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    });
    let log = '';
    con.stdout.on('data', (d) => { log += d; });
    con.stderr.on('data', (d) => { log += d; });
    const hen = setTimeout(() => { con.kill(); loi(new Error(`${tep} không sẵn sàng sau 60 s:\n${log}`)); }, 60_000);
    con.once('exit', (ma) => { clearTimeout(hen); loi(new Error(`${tep} thoát sớm (mã ${ma}):\n${log}`)); });
    con.on('message', (m) => {
      if (m?.loai !== 'san-sang') return;
      clearTimeout(hen);
      con.removeAllListeners('exit');
      ok({
        cong: m.cong,
        routes: m.routes,
        lopGiua: m.lopGiua,
        nhatKy: () => log,
        dung: () => new Promise((xong) => {
          if (con.exitCode !== null) return xong();
          con.once('exit', () => xong());
          con.send('dung');
          setTimeout(() => con.kill(), 5_000).unref();
        }),
      });
    });
  });
}

/* ---------------- các loại vé ---------------- */
const AUD = 'hop-thu:can-bo';
const giay = () => Math.floor(Date.now() / 1000);
const kyCanBo = (truong, tuyChon = {}) => jwt.sign(truong, TEST_JWT_SECRET, { expiresIn: '1h', audience: AUD, ...tuyChon });
const admin1 = { sub: 1, username: 'a', role: 'admin', name: 'A' };
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');

/** tên -> giá trị header Authorization (undefined = không gửi). `vai` = vai hợp lệ, còn lại là vé phải bị từ chối. */
const LOAI_VE = {
  'khong-ve': { auth: undefined },
  'bearer-rac': { auth: 'Bearer khong-phai-jwt' },
  've-otp': { auth: `Bearer ${jwt.sign({ emailHash: 'x', purpose: 'submit' }, TEST_JWT_SECRET, { expiresIn: '15m' })}` },
  've-chat': { auth: `Bearer ${jwt.sign({ sub: 1, purpose: 'chat_reporter' }, TEST_JWT_SECRET, { expiresIn: '1h' })}` },
  've-cong-vao': { auth: `Bearer ${jwt.sign({ purpose: 'cong_vao' }, TEST_JWT_SECRET, { expiresIn: '1h', jwtid: 'x' })}` },
  've-mo-form': { auth: `Bearer ${jwt.sign({ purpose: 'mo_form' }, TEST_JWT_SECRET, { expiresIn: '1h', jwtid: 'y' })}` },
  've-dung-aud-thieu-vai': { auth: `Bearer ${kyCanBo({ purpose: 'submit' })}` },
  'het-han': { auth: `Bearer ${jwt.sign({ ...admin1, aud: AUD, exp: giay() - 60, iat: giay() - 3600 }, TEST_JWT_SECRET)}` },
  'aud-sai': { auth: `Bearer ${kyCanBo(admin1, { audience: 'hop-thu:cong-dan' })}` },
  'khong-aud': { auth: `Bearer ${jwt.sign(admin1, TEST_JWT_SECRET, { expiresIn: '1h' })}` },
  'sai-khoa-ky': { auth: `Bearer ${jwt.sign(admin1, 'khoa-khac-hoan-toan-0123456789abcdef-zyxwvu', { expiresIn: '1h', audience: AUD })}` },
  'alg-none': { auth: `Bearer ${b64({ alg: 'none', typ: 'JWT' })}.${b64({ ...admin1, aud: AUD, exp: giay() + 3600 })}.` },
  'vai-tro-la': { auth: `Bearer ${kyCanBo({ ...admin1, role: 'superadmin' })}` },
  'vai-tro-hoa': { auth: `Bearer ${kyCanBo({ ...admin1, role: 'Admin' })}` },
  'sub-chuoi': { auth: `Bearer ${kyCanBo({ ...admin1, sub: '1' })}` },
  'can-bo-khong-co': { auth: `Bearer ${kyCanBo({ ...admin1, sub: 99 })}` },
  'tai-khoan-bi-khoa': { auth: `Bearer ${kyCanBo({ ...admin1, sub: 4 })}` },
  'sai-tien-to': { auth: `Token ${kyCanBo(admin1)}` },
  handler: { auth: `Bearer ${kyCanBo({ sub: 3, username: 'h', role: 'handler', name: 'H' })}`, vai: 'handler' },
  manager: { auth: `Bearer ${kyCanBo({ sub: 2, username: 'm', role: 'manager', name: 'M' })}`, vai: 'manager' },
  admin: { auth: `Bearer ${kyCanBo(admin1)}`, vai: 'admin' },
};

/** Kết quả mong đợi ở lớp quyền: 'qua' | 'chan-401' | 'chan-403' */
function mongDoi(quyen, loaiVe) {
  const vai = LOAI_VE[loaiVe].vai;
  if (!vai) return 'chan-401';
  if (quyen === 'lanh-dao' && vai === 'handler') return 'chan-403';
  return 'qua';
}

/* ---------------- gọi HTTP ---------------- */
let soIp = 0;
/* Mỗi yêu cầu một IP riêng (qua `trust proxy`, như sau Nginx): giới hạn chung theo IP không
   được biến ô "qua" thành 429. Không đụng gì tới lớp quyền. */
const ipMoi = () => { soIp += 1; return `10.${(soIp >> 16) & 255}.${(soIp >> 8) & 255}.${soIp & 255}`; };

async function goi(cong, method, duong, auth, { ip, than: thanGui = {}, cookie } = {}) {
  const headers = { 'x-forwarded-for': ip ?? ipMoi() };
  if (auth !== undefined) headers.authorization = auth;
  if (cookie) headers.cookie = cookie;
  const coThan = !['GET', 'HEAD'].includes(method);
  if (coThan) headers['content-type'] = 'application/json';
  const r = await fetch(`http://127.0.0.1:${cong}${duong}`, {
    method, headers, body: coThan ? JSON.stringify(thanGui) : undefined, redirect: 'manual',
  });
  const chu = method === 'HEAD' ? '' : await r.text();
  let than = null;
  try { than = JSON.parse(chu); } catch { /* không phải JSON */ }
  return { ma: r.status, than };
}

function phanLoai({ ma, than }, method) {
  if (ma === 401) return 'chan-401';
  if (ma === 403) return 'chan-403';
  if (ma === 404 && than?.error === 'Endpoint không tồn tại.') return 'khong-co';
  if (ma === 404 && method === 'HEAD') return 'khong-ro';
  return 'qua';
}

const dienThamSo = (p) => p.replace(/:[A-Za-z_]+/g, '1');

/** Chạy danh sách việc với tối đa `n` yêu cầu cùng lúc */
async function chayGioiHan(viec, n = 16) {
  const kq = new Array(viec.length);
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < viec.length) { const j = i++; kq[j] = await viec[j](); }
  }));
  return kq;
}

const routePhanCanBo = (tenMay) => Object.entries(KY_VONG)
  .filter(([, v]) => v.may.includes(tenMay) && v.quyen !== 'cong-dan')
  .map(([k, v]) => { const [method, path] = k.split(' '); return { method, path, quyen: v.quyen }; });

const inSai = (sai) => `${sai.length} ô sai:\n  ${sai.slice(0, 60).join('\n  ')}${sai.length > 60 ? '\n  ...' : ''}`;

/* ---------------- test ---------------- */
for (const { ten, tep } of DIEM_KHOI_DONG) {
  describe(`ma trận quyền — ${ten} (${tep})`, () => {
    let may;
    before(async () => { may = await khoiDong(tep); });
    after(async () => { await may?.dung(); });

    test('mọi route lúc chạy đều có dòng kỳ vọng, gắn đúng máy chủ, không kỳ vọng thừa', () => {
      assert.ok(may.routes.length > 0, 'không liệt kê được route nào — tệp nạp trước hỏng?');
      const { chuaKhai, gacSaiMay, thieu, nhanSai } = doiChieu(ten, may.routes);
      assert.deepEqual(nhanSai, [], 'route phần cán bộ khai nhãn không được gọi thử');
      assert.deepEqual(chuaKhai, [], `route CHƯA KHAI kỳ vọng ở ${ten} — thêm dòng vào tests/ma-tran-quyen-ky-vong.js`);
      assert.deepEqual(gacSaiMay, [], `route gắn ở ${ten} nhưng bảng nói máy chủ này KHÔNG được gắn`);
      assert.deepEqual(thieu, [], `bảng kỳ vọng có route mà ${ten} không gắn (đổi tên/bỏ route?)`);
    });

    test('lớp use() không phải router (middleware, hàm gắn thẳng, app con) khớp bảng, đúng thứ tự', () => {
      assert.deepEqual(may.lopGiua, LOP_GIUA[ten], `lớp use() ở ${ten} khác LOP_GIUA trong tests/ma-tran-quyen-ky-vong.js`);
    });

    if (ten === 'cong-khai') {
      test('không đường nào của phần cán bộ trả lời, dù cầm vé admin', async () => {
        const ds = routePhanCanBo('gop');
        const sai = [];
        await chayGioiHan(ds.flatMap(({ method, path }) => ['khong-ve', 'admin'].map((lv) => async () => {
          const d = dienThamSo(path);
          const kq = phanLoai(await goi(may.cong, method, d, LOAI_VE[lv].auth), method);
          if (kq !== 'khong-co') sai.push(`${method} ${d} [${lv}] -> ${kq}`);
        })));
        assert.ok(ds.length > 0);
        assert.deepEqual(sai, [], inSai(sai));
      });
      return;
    }

    test('route × loại vé: chỉ đúng vai mới qua lớp quyền', async () => {
      const ds = routePhanCanBo(ten).filter((r) => r.quyen !== 'mo');
      const sai = [];
      await chayGioiHan(ds.flatMap(({ method, path, quyen }) => Object.keys(LOAI_VE).map((lv) => async () => {
        const d = dienThamSo(path);
        const thuc = await goi(may.cong, method, d, LOAI_VE[lv].auth);
        const kq = phanLoai(thuc, method);
        const muon = mongDoi(quyen, lv);
        if (kq !== muon) sai.push(`${method} ${d} [${lv}] mong ${muon}, được ${kq} (${thuc.ma})`);
      })));
      assert.ok(ds.length > 0);
      assert.deepEqual(sai, [], inSai(sai));
    });

    test('route không đòi vé (đăng nhập, làm mới, đăng xuất): vé không làm đổi kết quả', async () => {
      const ds = routePhanCanBo(ten).filter((r) => r.quyen === 'mo');
      const sai = [];
      /* Thân và cookie HỢP LỆ về hình thức, để yêu cầu đi qua các dòng kiểm đầu vào và cổng vào
         tới tận chỗ tra CSDL (trọng tài S1.0: thân {} dừng ở dòng kiểm đầu tiên, mã phía sau
         không được thử). CSDL giả không có tài khoản nào -> mọi ô phải ra cùng một kết quả. */
      const veVaoCua = jwt.sign({ purpose: 'cong_vao' }, TEST_JWT_SECRET, { expiresIn: '1h', jwtid: 'mo' });
      const cach = {
        'POST /api/auth/login': { than: { username: 'khong-ton-tai', password: 'mat-khau-bat-ky', veVaoCua } },
        'POST /api/auth/refresh': { cookie: 'refreshToken=khong-co-trong-csdl' },
        'POST /api/auth/logout': { cookie: 'refreshToken=khong-co-trong-csdl' },
      };
      for (const { method, path } of ds) {
        const k = `${method} ${path}`;
        assert.ok(cach[k], `${k}: chưa có thân/cookie hợp lệ cho ô 'mo'`);
        const goc = await goi(may.cong, method, path, undefined, cach[k]);
        assert.ok(phanLoai(goc, method) !== 'khong-co', `${k} không tồn tại ở ${ten}`);
        assert.ok(goc.ma !== 400 && goc.ma !== 403, `${k}: thân thử dừng ở kiểm đầu vào/cổng vào (${goc.ma}) — ô 'mo' không đo được gì`);
        for (const lv of Object.keys(LOAI_VE)) {
          const kq = await goi(may.cong, method, path, LOAI_VE[lv].auth, cach[k]);
          if (kq.ma !== goc.ma || JSON.stringify(kq.than) !== JSON.stringify(goc.than)) {
            sai.push(`${k} [${lv}] -> ${kq.ma} ${JSON.stringify(kq.than)}, không vé -> ${goc.ma} ${JSON.stringify(goc.than)}`);
          }
        }
      }
      assert.equal(ds.length, 3);
      assert.deepEqual(sai, [], inSai(sai));
    });

    test('biến thể đường dẫn (hoa thường, / cuối, //, %2F) và HEAD không lách được lớp quyền', async () => {
      const ds = routePhanCanBo(ten).filter((r) => r.quyen !== 'mo');
      const bienThe = (d) => ({
        'chu-hoa': d.toUpperCase(),
        'hoa-dau': d.replace(/^\/api\/(admin|auth)/, (_m, x) => `/Api/${x[0].toUpperCase()}${x.slice(1)}`),
        'gach-cuoi': `${d}/`,
        'gach-doi-dau': `/${d}`,
        'gach-doi-giua': d.replace(/^\/api\//, '/api//'),
        'ma-hoa-gach': d.replace(/^(\/api\/(?:admin|auth))\//, '$1%2F'),
      });
      const sai = [];
      const viec = [];
      for (const { method, path, quyen } of ds) {
        const d = dienThamSo(path);
        /* vé bị chặn ở mọi vai: không vé. Vé bị chặn vì vai: handler ở route lãnh đạo. */
        const cacVe = quyen === 'lanh-dao' ? ['khong-ve', 've-chat', 'handler'] : ['khong-ve', 've-chat'];
        for (const lv of cacVe) {
          const muon = mongDoi(quyen, lv);
          for (const [tenBt, duong] of Object.entries(bienThe(d))) {
            viec.push(async () => {
              const kq = phanLoai(await goi(may.cong, method, duong, LOAI_VE[lv].auth), method);
              if (kq !== muon && kq !== 'khong-co') sai.push(`${method} ${duong} [${lv}, ${tenBt}] mong ${muon}/khong-co, được ${kq}`);
            });
          }
          if (method === 'GET') {
            viec.push(async () => {
              const kq = phanLoai(await goi(may.cong, 'HEAD', d, LOAI_VE[lv].auth), 'HEAD');
              if (kq !== muon) sai.push(`HEAD ${d} [${lv}] mong ${muon}, được ${kq}`);
            });
          }
        }
      }
      await chayGioiHan(viec);
      assert.ok(viec.length > 0);
      assert.deepEqual(sai, [], inSai(sai));
    });
  });
}

/* Hai lượt khởi động thêm cho mỗi máy chủ có phần cán bộ: bật ADMIN_ALLOWED_IPS, và CSDL hỏng. */
const IP_CO_QUAN = '10.250.0.1';
for (const { ten, tep } of DIEM_KHOI_DONG.filter((d) => d.ten !== 'cong-khai')) {
  describe(`ma trận quyền — ${ten}: bật giới hạn IP cơ quan`, () => {
    let may;
    before(async () => { may = await khoiDong(tep, { ADMIN_ALLOWED_IPS: IP_CO_QUAN }); });
    after(async () => { await may?.dung(); });

    test('ngoài IP cơ quan: mọi route phần cán bộ (kể cả đăng nhập, biến thể hoa thường) -> 403, dù vé admin', async () => {
      const sai = [];
      const viec = [];
      for (const { method, path } of routePhanCanBo(ten)) {
        const d = dienThamSo(path);
        for (const duong of [d, d.toUpperCase(), `${d}/`]) {
          viec.push(async () => {
            const kq = phanLoai(await goi(may.cong, method, duong, LOAI_VE.admin.auth, { ip: '203.0.113.9' }), method);
            if (kq !== 'chan-403') sai.push(`${method} ${duong} từ 203.0.113.9 -> ${kq}`);
          });
        }
      }
      await chayGioiHan(viec);
      assert.ok(viec.length > 0);
      assert.deepEqual(sai, [], inSai(sai));
    });

    test('trong IP cơ quan: vé admin vẫn qua (lớp IP không chặn nhầm) — đối chứng', async () => {
      const sai = [];
      await chayGioiHan(routePhanCanBo(ten).filter((r) => r.quyen !== 'mo').map(({ method, path }) => async () => {
        const kq = phanLoai(await goi(may.cong, method, dienThamSo(path), LOAI_VE.admin.auth, { ip: IP_CO_QUAN }), method);
        if (kq !== 'qua') sai.push(`${method} ${path} từ ${IP_CO_QUAN} -> ${kq}`);
      }));
      assert.deepEqual(sai, [], inSai(sai));
    });
  });

  describe(`ma trận quyền — ${ten}: CSDL hỏng`, () => {
    let may;
    before(async () => { may = await khoiDong(tep, { MA_TRAN_CSDL_HONG: '1' }); });
    after(async () => { await may?.dung(); });

    test('không kiểm được trạng thái tài khoản -> chặn 401 mọi vai (fail-closed, luật 1)', async () => {
      const sai = [];
      await chayGioiHan(routePhanCanBo(ten).filter((r) => r.quyen !== 'mo').flatMap(({ method, path }) =>
        ['admin', 'manager', 'handler'].map((lv) => async () => {
          const kq = phanLoai(await goi(may.cong, method, dienThamSo(path), LOAI_VE[lv].auth), method);
          if (kq !== 'chan-401') sai.push(`${method} ${path} [${lv}] -> ${kq}`);
        })));
      assert.deepEqual(sai, [], inSai(sai));
    });
  });
}

/* Lưới phải BẮT được route mới. Gắn thêm một route chưa khai vào /api/admin của bản gộp (qua
   tệp nạp trước, không sửa mã) -> đối chiếu phải chỉ ra đúng route đó. */
test('tự kiểm: route mới chưa khai kỳ vọng làm lưới báo đỏ', async () => {
  const may = await khoiDong('src/index.js', { MA_TRAN_ROUTE_GIA: '1' });
  try {
    const { chuaKhai, gacSaiMay, thieu } = doiChieu('gop', may.routes);
    assert.deepEqual(chuaKhai, ['GET /api/admin/route-gia-chua-khai']);
    assert.deepEqual(gacSaiMay, []);
    assert.deepEqual(thieu, []);
    /* hàm xử lý gắn thẳng bằng use() — không thành route, phải lộ ở danh sách lớp */
    assert.notDeepEqual(may.lopGiua, LOP_GIUA.gop);
    assert.ok(may.lopGiua.includes('USE /api/admin/xuat-nhanh <an-danh>'), may.lopGiua.join('\n'));
  } finally {
    await may.dung();
  }
});

test('tự kiểm: đối chiếu bắt route gắn sai máy chủ và kỳ vọng thừa', () => {
  const kv = { 'GET /a': { quyen: 'can-bo', may: ['can-bo'] }, 'GET /b': { quyen: 'can-bo', may: ['cong-khai'] } };
  assert.deepEqual(doiChieu('cong-khai', [{ method: 'GET', path: '/a' }], kv),
    { chuaKhai: [], gacSaiMay: ['GET /a'], thieu: ['GET /b'], nhanSai: [] });
  const ne = { 'GET /API/Admin/x': { quyen: 'cong-dan', may: ['gop'] } };
  assert.deepEqual(doiChieu('gop', [{ method: 'GET', path: '/API/Admin/x' }], ne).nhanSai, ['GET /API/Admin/x']);
});
