/**
 * P88 — CHẶN MỀM THEO MẠNG: vượt ngưỡng theo mạng thì xác minh thêm, không chặn ngay
 *
 * Trên 4G hàng trăm thuê bao dùng chung một IP (CGNAT). Giới hạn theo mạng (chờ 2
 * phút, 5 tin/giờ, 2 tin ẩn danh/ngày) đếm cả người lạ dùng chung IP — người thật
 * bị chặn oan, nhất là người tố giác ẩn danh. Khi BẬT Turnstile: vượt ngưỡng mạng
 * thì đòi xác minh "không phải người máy" THÊM MỘT LẦN (mã tươi, dùng một lần,
 * kiểm nghiêm ngặt), qua được thì gửi tiếp — tới trần cứng thì chặn hẳn.
 *
 * KHÔNG ĐỔI: giới hạn theo SỐ ĐIỆN THOẠI vẫn cứng (đó là cùng một người, không phải
 * người lạ chung mạng); chưa bật Turnstile thì giới hạn mạng vẫn cứng như cũ
 * (không có cách xác minh thêm thì không mở — fail-safe).
 */
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { datBienMoiTruongHopLe } from './helpers-test.js';
import { BO_QUA, dungCsdl, donCoTen, MAY_B } from './khung-sqlite.js';

datBienMoiTruongHopLe();

const { pool } = await import('../src/db.js');
const { default: submissionsRouter } = await import('../src/routes/submissions.js');
const { capVe } = await import('../src/lib/cong-vao.js');
const { hashIdentifier } = await import('../src/lib/crypto.js');

/* Cloudflare giả: mã do test cấp, mỗi mã dùng MỘT lần (như thật) */
const fetchGoc = globalThis.fetch;
const maHopLe = new Set();
let cloudflareSap = false;
let soLanHoiCloudflare = 0;
globalThis.fetch = async (url, opt) => {
  if (String(url).includes('challenges.cloudflare.com')) {
    soLanHoiCloudflare++;
    if (cloudflareSap) throw new Error('ECONNRESET');
    const token = new URLSearchParams(String(opt?.body)).get('response');
    const ok = maHopLe.delete(token);
    return new Response(JSON.stringify({ success: ok }), { headers: { 'content-type': 'application/json' } });
  }
  return fetchGoc(url, opt);
};
let soMa = 0;
const capMa = () => { const m = `ma-tuoi-${++soMa}`; maHopLe.add(m); return m; };

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '2mb' }));
app.use('/api/submissions', submissionsRouter);
const server = app.listen(0);
test.after(() => { server.close(); globalThis.fetch = fetchGoc; });

let ctl;
beforeEach(() => {
  process.env.TURNSTILE_SECRET_KEY = 'khoa-thu';
  cloudflareSap = false;
  soLanHoiCloudflare = 0;
  if (!BO_QUA) {
    ctl = dungCsdl(pool);
    /* Đồng hồ CSDL = giờ thật: thời gian chờ 2 phút so với Date.now() */
    ctl.dongHo = Math.floor(Date.now() / 1000) * 1000;
  }
});
afterEach(() => { delete process.env.TURNSTILE_SECRET_KEY; });

