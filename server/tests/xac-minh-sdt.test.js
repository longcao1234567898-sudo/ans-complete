/**
 * P86 — MÃ XÁC MINH SỐ ĐIỆN THOẠI QUA ZALO / SMS: 7 LỚP CHỐNG PHÁ
 *
 * Mỗi mã gửi đi là tiền thật của người vận hành. Các test dưới đây dùng kênh
 * giả (đếm số tin "đã gửi") để chứng minh từng lớp chặn — đặc biệt trần tin mỗi
 * ngày phải đứng vững cả khi bị gửi dồn song song.
 *
 * Mỗi lượt gọi mang một IP riêng (qua `trust proxy` như sau Nginx) trừ khi test
 * cố ý dùng chung một IP.
 */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { datBienMoiTruongHopLe, TEST_JWT_SECRET } from './helpers-test.js';
import { BO_QUA, dungCsdl } from './khung-sqlite.js';

datBienMoiTruongHopLe();

const { pool } = await import('../src/db.js');
const { default: router, veSdtHopLe, tranNgay, trangThai } = await import('../src/routes/xac-minh-sdt.js');
const { dangKyKenh, cauHinhKenh } = await import('../src/lib/kenh-gui-ma.js');

/* Kênh giả: ghi lại mọi tin "đã gửi" */
const daGui = [];
let zaloHong = false;
dangKyKenh('zalo', { guiMa: async (t) => (zaloHong ? { ok: false, lyDo: 'không có Zalo' } : (daGui.push({ kenh: 'zalo', ...t }), { ok: true })) });
dangKyKenh('sms', { guiMa: async (t) => (daGui.push({ kenh: 'sms', ...t }), { ok: true }) });

let ctl;
beforeEach(() => {
  daGui.length = 0;
  zaloHong = false;
  process.env.KENH_XAC_MINH_SDT = 'zalo,sms';
  delete process.env.XAC_MINH_TRAN_NGAY;
  if (!BO_QUA) ctl = dungCsdl(pool);
});

const app = express();
app.set('trust proxy', 1);
app.use(express.json());
app.use('/api/xac-minh-sdt', router);
const server = app.listen(0);
test.after(() => server.close());
const cong = () => server.address().port;

let soIp = 0;
const ipMoi = () => { soIp++; return `10.${(soIp >> 16) & 255}.${(soIp >> 8) & 255}.${soIp & 255}`; };
let soSdt = 0;
const sdtMoi = () => `09${String(1300000 + 7919 * ++soSdt).padStart(8, '0').slice(-8)}`;

/* Phiếu mở form đã mở 1 phút trước — như người thật đang điền ý kiến */
const phieuCu = () => jwt.sign({ purpose: 'mo_form', iat: Math.floor(Date.now() / 1000) - 60 }, TEST_JWT_SECRET, { expiresIn: '2h', jwtid: crypto.randomUUID() });

