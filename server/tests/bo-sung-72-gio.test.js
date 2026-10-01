/**
 * VIỆC 21, 22 (ADR-003) — NGƯỜI DÂN BỔ SUNG THÔNG TIN TRONG 72 GIỜ, CHẤM ĐỎ
 *
 * Bắt buộc mã PIN (vé phòng trao đổi), không chỉ mã tra cứu: người lấy được mã
 * tra cứu — có thể chính là người bị tố giác — không được thêm thông tin giả.
 * Phần bổ sung lưu riêng, ghi giờ, không sửa nội dung gốc; ảnh qua cùng lớp
 * kiểm tra an toàn như lúc gửi. 72 giờ tính từ lúc gửi (ADR-003 §7.4), máy chủ
 * tự tính. Số lần bổ sung có giới hạn, đếm atomic (luật 6).
 * Cán bộ thấy chấm đỏ ở mọi danh sách; chấm tắt khi có cán bộ mở hồ sơ.
 */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { datBienMoiTruongHopLe } from './helpers-test.js';
import { BO_QUA, dungCsdl, goi as goiGoc, CAN_BO, TRUONG } from './khung-sqlite.js';

datBienMoiTruongHopLe();

const { pool } = await import('../src/db.js');
const { signAccessToken } = await import('../src/lib/token.js');
const { default: chatRouter } = await import('../src/routes/chat.js');
const { default: adminRouter } = await import('../src/routes/admin/index.js');

const PIN = '482913';
const PIN_BAM = bcrypt.hashSync(PIN, 4);
const ve = (id, purpose = 'chat_reporter') => jwt.sign({ sub: id, purpose }, process.env.JWT_SECRET, { expiresIn: '2h' });

let ctl;
beforeEach(() => {
  if (BO_QUA) return;
  ctl = dungCsdl(pool);
  const them = ctl.db.prepare(`INSERT INTO submissions (id, tracking_code, original_content, category_id, status,
      is_anonymous, chat_pin_hash, created_at, deleted_at) VALUES (?,?,?,3,?,?,?,?,?)`);
  them.run(10, 'ABC123', 'NOIDUNG-GOC đèn đường hỏng', 'received', 0, PIN_BAM, ctl.luc(60), null);
  them.run(11, 'ABC124', 'Tố giác ẩn danh', 'pending_review', 1, PIN_BAM, ctl.luc(71 * 60), null);
  them.run(12, 'ABC125', 'Gửi đã 73 giờ', 'processing', 0, PIN_BAM, ctl.luc(73 * 60), null);
  them.run(13, 'ABC126', 'Đã xử lý xong', 'resolved', 0, PIN_BAM, ctl.luc(60), null);
  them.run(14, 'ABC127', 'Trong thùng rác', 'rejected', 0, PIN_BAM, ctl.luc(60), ctl.luc(30));
});

/* goi() của khung không nhận header riêng — tự gọi */
async function guiBoSungThat(token, body) {
  const express = (await import('express')).default;
  const app = express();
  app.use(express.json({ limit: '2mb' }));
  app.use('/api/chat', chatRouter);
  const sv = app.listen(0);
  try {
    const r = await fetch(`http://127.0.0.1:${sv.address().port}/api/chat/bo-sung`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    });
    const text = await r.text();
    let json = null; try { json = JSON.parse(text); } catch { /* trống */ }
    return { status: r.status, body: json, text };
  } finally { sv.close(); }
}
const boSung = (id) => ctl.db.prepare('SELECT * FROM bo_sung_thong_tin WHERE submission_id = ? ORDER BY thu_tu').all(id);
const NOI_DUNG = 'Bổ sung: đèn hỏng ở cột số 14, sát nhà văn hoá thôn.';

const JPEG = `data:image/jpeg;base64,${Buffer.concat([Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]), Buffer.alloc(64, 1), Buffer.from([0xFF, 0xD9])]).toString('base64')}`;
const GIA_ANH = `data:image/jpeg;base64,${Buffer.from('MZ\x90\x00 This program cannot be run in DOS mode').toString('base64')}`;

test('bổ sung trong 72 giờ bằng vé PIN -> lưu riêng, ghi giờ, nội dung gốc giữ nguyên', { skip: BO_QUA }, async () => {
  const r = await guiBoSungThat(ve(10), { noiDung: NOI_DUNG });
  assert.equal(r.status, 201, r.text);
  const ds = boSung(10);
  assert.equal(ds.length, 1);
  assert.equal(ds[0].noi_dung, NOI_DUNG);
  assert.equal(ds[0].thu_tu, 1);
  assert.ok(ds[0].created_at);
  assert.equal(ctl.db.prepare('SELECT original_content AS c FROM submissions WHERE id = 10').get().c, 'NOIDUNG-GOC đèn đường hỏng');
});

test('tin ẩn danh chờ duyệt, gửi 71 giờ trước -> vẫn bổ sung được', { skip: BO_QUA }, async () => {
  assert.equal((await guiBoSungThat(ve(11), { noiDung: NOI_DUNG })).status, 201);
});

