/**
 * P89 — NHÃN "ĐÃ XÁC MINH SỐ ĐIỆN THOẠI" KHI GỬI Ý KIẾN
 *
 * Đi đúng đường người dân: xin mã (kênh Zalo giả bắt mã) -> nhập mã -> nhận vé
 * -> gửi ý kiến kèm vé. Cán bộ chỉ thấy "đã xác minh" khi vé đúng là của số ghi
 * trong tin. Ba điều không được sai:
 *   1. Không xác minh vẫn gửi được — nhãn chỉ là thông tin thêm, KHÔNG chặn tin.
 *   2. Tin ẩn danh không bao giờ mang nhãn (NULL), kể cả khi trình duyệt gửi kèm vé.
 *   3. Máy chưa chạy nang_cap_v39.sql vẫn nhận ý kiến bình thường.
 */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { datBienMoiTruongHopLe, TEST_JWT_SECRET } from './helpers-test.js';
import { BO_QUA, dungCsdl, donCoTen, goi as goiCanBo, PHO } from './khung-sqlite.js';

datBienMoiTruongHopLe();

const { pool } = await import('../src/db.js');
const { default: submissionsRouter } = await import('../src/routes/submissions.js');
const { default: xacMinhRouter } = await import('../src/routes/xac-minh-sdt.js');
const { dangKyKenh } = await import('../src/lib/kenh-gui-ma.js');
const { default: adminRouter } = await import('../src/routes/admin/index.js');
const { signAccessToken } = await import('../src/lib/token.js');

const maDaGui = new Map();
dangKyKenh('zalo', { guiMa: async ({ soDienThoai, ma }) => (maDaGui.set(soDienThoai, ma), { ok: true }) });

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '2mb' }));
app.use('/api/submissions', submissionsRouter);
app.use('/api/xac-minh-sdt', xacMinhRouter);
const server = app.listen(0);
test.after(() => server.close());

let ctl;
beforeEach(() => {
  process.env.KENH_XAC_MINH_SDT = 'zalo';
  maDaGui.clear();
  if (!BO_QUA) ctl = dungCsdl(pool);
});

let soIp = 0;
const ipMoi = () => `10.89.${(++soIp >> 8) & 255}.${soIp & 255}`;
async function goi(duong, body, ip = ipMoi()) {
  const r = await fetch(`http://127.0.0.1:${server.address().port}/api${duong}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip },
    body: JSON.stringify(body),
  });
  return { status: r.status, body: await r.json().catch(() => null) };
}
const phieuCu = () => jwt.sign({ purpose: 'mo_form', iat: Math.floor(Date.now() / 1000) - 60 }, TEST_JWT_SECRET, { expiresIn: '2h', jwtid: crypto.randomUUID() });

/** Đi hết đường xác minh như người dân -> vé của số này */
async function layVeSdt(soDienThoai) {
  const g = await goi('/xac-minh-sdt/gui-ma', { soDienThoai, phieuMoForm: phieuCu(), deviceId: crypto.randomUUID() });
  assert.equal(g.status, 200, JSON.stringify(g.body));
  const x = await goi('/xac-minh-sdt/xac-nhan', { soDienThoai, ma: maDaGui.get(soDienThoai) });
  assert.equal(x.status, 200, JSON.stringify(x.body));
  return x.body.veSdt;
}
const nhanCuaTin = (ma) => ctl.db.prepare('SELECT sdt_xac_minh FROM submissions WHERE tracking_code = ?').get(ma).sdt_xac_minh;

/* Chạy ĐẦU TIÊN: máy chủ chỉ nhớ "đã có cột" sau lần thấy cột đầu tiên (thực tế
   v39 chỉ thêm cột, không bao giờ bỏ) */
test('máy chưa chạy nang_cap_v39.sql: vẫn nhận ý kiến (có hay không có vé)', { skip: BO_QUA }, async () => {
  ctl.db.exec('ALTER TABLE submissions DROP COLUMN sdt_xac_minh');
  const don = donCoTen(3);
  const veSdt = await layVeSdt(don.phone);
  assert.equal((await goi('/submissions', { ...don, veSdt })).status, 201);
  assert.equal((await goi('/submissions', donCoTen(4))).status, 201);
});

test('nhập đúng mã gửi về số đó: tin mang nhãn đã xác minh số', { skip: BO_QUA }, async () => {
  const don = donCoTen(0);
  const veSdt = await layVeSdt(don.phone);
  const r = await goi('/submissions', { ...don, veSdt });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(nhanCuaTin(r.body.trackingCode), 1);
});

test('không xác minh vẫn gửi được — chỉ không có nhãn (KHÔNG BAO GIỜ chặn tin)', { skip: BO_QUA }, async () => {
  const r = await goi('/submissions', donCoTen(1));
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(nhanCuaTin(r.body.trackingCode), 0);
});

test('vé của số KHÁC, vé bịa, vé hết hạn, vé sai mục đích: gửi được nhưng không có nhãn', { skip: BO_QUA }, async () => {
  const veSoKhac = await layVeSdt(donCoTen(7).phone);
  const veHetHan = jwt.sign({ purpose: 'sdt_xac_minh', sdt: 'x', exp: Math.floor(Date.now() / 1000) - 10 }, TEST_JWT_SECRET);
  const veMoForm = phieuCu();
  for (const [i, veSdt] of [veSoKhac, 'vé-bịa', veHetHan, veMoForm, ['mảng']].entries()) {
    const r = await goi('/submissions', { ...donCoTen(2 + i), veSdt });
    assert.equal(r.status, 201, `#${i} ${JSON.stringify(r.body)}`);
    assert.equal(nhanCuaTin(r.body.trackingCode), 0, `#${i}`);
  }
});

