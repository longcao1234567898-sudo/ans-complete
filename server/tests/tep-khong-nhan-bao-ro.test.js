/**
 * BUG-035 — TỆP ĐÍNH KÈM KHÔNG NHẬN ĐƯỢC PHẢI ĐƯỢC BÁO RÕ (người vận hành chọn hướng B)
 * ============================================================================
 *
 * Trước: tệp bị chặn (kiểm an toàn) hoặc lưu lỗi bị bỏ, chỉ còn một dòng
 * console.warn; máy chủ vẫn trả 201 như thường. Người dân tưởng chứng cứ đã tới,
 * cán bộ không biết từng có tệp để liên hệ xin lại.
 *
 * Hướng B: vẫn nhận ý kiến; phản hồi kèm danh sách tệp không nhận + lý do để
 * giao diện báo cho người dân; ghi cho cán bộ "có N tệp không nhận được: lý do".
 * Cán bộ KHÔNG được thấy tên tệp: tên tệp do máy người dân đặt, hay chứa họ tên
 * ("Don_Nguyen_Van_A.pdf") — tin ẩn danh mà lộ tên qua đây là hỏng cả lời hứa ẩn danh.
 *
 * Biến thể lấy từ buglogs/bugs/BUG-035.md (a)–(g). Dữ liệu GIẢ.
 */