let soIp = 0;
const ipMoi = () => `10.88.${(++soIp >> 8) & 255}.${soIp & 255}`;
const gui = async (ip, don, them = {}) => {
  const r = await fetchGoc(`http://127.0.0.1:${server.address().port}/api/submissions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip },
    body: JSON.stringify({ ...don, veVaoCua: capVe(), ...them }),
  });
  return { status: r.status, body: await r.json().catch(() => null) };
};
const NOI_DUNG_AN = [
  'Khoảng 22 giờ tối qua tại bãi đất trống cuối hẻm 41 khu phố 3 có nhóm khoảng năm người tụ tập trao đổi gói nhỏ nghi là ma tuý, đi xe máy không biển số.',
  'Sáng nay lúc 6 giờ ở đầu chợ khu phố 2 có hai người đàn ông giật túi xách của một chị bán rau rồi chạy về hướng cầu, mặc áo khoác đen, đội mũ lưỡi trai.',
  'Nhiều đêm liền sau 23 giờ, căn nhà cuối hẻm 9 có đông người lạ ra vào, nghe tiếng sát phạt như đánh bạc ăn tiền, xe máy dựng kín cả lối đi chung.',
];
const donAnDanh = (i) => ({ isAnonymous: true, category: 'to_giac', content: NOI_DUNG_AN[i % NOI_DUNG_AN.length] });
/* Chèn sẵn tin cũ của một mạng — để đo trần mà không phải viết 20 nội dung khác nhau */
const chenTinCu = (ip, n, { anDanh = false } = {}) => {
  const ipHash = hashIdentifier(ip).slice(0, 32);
  for (let k = 0; k < n; k++) {
    ctl.db.prepare(`INSERT INTO submissions (tracking_code, original_content, content_hash, category_id, status, ip_address, is_anonymous, created_at)
      VALUES (?, ?, ?, 1, 'received', ?, ?, datetime(NOW(), '-' || ? || ' minutes'))`)
      .run(`CU${String(soMa++).padStart(4, '0')}`, `tin cũ số ${k}`, `bam-cu-${ip}-${k}`, ipHash, anDanh ? 1 : 0, 3 + k);
  }
};

test('chưa bật Turnstile: giới hạn theo mạng vẫn CỨNG như cũ (không có cách xác minh thêm thì không mở)', { skip: BO_QUA }, async () => {
  delete process.env.TURNSTILE_SECRET_KEY;
  const ip = ipMoi();
  assert.equal((await gui(ip, donCoTen(0))).status, 201);
  const r = await gui(ip, donCoTen(1, { deviceId: MAY_B }), { xacMinhThem: capMa() });
  assert.equal(r.status, 429);
  assert.notEqual(r.body?.code, 'CAN_XAC_MINH_THEM');
});

test('người lạ chung mạng gửi trong 2 phút: đòi xác minh thêm, qua được thì gửi được', { skip: BO_QUA }, async () => {
  const ip = ipMoi();
  assert.equal((await gui(ip, donCoTen(0))).status, 201);
  const lan1 = await gui(ip, donCoTen(1, { deviceId: MAY_B }));
  assert.equal(lan1.status, 429);
  assert.equal(lan1.body?.code, 'CAN_XAC_MINH_THEM', JSON.stringify(lan1.body));
  assert.match(lan1.body.error, /113/, 'lời báo phải chỉ đường 113');
  const lan2 = await gui(ip, donCoTen(1, { deviceId: MAY_B }), { xacMinhThem: capMa() });
  assert.equal(lan2.status, 201, JSON.stringify(lan2.body));
});

test('mã xác minh thêm chỉ dùng MỘT lần, mã bịa không qua', { skip: BO_QUA }, async () => {
  const ip = ipMoi();
  assert.equal((await gui(ip, donCoTen(0))).status, 201);
  const ma = capMa();
  assert.equal((await gui(ip, donCoTen(1, { deviceId: MAY_B }), { xacMinhThem: ma })).status, 201);
  assert.equal((await gui(ip, donCoTen(2), { xacMinhThem: ma })).status, 429, 'dùng lại mã đã dùng');
  assert.equal((await gui(ip, donCoTen(3), { xacMinhThem: 'ma-bia' })).body?.code, 'XAC_MINH_THEM_KHONG_QUA',
    'có mã mà không qua phải báo KHÁC "chưa có mã" — không thì giao diện mở lại ô xác minh mãi');
});

test('Cloudflare sập lúc xác minh thêm: KHÔNG cho qua (không mở cửa khi không kiểm được)', { skip: BO_QUA }, async () => {
  const ip = ipMoi();
  assert.equal((await gui(ip, donCoTen(0))).status, 201);
  cloudflareSap = true;
  const r = await gui(ip, donCoTen(1, { deviceId: MAY_B }), { xacMinhThem: capMa() });
  assert.equal(r.status, 429);
  assert.equal(r.body?.code, 'XAC_MINH_THEM_KHONG_QUA');
  assert.match(r.body.error, /113/);
});

test('cùng MỘT số điện thoại (khác mạng) gửi trong 2 phút: vẫn chặn cứng, xác minh thêm không mở được', { skip: BO_QUA }, async () => {
  assert.equal((await gui(ipMoi(), donCoTen(0))).status, 201);
  const r = await gui(ipMoi(), { ...donCoTen(1), phone: donCoTen(0).phone }, { xacMinhThem: capMa() });
  assert.equal(r.status, 429);
  assert.notEqual(r.body?.code, 'CAN_XAC_MINH_THEM');
  assert.notEqual(r.body?.code, 'XAC_MINH_THEM_KHONG_QUA');
});

test('cùng số, gửi lần 2 KHÔNG kèm mã: chặn cứng theo số trước, không đòi xác minh thêm, không hỏi Cloudflare', { skip: BO_QUA }, async () => {
  assert.equal((await gui(ipMoi(), donCoTen(0))).status, 201);
  const r = await gui(ipMoi(), { ...donCoTen(1), phone: donCoTen(0).phone });
  assert.equal(r.status, 429);
  assert.equal(r.body?.code, undefined);
  assert.equal(soLanHoiCloudflare, 0);
});

test('trần cứng theo mạng: đã có 20 tin trong giờ thì xác minh thêm cũng không mở', { skip: BO_QUA }, async () => {
  const ip = ipMoi();
  chenTinCu(ip, 20);
  const r = await gui(ip, donCoTen(0), { xacMinhThem: capMa() });
  assert.equal(r.status, 429);
  assert.notEqual(r.body?.code, 'CAN_XAC_MINH_THEM');
});

test('dưới trần (6 tin trong giờ, quá ngưỡng 5): xác minh thêm thì gửi được', { skip: BO_QUA }, async () => {
  const ip = ipMoi();
  chenTinCu(ip, 6);
  assert.equal((await gui(ip, donCoTen(0))).body?.code, 'CAN_XAC_MINH_THEM');
  assert.equal((await gui(ip, donCoTen(0), { xacMinhThem: capMa() })).status, 201);
});

test('ẩn danh: quá 2 tin/ngày trên mạng chung thì xác minh thêm (người tố giác thật chung 4G không bị chặn oan)', { skip: BO_QUA }, async () => {
  const ip = ipMoi();
  chenTinCu(ip, 2, { anDanh: true });
  const lan1 = await gui(ip, donAnDanh(0));
  assert.equal(lan1.body?.code, 'CAN_XAC_MINH_THEM', JSON.stringify(lan1.body));
  assert.equal((await gui(ip, donAnDanh(0), { xacMinhThem: capMa() })).status, 201);
});

test('ẩn danh: trần cứng 6 tin/ngày trên một mạng', { skip: BO_QUA }, async () => {
  const ip = ipMoi();
  chenTinCu(ip, 6, { anDanh: true });
  const r = await gui(ip, donAnDanh(1), { xacMinhThem: capMa() });
  assert.equal(r.status, 429);
  assert.notEqual(r.body?.code, 'CAN_XAC_MINH_THEM');
});

test('gửi bình thường (chưa vượt ngưỡng) không phải xác minh thêm, không hỏi Cloudflare', { skip: BO_QUA }, async () => {
  assert.equal((await gui(ipMoi(), donCoTen(0))).status, 201);
  assert.equal(soLanHoiCloudflare, 0);
});

test('giao diện: nhận CAN_XAC_MINH_THEM thì hiện ô xác minh và gửi lại ĐÚNG đơn kèm mã tươi', async () => {
  const { readFile } = await import('node:fs/promises');
  const doc = (p) => readFile(new URL(`../../${p}`, import.meta.url), 'utf8');
  const trang = await doc('src/pages/SendFeedbackPage.tsx');
  assert.match(trang, /code === 'CAN_XAC_MINH_THEM'/);
  assert.match(trang, /<XacMinhThem/);
  assert.match(trang, /guiDon\(tk\)/, 'gửi lại kèm mã tươi, không bắt điền lại');
  const dv = await doc('src/services/feedbackService.ts');
  assert.match(dv, /xacMinhThem \? \{ xacMinhThem \}/, 'mã tươi đi trong trường riêng xacMinhThem');
  const o = await doc('src/components/FeedbackForm/XacMinhThem.tsx');
  assert.match(o, /UNIT\.emergency/, 'ô xác minh phải chỉ đường 113');
});

test('chưa bật Turnstile: vẫn đếm GỘP "cùng mạng hoặc cùng số" như trước (không yếu đi)', { skip: BO_QUA }, async () => {
  delete process.env.TURNSTILE_SECRET_KEY;
  const ip = ipMoi();
  chenTinCu(ip, 3);
  const { hashPhone } = await import('../src/lib/crypto.js');
  const so = donCoTen(5).phone;
  for (let k = 0; k < 3; k++) {
    ctl.db.prepare(`INSERT INTO submissions (tracking_code, original_content, content_hash, category_id, status, ip_address, sender_phone_hash, is_anonymous, created_at)
      VALUES (?, 'tin cũ', ?, 1, 'received', 'mang-khac', ?, 0, datetime(NOW(), '-' || ? || ' minutes'))`).run(`SO${k}${soMa++}`, `bam-so-${k}-${soMa}`, hashPhone(so), 10 + k);
  }
  const r = await gui(ip, donCoTen(5));
  assert.equal(r.status, 429, `3 tin cùng mạng + 3 tin cùng số là 6 > 5: ${JSON.stringify(r.body)}`);
});

test('trần cứng: lời báo nói đúng trần (20 tin/giờ), không dẫn sai về ngưỡng mềm', { skip: BO_QUA }, async () => {
  const ip = ipMoi();
  chenTinCu(ip, 20);
  const r = await gui(ip, donCoTen(0), { xacMinhThem: capMa() });
  assert.match(r.body?.error ?? '', /20/);
});

test('gọi Cloudflare TRƯỚC khi giữ chỗ — không khoá cả mạng chung trong lúc chờ Cloudflare (tới 8 giây)', async () => {
  const { readFile } = await import('node:fs/promises');
  const ma = await readFile(new URL('../src/routes/submissions.js', import.meta.url), 'utf8');
  const goiCf = ma.indexOf('await xacMinhNghiemNgat(');
  const giuCho = ma.indexOf('giu = await giuCho(');
  assert.ok(goiCf > 0 && giuCho > 0 && goiCf < giuCho, 'xacMinhNghiemNgat phải chạy trước giuCho');
});

test('giao diện: ô xác minh đưa ra document.body; có mã mà vẫn bị từ chối thì báo lỗi, KHÔNG mở lại ô (chống lặp)', async () => {
  const { readFile } = await import('node:fs/promises');
  const doc = (p) => readFile(new URL(`../../${p}`, import.meta.url), 'utf8');
  assert.match(await doc('src/components/FeedbackForm/XacMinhThem.tsx'), /<LopPhu>/);
  const trang = await doc('src/pages/SendFeedbackPage.tsx');
  assert.match(trang, /code === 'CAN_XAC_MINH_THEM' && !xacMinhThem/, 'chỉ mở ô khi lần gửi đó CHƯA kèm mã');
});