test('tin ẩn danh: KHÔNG mang nhãn (NULL) kể cả khi gửi kèm vé hợp lệ — không nối được với số', { skip: BO_QUA }, async () => {
  const veSdt = await layVeSdt(donCoTen(0).phone);
  const r = await goi('/submissions', {
    isAnonymous: true, category: 'to_giac', veSdt, phone: donCoTen(0).phone,
    content: 'Khoảng 22 giờ tối qua tại bãi đất trống cuối hẻm 41 khu phố 3 có nhóm khoảng năm người tụ tập trao đổi gói nhỏ nghi là ma tuý, đi xe máy không biển số.',
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const row = ctl.db.prepare('SELECT sdt_xac_minh, sender_phone, sender_phone_hash FROM submissions WHERE tracking_code = ?').get(r.body.trackingCode);
  assert.equal(row.sdt_xac_minh, null);
  assert.equal(row.sender_phone, null);
  assert.equal(row.sender_phone_hash, null);
});

test('cán bộ mở chi tiết thấy nhãn: 1 đã xác minh, 0 chưa, ẩn danh không có', { skip: BO_QUA }, async () => {
  const don = donCoTen(0);
  const co = await goi('/submissions', { ...don, veSdt: await layVeSdt(don.phone) });
  const khong = await goi('/submissions', donCoTen(1));
  const an = await goi('/submissions', {
    isAnonymous: true, category: 'to_giac',
    content: 'Sáng nay lúc 6 giờ ở đầu chợ khu phố 2 có hai người đàn ông giật túi xách của một chị bán rau rồi chạy về hướng cầu, mặc áo khoác đen, đội mũ lưỡi trai.',
  });
  const chiTiet = async (maTra) => {
    const { id } = ctl.db.prepare('SELECT id FROM submissions WHERE tracking_code = ?').get(maTra);
    const r = await goiCanBo({ duongGoc: '/api/admin', router: adminRouter, staff: PHO, signAccessToken, method: 'GET', duong: `/submissions/${id}` });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    return r.body;
  };
  assert.equal((await chiTiet(co.body.trackingCode)).sdt_xac_minh, 1);
  assert.equal((await chiTiet(khong.body.trackingCode)).sdt_xac_minh, 0);
  assert.equal((await chiTiet(an.body.trackingCode)).sdt_xac_minh, null);
});
