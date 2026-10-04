/**
 * TRÍCH CHỮ TỆP ĐÍNH KÈM — HÀNG ĐỢI, API CÁN BỘ, TÌM TRONG TỆP (P52, ADR-005)
 * ============================================================================
 *
 *   · Chỉ cán bộ XEM ĐƯỢC hồ sơ mới trích / đọc được chữ trong tệp của hồ sơ đó:
 *     ngoài phạm vi trả 404 y như mở chi tiết (BUG-009). Chữ trong tệp là bản sao
 *     nội dung tệp — tố giác mật thì cán bộ không được thấy.
 *   · Đọc chữ của hồ sơ mang cờ = mở hồ sơ mang cờ: ghi nhật ký TRƯỚC như trang
 *     chi tiết, ghi không được thì không trả (ADR-003).
 *   · Người dân gửi tin KHÔNG kích OCR (việc nặng chỉ do cán bộ yêu cầu).
 *   · Tìm kiếm danh sách tìm cả chữ trong tệp, không dấu, vẫn trong phạm vi xem.
 *   · Hàng đợi: một việc một lúc, giành việc bằng UPDATE có điều kiện (luật 6);
 *     việc treo quá 15 phút (máy chủ khởi động lại giữa chừng) được làm lại.
 *
 * Route thật qua HTTP thật trên SQLite trong bộ nhớ (khung-sqlite.js); trích chữ
 * thật qua tiến trình con thật.
 */