import { describe, test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { datBienMoiTruongHopLe } from './helpers-test.js';
import { BO_QUA, dungCsdl, goi, donCoTen, TRUONG, CAN_BO } from './khung-sqlite.js';

datBienMoiTruongHopLe();
const { pool } = await import('../src/db.js');
const { signAccessToken } = await import('../src/lib/token.js');
const { default: submissionsRouter } = await import('../src/routes/submissions.js');
const { default: chatRouter } = await import('../src/routes/chat.js');
const { default: adminRouter } = await import('../src/routes/admin/index.js');
const tepKhongNhan = await import('../src/lib/tep-khong-nhan.js').catch(() => ({}));

const doc = (p) => readFile(new URL(`../../${p}`, import.meta.url), 'utf8');
const fixture = (ten) => readFile(new URL(`./fixtures/${ten}`, import.meta.url));

/* Bảng mới (nang_cap_v35.sql) bản SQLite */
const BANG = `CREATE TABLE tep_khong_nhan (id INTEGER PRIMARY KEY AUTOINCREMENT, submission_id INT NOT NULL,
  bo_sung_id INT, loai TEXT NOT NULL, ly_do TEXT NOT NULL, created_at TEXT DEFAULT (NOW()))`;

const TEN_LO_DANH_TINH = 'Don_to_giac_Nguyen_Van_Thu_CCCD.pdf';
/* PDF có JavaScript tự chạy khi mở — mọi phiên bản bộ kiểm đều phải chặn */
const PDF_DOC = `data:application/pdf;base64,${Buffer.from(
  '%PDF-1.7\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R /OpenAction << /S /JavaScript /JS (app.alert\\(1\\)) >> >>\nendobj\n'
  + '2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n', 'latin1').toString('base64')}`;
const PDF_SCAN = `data:application/pdf;base64,${(await fixture('ocr-pdf-scan.pdf')).toString('base64')}`;
const JPEG = `data:image/jpeg;base64,${Buffer.concat([Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]), Buffer.alloc(64, 1), Buffer.from([0xFF, 0xD9])]).toString('base64')}`;
const GIA_ANH = `data:image/jpeg;base64,${Buffer.from('MZ\x90\x00 This program cannot be run in DOS mode').toString('base64')}`;

const TO_GIAC = 'Tối thứ bảy tuần trước khoảng 22 giờ, tại bến sông khu phố 2 có nhóm người dùng hai tàu hút '
  + 'cát trái phép rồi chở đi bằng xe tải không biển số.';

let ctl;
beforeEach(() => {
  if (BO_QUA) return;
  ctl = dungCsdl(pool, { themCau: [BANG] });
  tepKhongNhan.quenBangTepKhongNhan?.();
});

const gui = (body) => goi({ duongGoc: '/api/submissions', router: submissionsRouter, method: 'POST', duong: '/', body });
const API = (staff, method, duong, body) => goi({ duongGoc: '/api/admin', router: adminRouter, staff, signAccessToken, method, duong, body });
const dongKhongNhan = () => ctl.db.prepare('SELECT * FROM tep_khong_nhan ORDER BY id').all();
const soTep = () => ctl.db.prepare('SELECT COUNT(*) AS n FROM submission_images').get().n;

describe('BUG-035 — gửi ý kiến', () => {
  test('(a)(e)(f) tin có tên: PDF bị chặn được báo lại cho người dân, tệp hợp lệ vẫn lưu', { skip: BO_QUA }, async () => {
    const r = await gui(donCoTen(0, { taiLieu: [{ ten: TEN_LO_DANH_TINH, data: PDF_DOC }, { ten: 'scan.pdf', data: PDF_SCAN }] }));
    assert.equal(r.status, 201, r.text.slice(0, 300));
    assert.ok(Array.isArray(r.body.tepKhongNhan), 'phản hồi phải có danh sách tepKhongNhan');
    assert.equal(r.body.tepKhongNhan.length, 1);
    assert.equal(r.body.tepKhongNhan[0].ten, TEN_LO_DANH_TINH, 'người dân cần biết tệp NÀO không nhận');
    assert.match(r.body.tepKhongNhan[0].lyDo, /tự chạy/);
    assert.equal(soTep(), 1, 'tệp scan hợp lệ vẫn phải lưu');
  });

  test('(g) cán bộ có dấu: loại tệp + lý do, KHÔNG có tên tệp', { skip: BO_QUA }, async () => {
    const r = await gui(donCoTen(0, { taiLieu: [{ ten: TEN_LO_DANH_TINH, data: PDF_DOC }] }));
    assert.equal(r.status, 201, r.text.slice(0, 300));
    const ds = dongKhongNhan();
    assert.equal(ds.length, 1);
    assert.equal(ds[0].loai, 'tai_lieu');
    assert.equal(ds[0].bo_sung_id, null);
    assert.match(ds[0].ly_do, /tự chạy/);
    assert.ok(!JSON.stringify(ds).includes('Nguyen_Van_Thu'), 'tên tệp (có thể chứa họ tên) không được lưu');
  });

  test('(b)(e) tin ẩn danh: ảnh bị chặn được báo, có dấu cho cán bộ', { skip: BO_QUA }, async () => {
    const r = await gui({ isAnonymous: true, category: 'to_giac', content: TO_GIAC, images: [JPEG, GIA_ANH] });
    assert.equal(r.status, 201, r.text.slice(0, 300));
    assert.equal(r.body.tepKhongNhan?.length, 1);
    assert.equal(r.body.tepKhongNhan[0].ten, 'Ảnh 2');
    assert.ok(r.body.tepKhongNhan[0].lyDo.length > 5);
    assert.deepEqual(dongKhongNhan().map((d) => d.loai), ['anh']);
  });

  test('gửi quá số tệp tối đa: phần thừa không bị bỏ âm thầm', { skip: BO_QUA }, async () => {
    const r = await gui(donCoTen(1, { images: [JPEG, JPEG, JPEG, JPEG] }));
    assert.equal(r.status, 201, r.text.slice(0, 300));
    assert.equal(r.body.tepKhongNhan?.length, 1);
    /* Phần thừa gộp một mục (trọng tài P58: mỗi phần tử một mục là khuếch đại) */
    assert.match(r.body.tepKhongNhan[0].ten, /^1 ảnh gửi thừa$/);
    assert.match(r.body.tepKhongNhan[0].lyDo, /tối đa 3 ảnh/);
    assert.equal(dongKhongNhan().length, 1);
  });

  test('(c) lưu tệp lỗi: được báo, và tệp sau vẫn được lưu', { skip: BO_QUA }, async () => {
    const goc = pool.query;
    let lan = 0;
    pool.query = async (sql, p) => {
      if (/INSERT INTO submission_images/i.test(String(sql)) && (lan += 1) === 1) {
        throw Object.assign(new Error("Data too long for column 'image_url'"), { code: 'ER_DATA_TOO_LONG' });
      }
      return goc(sql, p);
    };
    try {
      const r = await gui(donCoTen(2, { taiLieu: [{ ten: 'mot.pdf', data: PDF_SCAN }, { ten: 'hai.pdf', data: PDF_SCAN }] }));
      assert.equal(r.status, 201, r.text.slice(0, 300));
      assert.equal(r.body.tepKhongNhan?.length, 1);
      assert.equal(r.body.tepKhongNhan[0].ten, 'mot.pdf');
      assert.doesNotMatch(r.body.tepKhongNhan[0].lyDo, /Data too long|image_url/, 'không lộ câu lỗi CSDL cho người ngoài');
      assert.equal(soTep(), 1, 'tệp thứ hai vẫn phải lưu');
      assert.equal(dongKhongNhan().length, 1);
    } finally {
      pool.query = goc;
    }
  });

  test('không có tệp nào bị bỏ: danh sách rỗng, không ghi gì cho cán bộ', { skip: BO_QUA }, async () => {
    const r = await gui(donCoTen(3, { images: [JPEG], taiLieu: [{ ten: 'scan.pdf', data: PDF_SCAN }] }));
    assert.equal(r.status, 201, r.text.slice(0, 300));
    assert.deepEqual(r.body.tepKhongNhan, []);
    assert.equal(dongKhongNhan().length, 0);
    assert.equal(soTep(), 2);
  });

  test('chưa chạy nang_cap_v35.sql: ý kiến vẫn nhận, người dân vẫn được báo', { skip: BO_QUA }, async () => {
    ctl = dungCsdl(pool);
    tepKhongNhan.quenBangTepKhongNhan?.();
    const r = await gui(donCoTen(4, { taiLieu: [{ ten: 'x.pdf', data: PDF_DOC }] }));
    assert.equal(r.status, 201, r.text.slice(0, 300));
    assert.equal(r.body.tepKhongNhan?.length, 1);
  });
});

/* ------------------------------------------------------------------ bổ sung */

const PIN_BAM = bcrypt.hashSync('482913', 4);
const ve = (id) => jwt.sign({ sub: id, purpose: 'chat_reporter' }, process.env.JWT_SECRET, { expiresIn: '2h' });
async function guiBoSung(id, body) {
  const express = (await import('express')).default;
  const app = express();
  app.use(express.json({ limit: '2mb' }));
  app.use('/api/chat', chatRouter);
  const sv = app.listen(0);
  try {
    const r = await fetch(`http://127.0.0.1:${sv.address().port}/api/chat/bo-sung`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ve(id)}` }, body: JSON.stringify(body),
    });
    const text = await r.text();
    let json = null; try { json = JSON.parse(text); } catch { /* trống */ }
    return { status: r.status, body: json, text };
  } finally { sv.close(); }
}

describe('BUG-035 (d) — bổ sung trong 72 giờ', () => {
  test('ảnh bổ sung bị chặn: báo người dân, cán bộ có dấu gắn đúng lần bổ sung', { skip: BO_QUA }, async () => {
    ctl.db.prepare(`INSERT INTO submissions (id, tracking_code, original_content, category_id, status, is_anonymous,
        chat_pin_hash, created_at) VALUES (10, 'ABC123', 'Đèn đường hỏng', 3, 'received', 1, ?, ?)`).run(PIN_BAM, ctl.luc(60));
    const r = await guiBoSung(10, { noiDung: 'Bổ sung: đèn hỏng ở cột số 14, sát nhà văn hoá thôn.', images: [GIA_ANH, JPEG] });
    assert.equal(r.status, 201, r.text);
    assert.equal(r.body.tepKhongNhan?.length, 1);
    assert.equal(r.body.tepKhongNhan[0].ten, 'Ảnh 1');
    const boSungId = ctl.db.prepare('SELECT id FROM bo_sung_thong_tin WHERE submission_id = 10').get().id;
    assert.deepEqual(dongKhongNhan().map((d) => [d.submission_id, d.bo_sung_id, d.loai]), [[10, boSungId, 'anh']]);
  });
});

/* ------------------------------------------------------------- trang cán bộ */

describe('BUG-035 (g) — trang chi tiết của cán bộ', () => {
  test('trả danh sách tệp không nhận được (loại, lý do, lần bổ sung) cho người xem được hồ sơ', { skip: BO_QUA }, async () => {
    ctl.db.prepare(`INSERT INTO submissions (id, tracking_code, original_content, category_id, status, is_anonymous)
        VALUES (5, 'HSO005', 'Phản ánh lấn chiếm vỉa hè', 3, 'processing', 0)`).run();
    ctl.db.prepare(`INSERT INTO tep_khong_nhan (submission_id, bo_sung_id, loai, ly_do) VALUES
        (5, NULL, 'tai_lieu', 'Tệp PDF này có phần tự chạy nên không an toàn để nhận.')`).run();
    const r = await API(TRUONG, 'GET', '/submissions/5');
    assert.equal(r.status, 200, r.text.slice(0, 300));
    assert.equal(r.body.tep_khong_nhan?.length, 1);
    assert.equal(r.body.tep_khong_nhan[0].loai, 'tai_lieu');
    assert.match(r.body.tep_khong_nhan[0].ly_do, /tự chạy/);
  });
});

/* ---------------------------------------------- tệp nâng cấp + giao diện */

describe('BUG-035 — tệp nâng cấp và giao diện', () => {
  test('nang_cap_v35.sql tạo bảng tep_khong_nhan, không có cột tên tệp', async () => {
    const sql = await doc('database/nang_cap_v35.sql');
    assert.match(sql, /^SET NAMES utf8mb4;/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS tep_khong_nhan/);
    assert.doesNotMatch(sql, /^\s*(USE|DROP)\b/im);
    const bang = sql.slice(sql.indexOf('CREATE TABLE IF NOT EXISTS tep_khong_nhan'));
    assert.doesNotMatch(bang.slice(0, bang.indexOf(';')), /\bten(_tep)?\b|file_?name/i);
  });

  test('màn hình gửi xong báo tệp không nhận; trang bổ sung và trang cán bộ cũng hiện', async () => {
    assert.match(await doc('src/components/FeedbackForm/Confirmation.tsx'), /tepKhongNhan/);
    assert.match(await doc('src/types/feedback.ts'), /tepKhongNhan/);
    assert.match(await doc('src/components/Tracking/BoSungThongTin.tsx'), /tepKhongNhan/);
    assert.match(await doc('src/services/adminService.ts'), /tep_khong_nhan/);
    assert.match(await doc('src/pages/admin/AdminSubmissionDetailPage.tsx'), /tep_khong_nhan/);
  });
});


/* ------------------------------------------- lỗi trọng tài P58 tìm ra ở bản vá đầu */

describe('BUG-035 — trọng tài: bản vá không được tạo lỗi mới', () => {
  const NHIEU = 5000;
  const soDong = () => ctl.db.prepare('SELECT COUNT(*) AS n FROM tep_khong_nhan').get().n;

  test('N1 mảng tệp rất dài: không khuếch đại thành hàng nghìn dòng / mục báo', { skip: BO_QUA }, async () => {
    const r1 = await gui(donCoTen(5, { images: Array(NHIEU).fill('0') }));
    assert.equal(r1.status, 201, r1.text.slice(0, 200));
    assert.ok(r1.body.tepKhongNhan.length <= 4, `phản hồi có ${r1.body.tepKhongNhan.length} mục`);
    const r2 = await gui(donCoTen(6, { taiLieu: Array(NHIEU).fill('0') }));
    assert.equal(r2.status, 201, r2.text.slice(0, 200));
    assert.ok(r2.body.tepKhongNhan.length <= 4, `phản hồi có ${r2.body.tepKhongNhan.length} mục`);
    assert.ok(soDong() <= 8, `ghi ${soDong()} dòng cho hai đơn`);
    assert.ok(r1.body.tepKhongNhan.some((t) => /4997|vượt|tối đa/.test(`${t.ten} ${t.lyDo}`)), 'vẫn phải báo có tệp thừa');
  });

  test('N1 bổ sung với mảng ảnh rất dài cũng không khuếch đại', { skip: BO_QUA }, async () => {
    ctl.db.prepare(`INSERT INTO submissions (id, tracking_code, original_content, category_id, status, is_anonymous,
        chat_pin_hash, created_at) VALUES (20, 'BSA020', 'Đèn đường hỏng', 3, 'received', 1, ?, ?)`).run(PIN_BAM, ctl.luc(60));
    const r = await guiBoSung(20, { noiDung: 'Bổ sung: đèn hỏng ở cột số 14, sát nhà văn hoá thôn.', images: Array(NHIEU).fill('0') });
    assert.equal(r.status, 201, r.text.slice(0, 200));
    assert.ok(r.body.tepKhongNhan.length <= 4);
    assert.ok(soDong() <= 4);
  });

  test('N1 trang cán bộ đọc có giới hạn số dấu', { skip: BO_QUA }, async () => {
    ctl.db.prepare(`INSERT INTO submissions (id, tracking_code, original_content, category_id, status, is_anonymous)
        VALUES (21, 'HSO021', 'Phản ánh', 3, 'processing', 0)`).run();
    const them = ctl.db.prepare(`INSERT INTO tep_khong_nhan (submission_id, loai, ly_do) VALUES (21, 'anh', 'x')`);
    for (let i = 0; i < 500; i += 1) them.run();
    const r = await API(TRUONG, 'GET', '/submissions/21');
    assert.equal(r.status, 200);
    assert.ok(r.body.tep_khong_nhan.length <= 50, `trả ${r.body.tep_khong_nhan.length} mục`);
  });

  const TEN_LA = { toString: 1, valueOf: 1 };
  for (const [ten, taiLieu] of [
    ['ở tệp thứ 1', [{ ten: TEN_LA, data: PDF_SCAN }, { ten: 'b.pdf', data: PDF_SCAN }]],
    ['ở tệp thứ 4 (thừa)', [{ ten: 'a.pdf', data: PDF_SCAN }, { ten: 'b.pdf', data: PDF_SCAN }, { ten: 'c.pdf', data: PDF_SCAN }, { ten: TEN_LA, data: PDF_SCAN }]],
  ]) {
    test(`N2 tên tệp không phải chuỗi ${ten}: vẫn 201, tài liệu hợp lệ vẫn lưu`, { skip: BO_QUA }, async () => {
      const r = await gui(donCoTen(7, { taiLieu }));
      assert.equal(r.status, 201, r.text.slice(0, 200));
      assert.ok(soTep() >= taiLieu.length - 1, `chỉ lưu ${soTep()} tệp`);
      assert.ok(r.body.tepKhongNhan.every((t) => typeof t.ten === 'string'));
    });
  }

  test('N3 lỗi khi chuyển hồ sơ sang chờ duyệt: mỗi ảnh chỉ báo một lần', { skip: BO_QUA }, async () => {
    const goc = pool.query;
    pool.query = async (sql, p) => {
      if (/UPDATE submissions SET status = 'pending_review'/i.test(String(sql))) throw new Error('mat ket noi');
      return goc(sql, p);
    };
    try {
      const r = await gui(donCoTen(8, { images: [JPEG, GIA_ANH], anhNghiNgo: true }));
      assert.equal(r.status, 201, r.text.slice(0, 200));
      const ten = r.body.tepKhongNhan.map((t) => t.ten);
      assert.deepEqual([...new Set(ten)].sort(), [...ten].sort(), `báo trùng: ${JSON.stringify(ten)}`);
      assert.equal(ten.length, 2);
      assert.equal(soDong(), 2);
    } finally {
      pool.query = goc;
    }
  });

  test('N4 lý do lưu cho cán bộ không mang chữ người gửi tự điền', { skip: BO_QUA }, async () => {
    const r = await gui({ isAnonymous: true, category: 'to_giac', content: TO_GIAC,
      images: [{ url: 'https://tran-thi-mai.0912345678.example/a.jpg' }, 'data:tranthimai/0912345678;base64,AAAA'] });
    assert.equal(r.status, 201, r.text.slice(0, 200));
    const lyDo = JSON.stringify(dongKhongNhan().map((d) => d.ly_do));
    assert.ok(dongKhongNhan().length >= 2);
    assert.doesNotMatch(lyDo, /tran-thi-mai|0912345678|tranthimai/);
  });

  test('S1/S2 trường tệp sai kiểu (không phải mảng): báo, không bỏ âm thầm', { skip: BO_QUA }, async () => {
    const r1 = await gui(donCoTen(9, { images: JPEG }));
    assert.equal(r1.status, 201, r1.text.slice(0, 200));
    assert.ok(r1.body.tepKhongNhan.length >= 1);
    const r2 = await gui(donCoTen(10, { taiLieu: { ten: 'a.pdf', data: PDF_SCAN } }));
    assert.equal(r2.status, 201, r2.text.slice(0, 200));
    assert.ok(r2.body.tepKhongNhan.length >= 1);
  });

  test('B1/B4 bổ sung kèm tài liệu, hoặc ảnh dạng lạ: báo, không 500', { skip: BO_QUA }, async () => {
    ctl.db.prepare(`INSERT INTO submissions (id, tracking_code, original_content, category_id, status, is_anonymous,
        chat_pin_hash, created_at) VALUES (22, 'BSA022', 'Đèn đường hỏng', 3, 'received', 0, ?, ?)`).run(PIN_BAM, ctl.luc(60));
    const r1 = await guiBoSung(22, { noiDung: 'Bổ sung: đèn hỏng ở cột số 14, sát nhà văn hoá thôn.', taiLieu: [{ ten: 'a.pdf', data: PDF_SCAN }] });
    assert.equal(r1.status, 201, r1.text.slice(0, 200));
    assert.equal(r1.body.tepKhongNhan?.length, 1);
    const r2 = await guiBoSung(22, { noiDung: 'Bổ sung lần hai: thêm thông tin về cột đèn số 14.', images: [{ url: { toString: 1 } }] });
    assert.equal(r2.status, 201, r2.text.slice(0, 200));
    assert.equal(r2.body.tepKhongNhan?.length, 1);
  });
});