test('không có vé PIN, vé sai mục đích, vé giả -> 401', { skip: BO_QUA }, async () => {
  assert.equal((await guiBoSungThat(null, { noiDung: NOI_DUNG })).status, 401);
  assert.equal((await guiBoSungThat(ve(10, 'tracking'), { noiDung: NOI_DUNG })).status, 401);
  const gia = jwt.sign({ sub: 10, purpose: 'chat_reporter' }, 'khoa-khac-hoan-toan', { expiresIn: '2h' });
  assert.equal((await guiBoSungThat(gia, { noiDung: NOI_DUNG })).status, 401);
  assert.equal(boSung(10).length, 0);
});

test('quá 72 giờ kể từ lúc gửi -> 403', { skip: BO_QUA }, async () => {
  const r = await guiBoSungThat(ve(12), { noiDung: NOI_DUNG });
  assert.equal(r.status, 403, r.text);
  assert.match(r.body.error, /72 giờ/);
  assert.equal(boSung(12).length, 0);
});

test('tin đã xử lý xong hoặc đã vào thùng rác -> 403', { skip: BO_QUA }, async () => {
  assert.equal((await guiBoSungThat(ve(13), { noiDung: NOI_DUNG })).status, 403);
  assert.equal((await guiBoSungThat(ve(14), { noiDung: NOI_DUNG })).status, 403);
});

for (const [ten, noiDung] of [['rỗng', ''], ['quá ngắn', 'ok'], ['quá dài', 'x'.repeat(2001)],
  ['có mã độc', 'Thông tin thêm <script>alert(1)</script> ở cột điện'], ['không phải chuỗi', { a: 1 }]]) {
  test(`nội dung ${ten} -> 400`, { skip: BO_QUA }, async () => {
    assert.equal((await guiBoSungThat(ve(10), { noiDung })).status, 400);
    assert.equal(boSung(10).length, 0);
  });
}

test('ảnh bổ sung qua lớp kiểm tra như lúc gửi: ảnh thật lưu, gắn với lần bổ sung; tệp giả bị chặn', { skip: BO_QUA }, async () => {
  const r = await guiBoSungThat(ve(10), { noiDung: NOI_DUNG, images: [JPEG, GIA_ANH] });
  assert.equal(r.status, 201, r.text);
  const anh = ctl.db.prepare('SELECT * FROM submission_images WHERE submission_id = 10').all();
  assert.equal(anh.length, 1, 'tệp giả mạo ảnh lọt vào');
  assert.equal(anh[0].bo_sung_id, boSung(10)[0].id);
});

test('giới hạn 5 lần bổ sung mỗi tin', { skip: BO_QUA }, async () => {
  for (let i = 0; i < 5; i++) assert.equal((await guiBoSungThat(ve(10), { noiDung: `${NOI_DUNG} lần ${i}` })).status, 201);
  const r = await guiBoSungThat(ve(10), { noiDung: `${NOI_DUNG} lần 6` });
  assert.equal(r.status, 429);
  assert.equal(boSung(10).length, 5);
});

test('gửi dồn 8 lần cùng lúc: không quá 5 lần được nhận (đếm atomic)', { skip: BO_QUA }, async () => {
  const kq = await Promise.all(Array.from({ length: 8 }, (_, i) => guiBoSungThat(ve(10), { noiDung: `${NOI_DUNG} dồn ${i}` })));
  assert.ok(kq.filter((r) => r.status === 201).length <= 5);
  assert.ok(boSung(10).length <= 5, `lưu ${boSung(10).length} lần bổ sung, vượt giới hạn 5`);
  for (const r of kq.filter((x) => x.status !== 201)) assert.equal(r.status, 429, r.text);
});

/* ---- Phía cán bộ: chấm đỏ ------------------------------------------------ */

const goi = (staff, method, duong) => goiGoc({ duongGoc: '/api/admin', router: adminRouter, staff, signAccessToken, method, duong });

test('chấm đỏ: danh sách đếm bổ sung chưa đọc; cán bộ mở hồ sơ thì tắt; chi tiết hiện phần bổ sung kèm ảnh', { skip: BO_QUA }, async () => {
  await guiBoSungThat(ve(10), { noiDung: NOI_DUNG, images: [JPEG] });
  await guiBoSungThat(ve(10), { noiDung: `${NOI_DUNG} (lần 2)` });
  const ds = await goi(CAN_BO, 'GET', '/submissions?phan=sang_loc');
  assert.equal(ds.body.data.find((d) => d.id === 10).bo_sung_chua_doc, 2);

  const ct = await goi(CAN_BO, 'GET', '/submissions/10');
  assert.equal(ct.status, 200, ct.text);
  assert.equal(ct.body.bo_sung.length, 2);
  assert.equal(ct.body.bo_sung[0].noi_dung, NOI_DUNG);
  assert.equal(ct.body.bo_sung[0].anh.length, 1);
  assert.equal(ct.body.images.length, 0, 'ảnh bổ sung lẫn vào ảnh gửi kèm lúc đầu');

  const sau = await goi(TRUONG, 'GET', '/submissions?phan=sang_loc');
  assert.equal(sau.body.data.find((d) => d.id === 10).bo_sung_chua_doc, 0);
});