import { describe, test, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { datBienMoiTruongHopLe } from './helpers-test.js';
import { BO_QUA, dungCsdl, goi, TRUONG, CAN_BO } from './khung-sqlite.js';
import { taoDocx, run } from './gia-lap/tao-docx.js';

datBienMoiTruongHopLe();
const { pool } = await import('../src/db.js');
const { default: adminRouter } = await import('../src/routes/admin/index.js');
const { signAccessToken } = await import('../src/lib/token.js');
const hang = await import('../src/lib/hang-doi-trich-chu.js');
const { dungTienTrinhCon } = await import('../src/lib/trich-chu/index.js');

const BANG = `CREATE TABLE trich_chu_tep (
  id INTEGER PRIMARY KEY AUTOINCREMENT, tep_id INT NOT NULL UNIQUE, submission_id INT NOT NULL,
  trang_thai TEXT NOT NULL DEFAULT 'cho', ngon_ngu TEXT, ngon_ngu_dung TEXT, phuong_phap TEXT,
  noi_dung TEXT, noi_dung_tim TEXT, do_tin_cay INT, so_trang INT, da_chuyen_tcvn3 INT NOT NULL DEFAULT 0,
  ghi_chu TEXT, yeu_cau_boi INT, tao_luc TEXT DEFAULT (NOW()), cap_nhat_luc TEXT DEFAULT (NOW()))`;
const MIME_DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

let ctl;
const API = (staff, method, duong, body) => goi({ duongGoc: '/api/admin', router: adminRouter, staff, signAccessToken, method, duong, body });
function hoSo(id, { coMat = 0, noiDung = 'Phản ánh có tệp đính kèm' } = {}) {
  ctl.db.prepare(`INSERT INTO submissions (id, tracking_code, original_content, status, is_anonymous, to_giac_mat, category_id)
                  VALUES (?,?,?,?,?,?,1)`).run(id, `MA${id}`, noiDung, 'processing', 0, coMat);
}
function tep(idHoSo, mime, buf) {
  return Number(ctl.db.prepare(`INSERT INTO submission_images (submission_id, image_url, storage, mime_type, is_verified, moderation_status)
                                VALUES (?,?,?,?,0,'suspicious')`)
    .run(idHoSo, `data:${mime};base64,${buf.toString('base64')}`, 'base64', mime).lastInsertRowid);
}
const word = (chu) => taoDocx(`<w:p>${run(chu)}</w:p>`);
const dong = (tepId) => ctl.db.prepare('SELECT * FROM trich_chu_tep WHERE tep_id = ?').get(tepId);
const nhatKy = (hanhDong) => ctl.db.prepare('SELECT * FROM staff_activity_logs WHERE action = ? ORDER BY id').all(hanhDong);

describe('Trích chữ — API cán bộ', { skip: BO_QUA, timeout: 180_000 }, () => {
  beforeEach(() => {
    ctl = dungCsdl(pool, { themCau: [BANG] });
  });
  after(() => dungTienTrinhCon());

  test('phải đăng nhập', async () => {
    hoSo(1);
    assert.equal((await API(null, 'GET', '/submissions/1/trich-chu')).status, 401);
    assert.equal((await API(null, 'POST', '/submissions/1/trich-chu', {})).status, 401);
  });

  test('cán bộ yêu cầu trích -> hàng đợi đọc Word và ảnh; GET trả chữ; ghi nhật ký', async () => {
    hoSo(1);
    const tWord = tep(1, MIME_DOCX, word('Biên bản: xe biển số 61-B1 234.56 bỏ chạy về hướng cầu'));
    const tAnh = tep(1, 'image/jpeg', await readFile(new URL('./fixtures/ocr-don-trinh-bao.jpg', import.meta.url)));

    const truoc = await API(CAN_BO, 'GET', '/submissions/1/trich-chu');
    assert.equal(truoc.status, 200, truoc.text);
    assert.equal(truoc.body.coBang, true);
    assert.deepEqual(truoc.body.tep.map((t) => t.trangThai), ['chua', 'chua']);

    const r = await API(CAN_BO, 'POST', '/submissions/1/trich-chu', {});
    assert.equal(r.status, 200, r.text);
    assert.equal(r.body.soViec, 2);
    await hang.chayHangDoi();

    const sau = await API(CAN_BO, 'GET', '/submissions/1/trich-chu');
    const theoId = Object.fromEntries(sau.body.tep.map((t) => [t.tepId, t]));
    assert.equal(theoId[tWord].trangThai, 'xong');
    assert.equal(theoId[tWord].phuongPhap, 'docx');
    assert.match(theoId[tWord].noiDung, /61-B1 234\.56/);
    assert.equal(theoId[tAnh].trangThai, 'xong');
    assert.equal(theoId[tAnh].phuongPhap, 'ocr_anh');
    assert.match(theoId[tAnh].noiDung, /Nguyễn Văn Thử/);
    assert.ok(theoId[tAnh].doTinCay > 50);
    assert.equal(dong(tAnh).noi_dung_tim.includes('nguyen van thu'), true, 'lưu bản không dấu để tìm');
    assert.equal(nhatKy('trich_chu_tep').length, 1);
    assert.equal(nhatKy('trich_chu_tep')[0].staff_id, CAN_BO.id);
  });

  test('gọi lại khi đã xong không trích lại; "trích lại" với ngôn ngữ chọn thì làm lại', async () => {
    hoSo(1);
    const t = tep(1, 'image/jpeg', await readFile(new URL('./fixtures/ocr-tieng-anh.jpg', import.meta.url)));
    await API(CAN_BO, 'POST', '/submissions/1/trich-chu', {});
    await hang.chayHangDoi();
    assert.equal(dong(t).trang_thai, 'xong');
    const lan2 = await API(CAN_BO, 'POST', '/submissions/1/trich-chu', {});
    assert.equal(lan2.body.soViec, 0);

    const lai = await API(CAN_BO, 'POST', '/submissions/1/trich-chu', { tepId: t, lai: true, ngonNgu: 'eng' });
    assert.equal(lai.status, 200, lai.text);
    assert.equal(lai.body.soViec, 1);
    await hang.chayHangDoi();
    assert.equal(dong(t).ngon_ngu, 'eng');
    assert.equal(dong(t).ngon_ngu_dung, 'eng');
    assert.match(dong(t).noi_dung, /INCIDENT REPORT/);
  });

  test('kiểm đầu vào: ngôn ngữ lạ, tệp của hồ sơ khác, mã sai', async () => {
    hoSo(1); hoSo(2);
    tep(1, MIME_DOCX, word('một'));
    const tKhac = tep(2, MIME_DOCX, word('hai'));
    assert.equal((await API(CAN_BO, 'POST', '/submissions/1/trich-chu', { ngonNgu: 'fra' })).status, 400);
    assert.equal((await API(CAN_BO, 'POST', '/submissions/1/trich-chu', { tepId: 'abc' })).status, 400);
    assert.equal((await API(CAN_BO, 'POST', '/submissions/1/trich-chu', { lai: 'co' })).status, 400);
    assert.equal((await API(CAN_BO, 'POST', '/submissions/1/trich-chu', { tepId: tKhac })).status, 404, 'tệp của hồ sơ khác');
    assert.equal((await API(CAN_BO, 'GET', '/submissions/abc/trich-chu')).status, 400);
    assert.equal(ctl.db.prepare('SELECT COUNT(*) AS n FROM trich_chu_tep').get().n, 0);
  });

  test('TỐ GIÁC MẬT: cán bộ 404 cả đọc lẫn yêu cầu; lãnh đạo đọc được và nhật ký ghi TRƯỚC', async () => {
    hoSo(9, { coMat: 1 });
    const t = tep(9, MIME_DOCX, word('Nội dung tố giác mật'));
    assert.equal((await API(CAN_BO, 'GET', '/submissions/9/trich-chu')).status, 404);
    assert.equal((await API(CAN_BO, 'POST', '/submissions/9/trich-chu', {})).status, 404);
    assert.equal(dong(t), undefined);

    assert.equal((await API(TRUONG, 'POST', '/submissions/9/trich-chu', {})).status, 200);
    await hang.chayHangDoi();
    const r = await API(TRUONG, 'GET', '/submissions/9/trich-chu');
    assert.equal(r.status, 200);
    assert.match(r.body.tep[0].noiDung, /tố giác mật/);
    assert.ok(nhatKy('view_flagged_submission').some((d) => d.staff_id === TRUONG.id && Number(d.target_id) === 9));
  });

  test('tố giác mật: ghi nhật ký không được thì KHÔNG trả chữ', async () => {
    hoSo(9, { coMat: 1 });
    tep(9, MIME_DOCX, word('x'));
    ctl.db.exec('DROP TABLE staff_activity_logs');
    const r = await API(TRUONG, 'GET', '/submissions/9/trich-chu');
    assert.equal(r.status, 500);
    assert.equal(r.body?.tep, undefined);
  });

  test('chưa chạy nang_cap_v33.sql: GET báo coBang=false, POST 409 — không 500', async () => {
    ctl = dungCsdl(pool);
    hang.quenBangTrichChu();
    hoSo(1);
    tep(1, MIME_DOCX, word('x'));
    const g = await API(CAN_BO, 'GET', '/submissions/1/trich-chu');
    assert.equal(g.status, 200, g.text);
    assert.equal(g.body.coBang, false);
    assert.equal((await API(CAN_BO, 'POST', '/submissions/1/trich-chu', {})).status, 409);
  });

  test('tệp hỏng -> trạng thái lỗi kèm lý do, không chặn việc sau', async () => {
    hoSo(1);
    const hong = tep(1, 'application/pdf', Buffer.from('%PDF-1.4 hỏng'));
    const tot = tep(1, MIME_DOCX, word('vẫn đọc'));
    await API(CAN_BO, 'POST', '/submissions/1/trich-chu', {});
    await hang.chayHangDoi();
    assert.equal(dong(hong).trang_thai, 'loi');
    assert.match(dong(hong).ghi_chu, /PDF/);
    assert.equal(dong(tot).trang_thai, 'xong');
  });

  test('việc kẹt "đang làm" quá 15 phút (máy chủ khởi động lại) được làm lại', async () => {
    hoSo(1);
    const t = tep(1, MIME_DOCX, word('làm lại'));
    ctl.db.prepare("INSERT INTO trich_chu_tep (tep_id, submission_id, trang_thai, cap_nhat_luc) VALUES (?, 1, 'dang_lam', ?)")
      .run(t, ctl.luc(20));
    await hang.chayHangDoi();
    assert.equal(dong(t).trang_thai, 'xong');
    assert.equal(dong(t).noi_dung, 'làm lại');
  });

  test('việc "đang làm" chưa tới 15 phút thì không ai giành lại', async () => {
    hoSo(1);
    const t = tep(1, MIME_DOCX, word('đang có người làm'));
    ctl.db.prepare("INSERT INTO trich_chu_tep (tep_id, submission_id, trang_thai, cap_nhat_luc) VALUES (?, 1, 'dang_lam', ?)")
      .run(t, ctl.luc(5));
    await hang.chayHangDoi();
    assert.equal(dong(t).trang_thai, 'dang_lam');
  });

  test('tệp đã bị xoá khi tới lượt -> bỏ việc, không lỗi', async () => {
    hoSo(1);
    const t = tep(1, MIME_DOCX, word('x'));
    /* Xếp việc thẳng vào bảng (POST thì hàng đợi chạy ngay, xong trước khi kịp xoá).
       MySQL thật xoá luôn dòng việc theo khoá ngoại; SQLite thử không có khoá ngoại
       nên đây kiểm đúng nhánh mã tự dọn. */
    ctl.db.prepare("INSERT INTO trich_chu_tep (tep_id, submission_id, trang_thai) VALUES (?, 1, 'cho')").run(t);
    ctl.db.prepare('DELETE FROM submission_images WHERE id = ?').run(t);
    await hang.chayHangDoi();
    assert.equal(dong(t), undefined);
  });
});

describe('Tìm trong tệp đính kèm ở danh sách hồ sơ', { skip: BO_QUA, timeout: 120_000 }, () => {
  beforeEach(() => {
    ctl = dungCsdl(pool, { themCau: [BANG] });
  });
  after(() => dungTienTrinhCon());

  test('gõ không dấu ra hồ sơ có chữ trong tệp; đánh dấu "khớp trong tệp"; không lộ hồ sơ ngoài phạm vi', async () => {
    hoSo(1, { noiDung: 'Phản ánh trộm cắp, chi tiết trong tệp' });
    hoSo(2, { noiDung: 'Việc khác hoàn toàn' });
    hoSo(9, { coMat: 1, noiDung: 'Tố giác mật' });
    tep(1, MIME_DOCX, word('Đối tượng đi xe biển số 61-B1 234.56, đường Huỳnh Văn Lũy'));
    tep(9, MIME_DOCX, word('Cũng đường Huỳnh Văn Lũy'));
    await API(TRUONG, 'POST', '/submissions/1/trich-chu', {});
    await API(TRUONG, 'POST', '/submissions/9/trich-chu', {});
    await hang.chayHangDoi();

    const cb = await API(CAN_BO, 'GET', `/submissions?status=all&q=${encodeURIComponent('huynh van luy')}`);
    assert.equal(cb.status, 200, cb.text);
    assert.deepEqual(cb.body.data.map((d) => d.id), [1], 'cán bộ không thấy hồ sơ tố giác mật dù tệp khớp');
    assert.equal(cb.body.total, 1);
    assert.equal(cb.body.data[0].khop_tep, true);

    const ld = await API(TRUONG, 'GET', `/submissions?status=all&q=${encodeURIComponent('Huỳnh Văn Lũy')}`);
    assert.deepEqual(ld.body.data.map((d) => d.id).sort(), [1, 9]);

    const noiDung = await API(CAN_BO, 'GET', `/submissions?status=all&q=${encodeURIComponent('trộm cắp')}`);
    assert.deepEqual(noiDung.body.data.map((d) => d.id), [1]);
    assert.equal(noiDung.body.data[0].khop_tep, false, 'khớp ở nội dung, không phải ở tệp');
  });

  test('hồ sơ đã XOÁ DANH TÍNH không tìm ra được qua chữ trong tệp (đơn trong tệp thường có tên, chữ ký)', async () => {
    hoSo(1, { noiDung: 'Phản ánh tiếng ồn' });
    ctl.db.prepare('UPDATE submissions SET identity_erased = 1 WHERE id = 1').run();
    hoSo(2, { noiDung: 'Phản ánh khác' });
    tep(1, MIME_DOCX, word('Người viết đơn: Lê Thị Hoa, số nhà 18'));
    tep(2, MIME_DOCX, word('Người làm chứng: Lê Thị Hoa'));
    await API(TRUONG, 'POST', '/submissions/1/trich-chu', {});
    await API(TRUONG, 'POST', '/submissions/2/trich-chu', {});
    await hang.chayHangDoi();
    const r = await API(TRUONG, 'GET', `/submissions?status=all&q=${encodeURIComponent('le thi hoa')}`);
    assert.deepEqual(r.body.data.map((d) => d.id), [2]);
    /* Hồ sơ vẫn tìm được theo nội dung như cũ, nhưng không bị gắn "khớp trong tệp" */
    const nd = await API(TRUONG, 'GET', `/submissions?status=all&q=${encodeURIComponent('tiếng ồn')}`);
    assert.deepEqual(nd.body.data.map((d) => [d.id, d.khop_tep]), [[1, false]]);
  });

  test('chưa có bảng trích chữ: tìm kiếm vẫn chạy như cũ', async () => {
    ctl = dungCsdl(pool);
    hang.quenBangTrichChu();
    hoSo(1, { noiDung: 'trộm cắp xe máy' });
    const r = await API(CAN_BO, 'GET', `/submissions?status=all&q=${encodeURIComponent('trộm')}`);
    assert.equal(r.status, 200, r.text);
    assert.deepEqual(r.body.data.map((d) => d.id), [1]);
  });
});

describe('Tệp nâng cấp CSDL v33', () => {
  test('tạo bảng an toàn, chạy lại được, xoá tệp / hồ sơ là xoá luôn chữ đã trích', async () => {
    const sql = await readFile(new URL('../../database/nang_cap_v33.sql', import.meta.url), 'utf8');
    assert.match(sql, /^SET NAMES utf8mb4;/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS trich_chu_tep/);
    assert.doesNotMatch(sql, /^\s*(USE|DROP)\b/im, 'không tự chọn database, không xoá gì');
    assert.match(sql, /FOREIGN KEY \(tep_id\) REFERENCES submission_images\(id\) ON DELETE CASCADE/);
    assert.match(sql, /FOREIGN KEY \(submission_id\) REFERENCES submissions\(id\) ON DELETE CASCADE/);
    assert.match(sql, /UNIQUE KEY \w+ \(tep_id\)/);
  });
});

describe('Ba biến thể máy chủ', () => {
  test('route trích chữ chỉ có ở nơi gắn router cán bộ', async () => {
    const doc = (p) => readFile(new URL(`../src/${p}`, import.meta.url), 'utf8');
    assert.match(await doc('routes/admin/index.js'), /trichChuRouter/);
    assert.match(await doc('index.js'), /adminRouter/);
    assert.match(await doc('may-chu-can-bo.js'), /adminRouter/);
    const congKhai = await doc('may-chu-cong-khai.js');
    assert.doesNotMatch(congKhai, /import\s+\w+\s+from\s+'\.\/routes\/admin|app\.use\('\/api\/admin'|trich-chu/);
  });
});

describe('Lấy ảnh từ kho Cloudinary để OCR — chỉ kho CỦA ĐƠN VỊ', () => {
  const datKho = (v) => { if (v === undefined) delete process.env.CLOUDINARY_CLOUD_NAME; else process.env.CLOUDINARY_CLOUD_NAME = v; };
  const cu = process.env.CLOUDINARY_CLOUD_NAME;
  after(() => datKho(cu));

  test('chưa khai kho -> không lấy (không biết kho nào là của mình)', () => {
    datKho(undefined);
    assert.throws(() => hang.urlKhoAnh('https://res.cloudinary.com/donvi/image/upload/a.jpg'), /CLOUDINARY_CLOUD_NAME/);
  });
  test('kho khác, máy khác, http, đuôi lạ -> không lấy', () => {
    datKho('donvi');
    for (const u of [
      'https://res.cloudinary.com/keXau/image/upload/a.jpg',
      'https://evil.example/donvi/image/upload/a.jpg',
      'http://res.cloudinary.com/donvi/image/upload/a.jpg',
      'https://res.cloudinary.com/donvi/image/upload/a.svg',
      'https://res.cloudinary.com@169.254.169.254/donvi/a.jpg',
    ]) assert.throws(() => hang.urlKhoAnh(u), /Không lấy ảnh|CLOUDINARY/, u);
  });
  test('ảnh đúng kho -> lấy', () => {
    datKho('donvi');
    assert.equal(hang.urlKhoAnh('https://res.cloudinary.com/donvi/image/upload/v1/a.jpg'), 'https://res.cloudinary.com/donvi/image/upload/v1/a.jpg');
  });
});