async function goi(duong, body, ip = ipMoi()) {
  const r = await fetch(`http://127.0.0.1:${cong()}/api/xac-minh-sdt${duong}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, body: await r.json().catch(() => null) };
}
/* Mỗi lượt một máy mới (mã thiết bị UUID như trình duyệt sinh) trừ khi test cố ý dùng chung */
const guiMa = (soDienThoai, ip, them = {}) => goi('/gui-ma', { soDienThoai, phieuMoForm: phieuCu(), deviceId: crypto.randomUUID(), ...them }, ip);
const maTrongTin = (t) => /(\d{6})/.exec(t.noiDung)[1];

test('chưa khai kênh: TẮT, không gửi gì, trả lời rõ là ý kiến vẫn gửi được', { skip: BO_QUA }, async () => {
  delete process.env.KENH_XAC_MINH_SDT;
  assert.equal((await goi('/trang-thai')).body.bat, false);
  const r = await guiMa(sdtMoi());
  assert.equal(r.status, 503);
  assert.match(r.body.error, /vẫn gửi ý kiến/);
  assert.equal(daGui.length, 0);
});

test('cấu hình sai thì TẮT, không đoán: kênh lạ, kênh thử ở production, trần không phải số dương', () => {
  assert.equal(cauHinhKenh({ KENH_XAC_MINH_SDT: 'zalo,khongco' }).bat, false);
  assert.equal(cauHinhKenh({ KENH_XAC_MINH_SDT: 'thu', NODE_ENV: 'production' }).bat, false, 'kênh thử trả mã ra màn hình');
  assert.equal(cauHinhKenh({ KENH_XAC_MINH_SDT: 'thu' }).bat, false, 'quên đặt NODE_ENV trên máy thật vẫn phải chặn');
  assert.equal(cauHinhKenh({ KENH_XAC_MINH_SDT: 'thu', NODE_ENV: 'development' }).bat, true);
  for (const sai of ['0', '-5', 'abc', '10.5']) {
    assert.equal(trangThai({ KENH_XAC_MINH_SDT: 'sms', XAC_MINH_TRAN_NGAY: sai }).bat, false, `trần "${sai}"`);
  }
  assert.equal(tranNgay({}), 500, 'mặc định 500 tin/ngày');
  assert.equal(tranNgay({ XAC_MINH_TRAN_NGAY: '800' }), 800, 'đổi trần chỉ bằng một biến môi trường');
});

test('lớp 2: chưa mở form đủ lâu (gọi thẳng API) thì không gửi mã', { skip: BO_QUA }, async () => {
  const khong = await goi('/gui-ma', { soDienThoai: sdtMoi() });
  const vuaMo = await goi('/gui-ma', { soDienThoai: sdtMoi(), phieuMoForm: jwt.sign({ purpose: 'mo_form' }, TEST_JWT_SECRET) });
  assert.equal(khong.status, 429);
  assert.equal(vuaMo.status, 429);
  assert.equal(daGui.length, 0);
});

test('lớp 5: chỉ số di động Việt Nam 10 số — không gửi số quốc tế, số bàn, số bịa', { skip: BO_QUA }, async () => {
  for (const so of ['+1 415 555 0100', '+44 7700 900123', '0283 8123 456', '0911111111', '0123456789', '12345', 'abc']) {
    assert.equal((await guiMa(so)).status, 400, so);
  }
  assert.equal(daGui.length, 0);
});

test('luồng đúng: gửi qua Zalo, tin trung tính, xác nhận ra vé đúng số, mã dùng một lần', { skip: BO_QUA }, async () => {
  const so = sdtMoi();
  const r = await guiMa(so);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.kenh, 'zalo');
  assert.equal(r.body.maThu, undefined, 'kênh thật không bao giờ trả mã ra màn hình');
  assert.equal(daGui.length, 1);
  const tin = daGui[0];
  assert.equal(tin.soDienThoai, so);
  assert.doesNotMatch(tin.noiDung, /c[oô]ng\s*an|t[oố]\s*gi[aá]c|ph[aả]n\s*[aá]nh|ph[uư][oờ]ng/i, 'tin hiện trên màn hình — không được lộ việc tố giác');
  const ma = maTrongTin(tin);
  const xn = await goi('/xac-nhan', { soDienThoai: so, ma, phien: r.body.phien });
  assert.equal(xn.status, 200, JSON.stringify(xn.body));
  assert.equal(veSdtHopLe(xn.body.veSdt, so), true);
  assert.equal(veSdtHopLe(xn.body.veSdt, sdtMoi()), false, 'vé của số này không dùng cho số khác');
  assert.equal(veSdtHopLe('vé-bịa', so), false);
  assert.equal((await goi('/xac-nhan', { soDienThoai: so, ma, phien: r.body.phien })).status, 400, 'mã đã dùng không dùng lại được');
});

test('không gửi được Zalo thì chuyển sang SMS', { skip: BO_QUA }, async () => {
  zaloHong = true;
  const r = await guiMa(sdtMoi());
  assert.equal(r.status, 200);
  assert.equal(r.body.kenh, 'sms');
  assert.deepEqual(daGui.map((t) => t.kenh), ['sms']);
});

test('CSDL không giữ số điện thoại thật, không giữ mã thật', { skip: BO_QUA }, async () => {
  const so = sdtMoi();
  await guiMa(so);
  const ma = maTrongTin(daGui[0]);
  const bang = JSON.stringify([
    ...ctl.db.prepare('SELECT * FROM ma_xac_minh_sdt').all(),
    ...ctl.db.prepare('SELECT * FROM dem_gioi_han').all(),
  ]);
  assert.ok(!bang.includes(so), 'lộ số điện thoại trong CSDL');
  assert.ok(!bang.includes(ma), 'lộ mã trong CSDL');
});

test('lớp 3: cùng một số — chờ 60 giây giữa hai mã, tối đa 3 mã/giờ', { skip: BO_QUA }, async () => {
  const so = sdtMoi();
  assert.equal((await guiMa(so)).status, 200);
  assert.equal((await guiMa(so)).status, 429, 'gửi lại ngay');
  ctl.troiQua(1.1); assert.equal((await guiMa(so)).status, 200);
  ctl.troiQua(1.1); assert.equal((await guiMa(so)).status, 200);
  ctl.troiQua(1.1); assert.equal((await guiMa(so)).status, 429, 'mã thứ 4 trong giờ');
  assert.equal(daGui.length, 3);
});

test('lớp 4: cùng một mạng — tối đa 10 mã/giờ dù mỗi lần một số khác', { skip: BO_QUA }, async () => {
  const ip = ipMoi();
  const ma = [];
  for (let k = 0; k < 13; k++) ma.push((await guiMa(sdtMoi(), ip)).status);
  assert.equal(ma.filter((m) => m === 200).length, 10, ma.join(','));
  assert.equal(daGui.length, 10);
});

test('lớp 6: trần tin cả hệ thống — 40 yêu cầu gửi DỒN CÙNG LÚC, trần 5: đúng 5 tin đi', { skip: BO_QUA }, async () => {
  process.env.XAC_MINH_TRAN_NGAY = '5';
  const kq = await Promise.all(Array.from({ length: 40 }, () => guiMa(sdtMoi())));
  assert.equal(daGui.length, 5, `trần 5 mà gửi ${daGui.length} tin`);
  const tat = kq.filter((r) => r.status === 503);
  assert.equal(tat.length, 35);
  assert.match(tat[0].body.error, /vẫn gửi ý kiến/, 'chạm trần: ngừng gửi mã, KHÔNG ngừng nhận ý kiến');
});

test('xác nhận: sai 5 lần là huỷ mã — đúng mã sau đó cũng không qua; gửi dồn không lọt quá 5 lượt so', { skip: BO_QUA }, async () => {
  const so = sdtMoi();
  const { phien } = (await guiMa(so)).body;
  const ma = maTrongTin(daGui[0]);
  const sai = String((Number(ma) - 100000 + 1) % 900000 + 100000);
  const kq = await Promise.all(Array.from({ length: 20 }, () => goi('/xac-nhan', { soDienThoai: so, ma: sai, phien })));
  assert.equal(kq.filter((r) => r.status === 400).length, 5, kq.map((r) => r.status).join(','));
  assert.equal((await goi('/xac-nhan', { soDienThoai: so, ma, phien })).status, 429, 'mã đã huỷ');
});

test('mã hết hạn sau 5 phút', { skip: BO_QUA }, async () => {
  const so = sdtMoi();
  const { phien } = (await guiMa(so)).body;
  ctl.troiQua(5.5);
  assert.equal((await goi('/xac-nhan', { soDienThoai: so, ma: maTrongTin(daGui[0]), phien })).status, 400);
});

test('thiếu bảng (chưa chạy v38): TẮT, không gửi tin nào', { skip: BO_QUA }, async () => {
  ctl.db.exec('DROP TABLE dem_gioi_han');
  const r = await guiMa(sdtMoi());
  assert.equal(r.status, 503);
  assert.equal(daGui.length, 0);
});

/* ---- Rà soát bảo mật của phiên (trọng tài subagent) tìm ra 4 lỗi — test đỏ trước khi vá ---- */
const { hashIdentifier, hashPhone } = await import('../src/lib/crypto.js');

test('R1 — bộ đếm/bảng mã KHÔNG dùng chung bản băm với submissions: không nối được IP tin ẩn danh -> số điện thoại', { skip: BO_QUA }, async () => {
  const so = sdtMoi(); const ip = ipMoi();
  assert.equal((await guiMa(so, ip)).status, 200);
  const bang = JSON.stringify([
    ...ctl.db.prepare('SELECT * FROM ma_xac_minh_sdt').all(),
    ...ctl.db.prepare('SELECT * FROM dem_gioi_han').all(),
  ]);
  assert.ok(!bang.includes(hashIdentifier(ip).slice(0, 32)), 'băm IP giống submissions.ip_address — nối được với tin ẩn danh');
  assert.ok(!bang.includes(hashPhone(so)), 'băm SĐT giống submissions.sender_phone_hash');
});

test('R1 — mã cũ quá 1 ngày tự bị xoá (không giữ lịch sử ai nhận mã lúc nào)', { skip: BO_QUA }, async () => {
  await guiMa(sdtMoi());
  ctl.troiQua(25 * 60);
  await guiMa(sdtMoi());
  assert.equal(ctl.db.prepare('SELECT COUNT(*) n FROM ma_xac_minh_sdt').get().n, 1);
});

test('R2 — chạy thật (không phải development/test) mà thiếu Turnstile thì TẮT', () => {
  assert.equal(trangThai({ KENH_XAC_MINH_SDT: 'sms', NODE_ENV: 'production' }).bat, false);
  assert.equal(trangThai({ KENH_XAC_MINH_SDT: 'sms' }).bat, false, 'quên NODE_ENV');
  assert.equal(trangThai({ KENH_XAC_MINH_SDT: 'sms', NODE_ENV: 'production', TURNSTILE_SECRET_KEY: 'k' }).bat, true);
});

test('R2 — hai người mở trang cùng một giây nhận hai phiếu/vé KHÁC nhau', async () => {
  const { capPhieuMoForm } = await import('../src/lib/phieu-mo-form.js');
  const { capVe } = await import('../src/lib/cong-vao.js');
  assert.notEqual(capPhieuMoForm(), capPhieuMoForm());
  assert.notEqual(capVe(), capVe());
});

test('R2 — một phiếu mở form không xin mã mãi được (tối đa 3 mã cho mỗi phiếu)', { skip: BO_QUA }, async () => {
  const phieu = phieuCu();
  const ma = [];
  for (let k = 0; k < 12; k++) ma.push((await goi('/gui-ma', { soDienThoai: sdtMoi(), phieuMoForm: phieu, deviceId: crypto.randomUUID() })).status);
  assert.equal(daGui.length, 3, `một phiếu gửi được ${daGui.length} tin: ${ma.join(',')}`);
});

test('R3 — lượt bị chặn theo mạng KHÔNG được ăn hạn mức của số nạn nhân', { skip: BO_QUA }, async () => {
  const ipXau = ipMoi();
  for (let k = 0; k < 10; k++) await guiMa(sdtMoi(), ipXau);
  const nanNhan = sdtMoi();
  for (let k = 0; k < 5; k++) assert.equal((await guiMa(nanNhan, ipXau)).status, 429);
  const r = await guiMa(nanNhan);
  assert.equal(r.status, 200, `nạn nhân bị khoá oan: ${JSON.stringify(r.body)}`);
});

test('R4 — Zalo lỗi mập mờ (ném lỗi/hết giờ) thì KHÔNG gửi thêm SMS: có thể đã tính tiền Zalo', { skip: BO_QUA }, async () => {
  dangKyKenh('zalo_cham', { guiMa: async () => { throw new Error('timeout'); } });
  process.env.KENH_XAC_MINH_SDT = 'zalo_cham,sms';
  const r = await guiMa(sdtMoi());
  assert.equal(daGui.length, 0, 'đã gửi thêm SMS sau khi Zalo hết giờ');
  assert.equal(r.status, 502);
});

test('R4 — Zalo từ chối rõ ràng thì sang SMS, nhưng tin SMS cũng phải trừ vào trần', { skip: BO_QUA }, async () => {
  zaloHong = true;
  process.env.XAC_MINH_TRAN_NGAY = '1';
  const r = await guiMa(sdtMoi());
  assert.equal(daGui.length, 0, 'trần 1 tin mà Zalo + SMS là 2 lượt tính tiền');
  assert.notEqual(r.status, 200);
});

test('lớp 1: bật Turnstile thì không có vé vào cửa không gửi được mã; có vé thì qua, mỗi vé tối đa 3 mã', { skip: BO_QUA }, async () => {
  const { capVe } = await import('../src/lib/cong-vao.js');
  process.env.TURNSTILE_SECRET_KEY = 'khoa-thu';
  try {
    assert.equal((await guiMa(sdtMoi())).status, 403, 'không có vé vào cửa');
    assert.equal(daGui.length, 0);
    const ve = capVe();
    const ma = [];
    for (let k = 0; k < 6; k++) ma.push((await guiMa(sdtMoi(), ipMoi(), { veVaoCua: ve })).status);
    assert.equal(daGui.length, 3, `một vé gửi được ${daGui.length} tin: ${ma.join(',')}`);
  } finally {
    delete process.env.TURNSTILE_SECRET_KEY;
  }
});

/* ---- P89: nối vào trang gửi ý kiến — chỉ mở Zalo, SMS xây sẵn; 3 mã/giờ/máy ---- */
const { guiQuaKenh } = await import('../src/lib/kenh-gui-ma.js');

test('P89 — thiếu hoặc sai mã thiết bị thì không gửi mã (bot không bỏ trống để né giới hạn theo máy)', { skip: BO_QUA }, async () => {
  for (const deviceId of [undefined, '', 'abc', 'zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz', [crypto.randomUUID()], { a: 1 }]) {
    const r = await goi('/gui-ma', { soDienThoai: sdtMoi(), phieuMoForm: phieuCu(), deviceId });
    assert.equal(r.status, 400, JSON.stringify(deviceId));
  }
  assert.equal(daGui.length, 0);
});

test('P89 — cùng một máy: tối đa 3 mã/giờ dù mỗi lần một số khác, một mạng khác', { skip: BO_QUA }, async () => {
  const may = crypto.randomUUID();
  const ma = [];
  for (let k = 0; k < 5; k++) ma.push((await guiMa(sdtMoi(), ipMoi(), { deviceId: may })).status);
  assert.deepEqual(ma, [200, 200, 200, 429, 429]);
  assert.equal(daGui.length, 3);
  assert.equal((await guiMa(sdtMoi(), ipMoi(), { deviceId: may.toUpperCase() })).status, 429, 'viết hoa vẫn là cùng một máy');
  ctl.troiQua(61);
  assert.equal((await guiMa(sdtMoi(), ipMoi(), { deviceId: may })).status, 200, 'qua 1 giờ thì gửi lại được');
});

test('P89 — lượt bị chặn theo máy KHÔNG ăn hạn mức của số nạn nhân', { skip: BO_QUA }, async () => {
  const may = crypto.randomUUID();
  for (let k = 0; k < 3; k++) await guiMa(sdtMoi(), ipMoi(), { deviceId: may });
  const nanNhan = sdtMoi();
  for (let k = 0; k < 4; k++) assert.equal((await guiMa(nanNhan, ipMoi(), { deviceId: may })).status, 429);
  const r = await guiMa(nanNhan);
  assert.equal(r.status, 200, `nạn nhân bị khoá oan: ${JSON.stringify(r.body)}`);
});

test('P89 — trạng thái cho giao diện biết kênh nào đang mở (để hiện/ẩn nút "Gửi qua SMS")', { skip: BO_QUA }, async () => {
  process.env.KENH_XAC_MINH_SDT = 'zalo';
  assert.deepEqual((await goi('/trang-thai')).body, { bat: true, kenh: ['zalo'] });
  process.env.KENH_XAC_MINH_SDT = 'zalo,sms';
  assert.deepEqual((await goi('/trang-thai')).body, { bat: true, kenh: ['zalo', 'sms'] });
  delete process.env.KENH_XAC_MINH_SDT;
  assert.deepEqual((await goi('/trang-thai')).body, { bat: false, kenh: [] });
});

test('P89 — chỉ mở Zalo: Zalo từ chối thì báo chưa gửi được, KHÔNG tự sang SMS', { skip: BO_QUA }, async () => {
  process.env.KENH_XAC_MINH_SDT = 'zalo';
  zaloHong = true;
  const r = await guiMa(sdtMoi());
  assert.equal(r.status, 502);
  assert.equal(daGui.length, 0, 'SMS chưa mở mà vẫn gửi SMS');
});

test('P89 — người dân tự chọn gửi qua SMS (khi đã mở SMS): chỉ SMS đi, không gửi Zalo trước', { skip: BO_QUA }, async () => {
  const r = await guiMa(sdtMoi(), ipMoi(), { kenh: 'sms' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.kenh, 'sms');
  assert.deepEqual(daGui.map((t) => t.kenh), ['sms']);
  const row = ctl.db.prepare('SELECT kenh FROM ma_xac_minh_sdt ORDER BY id DESC LIMIT 1').get();
  assert.equal(row.kenh, 'sms');
});

test('P89 — SMS chưa mở thì yêu cầu "gửi qua SMS" bị từ chối, không tin nào đi; kênh lạ cũng vậy', { skip: BO_QUA }, async () => {
  process.env.KENH_XAC_MINH_SDT = 'zalo';
  for (const kenh of ['sms', 'thu', 'SMS', ['sms'], 'khongco']) {
    const r = await guiMa(sdtMoi(), ipMoi(), { kenh });
    assert.equal(r.status, 400, JSON.stringify(kenh));
  }
  assert.equal(daGui.length, 0);
});

test('P89 — bộ kết nối nhận được chính mã 6 số (mẫu Zalo chỉ có một biến là mã)', { skip: BO_QUA }, async () => {
  await guiMa(sdtMoi());
  assert.equal(daGui[0].ma, maTrongTin(daGui[0]));
  const nhan = [];
  dangKyKenh('bat_ma', { guiMa: async (t) => (nhan.push(t), { ok: true }) });
  await guiQuaKenh(['bat_ma'], { soDienThoai: '0912345678', noiDung: 'x', ma: '123456' });
  assert.equal(nhan[0].ma, '123456');
});

/* ---- BUG-042 (trọng tài P89): xác nhận không được lộ "số này đang có mã chờ", không đốt được mã người khác ---- */
test('BUG-042 — không có mã phiên: số có mã chờ và số không có mã trả lời Y HỆT, không lượt nào bị trừ, người thật vẫn xác nhận được', { skip: BO_QUA }, async () => {
  const nanNhan = sdtMoi();
  const { phien } = (await guiMa(nanNhan)).body;
  const ma = maTrongTin(daGui[0]);
  const khongCoMa = sdtMoi();
  const thu = async (so, them = {}) => {
    const r = await goi('/xac-nhan', { soDienThoai: so, ma: '000000', ...them });
    return `${r.status} ${JSON.stringify(r.body)}`;
  };
  const coMa = []; const khong = [];
  for (let k = 0; k < 8; k++) { coMa.push(await thu(nanNhan)); khong.push(await thu(khongCoMa)); }
  assert.deepEqual(coMa, khong, 'trả lời khác nhau -> biết số nào đang có mã chờ');
  const row = ctl.db.prepare('SELECT so_lan_sai FROM ma_xac_minh_sdt ORDER BY id DESC LIMIT 1').get();
  assert.equal(row.so_lan_sai, 0, 'lượt dò không có phiên đã trừ vào mã của nạn nhân');
  /* phiên bịa, phiên sai chữ ký, phiên của SỐ KHÁC, vé khác ký cùng khoá */
  const phienSoKhac = (await guiMa(sdtMoi())).body.phien;
  const phieu = phieuCu();
  const gia = jwt.sign({ purpose: 'sdt_phien_ma', id: 1, sdt: 'x' }, 'khoa-khac');
  for (const p of ['bịa', gia, phienSoKhac, phieu, ['mảng']]) {
    assert.equal(await thu(nanNhan, { phien: p }), khong[0], `phiên ${String(p).slice(0, 20)} mở được mã của nạn nhân`);
  }
  assert.equal(ctl.db.prepare('SELECT so_lan_sai FROM ma_xac_minh_sdt WHERE id = 1').get()?.so_lan_sai ?? 0, 0);
  const xn = await goi('/xac-nhan', { soDienThoai: nanNhan, ma, phien });
  assert.equal(xn.status, 200, `người thật bị chặn sau khi bị dò: ${JSON.stringify(xn.body)}`);
});

test('BUG-042 — mã phiên không dùng làm vé "đã xác minh số", và vé xác minh không dùng làm mã phiên', { skip: BO_QUA }, async () => {
  const so = sdtMoi();
  const { phien } = (await guiMa(so)).body;
  assert.equal(typeof phien, 'string');
  assert.equal(veSdtHopLe(phien, so), false, 'mã phiên mở được nhãn "đã xác minh"');
  const xn = await goi('/xac-nhan', { soDienThoai: so, ma: maTrongTin(daGui[0]), phien });
  assert.equal(xn.status, 200);
  ctl.troiQua(1.1);
  const lan2 = await guiMa(so);
  assert.equal(lan2.status, 200, JSON.stringify(lan2.body));
  const r = await goi('/xac-nhan', { soDienThoai: so, ma: maTrongTin(daGui[daGui.length - 1]), phien: xn.body.veSdt });
  assert.equal(r.status, 400, 'vé xác minh dùng thay mã phiên');
});

/* ---- BUG-043 (sinh ra bởi fix BUG-042, RETEST P93): mã phiên không được lộ bộ đếm mã toàn hệ thống ---- */
test('BUG-043 — đọc mã phiên (JWT chỉ ký, ai cũng giải được phần thân) không ra số thứ tự của mã / số người vừa xin mã', { skip: BO_QUA }, async () => {
  const so = sdtMoi();
  const lan1 = (await guiMa(so)).body.phien;
  await guiMa(sdtMoi());            // một người khác xin mã ở giữa
  ctl.troiQua(1.1);
  const lan2 = (await guiMa(so)).body.phien;
  const ids = ctl.db.prepare('SELECT id FROM ma_xac_minh_sdt ORDER BY id').all().map((r) => String(r.id));
  for (const phien of [lan1, lan2]) {
    const than = jwt.decode(phien);
    const { iat, exp, ...con } = than;
    for (const [k, v] of Object.entries(con)) {
      assert.notEqual(typeof v, 'number', `trường "${k}" là số — đọc được thứ tự`);
      assert.ok(!ids.includes(String(v)), `trường "${k}" lộ khoá chính của mã`);
    }
  }
  assert.notDeepEqual(jwt.decode(lan1).k, jwt.decode(lan2).k);
  /* Vá không được phá BUG-042: phiên vẫn chỉ mở đúng mã của nó */
  const r = await goi('/xac-nhan', { soDienThoai: so, ma: maTrongTin(daGui[daGui.length - 1]), phien: lan2 });
  assert.equal(r.status, 200, JSON.stringify(r.body));
});
