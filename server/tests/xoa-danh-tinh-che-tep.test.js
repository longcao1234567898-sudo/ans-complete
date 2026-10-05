/**
 * BUG-029 — XOÁ DANH TÍNH THÌ TỆP ĐÍNH KÈM CŨNG PHẢI ĐƯỢC CHE
 * ============================================================================
 *
 * Người dân xin xoá danh tính, nhưng đơn Word/PDF/ảnh CCCD họ gửi kèm thường có
 * chính họ tên, chữ ký, ảnh mặt. Người vận hành chọn (P55): CHE chứ không xoá
 * sạch (tệp có thể là chứng cứ):
 *   · hồ sơ đã xoá danh tính -> tệp (gửi đầu, bổ sung) và chữ trích từ tệp không
 *     còn hiện ở trang chi tiết cho BẤT KỲ AI — che sẵn, như danh tính;
 *   · chỉ lãnh đạo mở được, phải bấm riêng, ghi nhật ký TRƯỚC (ghi không được
 *     thì không trả);
 *   · lãnh đạo xoá hẳn được từng tệp chỉ chứa danh tính (kèm lý do, ghi nhật ký
 *     trước), xoá cả bản trên kho ảnh Cloudinary — chưa xoá được bản trên kho
 *     thì KHÔNG báo đã xoá (luật 1);
 *   · người dân được nói thật: tệp gửi kèm được giữ, chỉ lãnh đạo xem.
 *
 * Bốn biến thể của Bug Log: (a) tệp lúc gửi đầu · (b) tệp bổ sung · (c) ảnh trên
 * Cloudinary · (d) chữ đã trích trong trich_chu_tep. Route thật qua HTTP thật
 * trên SQLite trong bộ nhớ (khung-sqlite.js). Dữ liệu GIẢ.
 */
import { describe, test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { datBienMoiTruongHopLe } from './helpers-test.js';
import { BO_QUA, dungCsdl, goi, TRUONG, PHO, CAN_BO } from './khung-sqlite.js';

datBienMoiTruongHopLe();
const { pool } = await import('../src/db.js');
const { default: adminRouter } = await import('../src/routes/admin/index.js');
const { default: trackingRouter } = await import('../src/routes/tracking.js');
const { signAccessToken } = await import('../src/lib/token.js');
const { quenBangTrichChu } = await import('../src/lib/hang-doi-trich-chu.js');

const BANG_TIN = `CREATE TABLE news (id INTEGER PRIMARY KEY, title TEXT, image_url TEXT)`;
const BANG_TRICH = `CREATE TABLE trich_chu_tep (
  id INTEGER PRIMARY KEY AUTOINCREMENT, tep_id INT NOT NULL UNIQUE, submission_id INT NOT NULL,
  trang_thai TEXT NOT NULL DEFAULT 'cho', ngon_ngu TEXT, ngon_ngu_dung TEXT, phuong_phap TEXT,
  noi_dung TEXT, noi_dung_tim TEXT, do_tin_cay INT, so_trang INT, da_chuyen_tcvn3 INT NOT NULL DEFAULT 0,
  ghi_chu TEXT, yeu_cau_boi INT, tao_luc TEXT DEFAULT (NOW()), cap_nhat_luc TEXT DEFAULT (NOW()))`;

const TEN = 'Nguyễn Văn Thử';
const TEN_B64 = Buffer.from(`Đơn trình báo. Tôi tên là ${TEN}, CCCD 079000000001`).toString('base64');
const DOC_URL = `data:application/pdf;base64,${TEN_B64}`;
const ANH_BO_SUNG = `data:image/jpeg;base64,${Buffer.from(`anh-bo-sung-${TEN}`).toString('base64')}`;
const KHO = 'kho-don-vi';
const ANH_KHO = `https://res.cloudinary.com/${KHO}/image/upload/v1/hop-thu/cccd-gia.jpg`;

let ctl;
const API = (staff, method, duong, body) => goi({ duongGoc: '/api/admin', router: adminRouter, staff, signAccessToken, method, duong, body });
const nhatKy = (hanhDong) => ctl.db.prepare('SELECT * FROM staff_activity_logs WHERE action = ? ORDER BY id').all(hanhDong);
const soTep = (id) => ctl.db.prepare('SELECT COUNT(*) AS n FROM submission_images WHERE submission_id = ?').get(id).n;

/** Hồ sơ 1: đã xoá danh tính, có tệp gửi đầu (PDF), ảnh trên kho, một lần bổ sung kèm ảnh, chữ đã trích.
    Hồ sơ 2: chưa xoá danh tính, cùng kiểu tệp — đối chứng. */
function dungHoSo() {
  const them = ctl.db.prepare(`INSERT INTO submissions (id, tracking_code, original_content, status, is_anonymous,
      category_id, identity_erased, identity_erased_at) VALUES (?,?,?,?,0,3,?,?)`);
  them.run(1, 'XOA001', 'Phản ánh tụ tập gây rối', 'resolved', 1, ctl.luc(5));
  them.run(2, 'GIU002', 'Phản ánh lấn chiếm vỉa hè', 'processing', 0, null);
  const tep = ctl.db.prepare(`INSERT INTO submission_images (id, submission_id, image_url, cloudinary_id, storage, mime_type,
      is_verified, moderation_status, bo_sung_id) VALUES (?,?,?,?,?,?,1,'safe',?)`);
  ctl.db.prepare('INSERT INTO bo_sung_thong_tin (id, submission_id, thu_tu, noi_dung) VALUES (7, 1, 1, ?)').run('Bổ sung thêm ảnh');
  tep.run(11, 1, DOC_URL, null, 'base64', 'application/pdf', null);
  tep.run(12, 1, ANH_KHO, 'hop-thu/cccd-gia', 'cloudinary', 'image/jpeg', null);
  tep.run(13, 1, ANH_BO_SUNG, null, 'base64', 'image/jpeg', 7);
  tep.run(21, 2, DOC_URL, null, 'base64', 'application/pdf', null);
  const trich = ctl.db.prepare(`INSERT INTO trich_chu_tep (tep_id, submission_id, trang_thai, phuong_phap, noi_dung, noi_dung_tim)
      VALUES (?,?, 'xong', 'pdf_chu', ?, ?)`);
  trich.run(11, 1, `Tôi tên là ${TEN}`, 'toi ten la nguyen van thu');
  trich.run(21, 2, `Tôi tên là ${TEN}`, 'toi ten la nguyen van thu');
}

/* Kho ảnh giả: thay fetch cho đúng địa chỉ api.cloudinary.com, còn lại đi thật */
const fetchThat = globalThis.fetch;
let goiKho;
let traLoiKho;
function giaKhoAnh() {
  goiKho = [];
  traLoiKho = () => new Response(JSON.stringify({ result: 'ok' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  globalThis.fetch = async (url, opt) => {
    const u = String(url);
    if (u.startsWith('https://api.cloudinary.com/')) {
      goiKho.push({ url: u, opt, than: Object.fromEntries(new URLSearchParams(String(opt?.body ?? ''))) });
      return traLoiKho();
    }
    return fetchThat(url, opt);
  };
}

const BIEN_KHO = ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'];
let bienCu;

describe('BUG-029 — hồ sơ đã xoá danh tính che tệp đính kèm', { skip: BO_QUA }, () => {
  beforeEach(() => {
    quenBangTrichChu();
    ctl = dungCsdl(pool, { themCau: [BANG_TRICH, BANG_TIN] });
    dungHoSo();
    giaKhoAnh();
    bienCu = Object.fromEntries(BIEN_KHO.map((k) => [k, process.env[k]]));
    process.env.CLOUDINARY_CLOUD_NAME = KHO;
    process.env.CLOUDINARY_API_KEY = '123456789012345';
    process.env.CLOUDINARY_API_SECRET = 'bi-mat-gia-cua-kho';
  });
  afterEach(() => {
    globalThis.fetch = fetchThat;
    for (const k of BIEN_KHO) { if (bienCu[k] === undefined) delete process.env[k]; else process.env[k] = bienCu[k]; }
  });

  /* ---------- (a) (b) (c): trang chi tiết ---------- */
  for (const [ai, staff] of [['cán bộ', CAN_BO], ['lãnh đạo', TRUONG]]) {
    test(`(a)(b)(c) ${ai} mở chi tiết hồ sơ đã xoá danh tính: không thấy tệp nào, chỉ thấy số tệp bị che`, async () => {
      const r = await API(staff, 'GET', '/submissions/1');
      assert.equal(r.status, 200, r.text);
      assert.deepEqual(r.body.images, [], 'tệp gửi đầu còn hiện');
      assert.ok(r.body.bo_sung.every((b) => b.anh.length === 0), 'ảnh bổ sung còn hiện');
      assert.equal(r.body.tep_an_sau_xoa_danh_tinh, 3);
      for (const manh of [TEN_B64, ANH_KHO, 'cccd-gia', ANH_BO_SUNG.slice(30, 60)]) {
        assert.ok(!r.text.includes(manh), `chi tiết còn lộ ${manh.slice(0, 30)}…`);
      }
    });
  }

  test('đối chứng: hồ sơ CHƯA xoá danh tính vẫn hiện tệp như cũ', async () => {
    const r = await API(CAN_BO, 'GET', '/submissions/2');
    assert.equal(r.status, 200, r.text);
    assert.equal(r.body.images.length, 1);
    assert.equal(r.body.tep_an_sau_xoa_danh_tinh ?? 0, 0);
  });

  /* ---------- (d): chữ đã trích ---------- */
  test('(d) cán bộ không đọc được chữ trích từ tệp của hồ sơ đã xoá danh tính', async () => {
    const r = await API(CAN_BO, 'GET', '/submissions/1/trich-chu');
    assert.equal(r.status, 403, r.text);
    assert.ok(!r.text.includes(TEN), 'chữ trích còn lộ tên');
    assert.equal(r.body.daXoaDanhTinh, true);
    const y = await API(CAN_BO, 'POST', '/submissions/1/trich-chu', { tepId: 11, lai: true });
    assert.equal(y.status, 403, 'cán bộ vẫn yêu cầu trích lại được');
  });

  test('(d) lãnh đạo đọc được chữ trích — nhật ký ghi TRƯỚC', async () => {
    const r = await API(PHO, 'GET', '/submissions/1/trich-chu');
    assert.equal(r.status, 200, r.text);
    assert.ok(r.text.includes(TEN));
    const nk = nhatKy('view_erased_attachments');
    assert.equal(nk.length, 1);
    assert.equal(nk[0].staff_id, PHO.id);
  });

  test('(d) ghi nhật ký không được thì lãnh đạo cũng không đọc được chữ trích', async () => {
    ctl.db.exec('DROP TABLE staff_activity_logs');
    const r = await API(TRUONG, 'GET', '/submissions/1/trich-chu');
    assert.notEqual(r.status, 200);
    assert.ok(!r.text.includes(TEN));
  });

  test('đối chứng (d): hồ sơ chưa xoá danh tính, cán bộ vẫn đọc chữ trích như cũ', async () => {
    const r = await API(CAN_BO, 'GET', '/submissions/2/trich-chu');
    assert.equal(r.status, 200, r.text);
    assert.ok(r.text.includes(TEN));
  });

  /* ---------- Lãnh đạo bấm riêng để xem tệp ---------- */
  test('cán bộ không mở được tệp bị che', async () => {
    const r = await API(CAN_BO, 'POST', '/submissions/1/tep-sau-xoa-danh-tinh', {});
    assert.equal(r.status, 403, r.text);
    assert.ok(!r.text.includes(TEN_B64));
  });

  test('lãnh đạo mở tệp bị che: đủ tệp gửi đầu + bổ sung + kho, nhật ký ghi trước', async () => {
    const r = await API(TRUONG, 'POST', '/submissions/1/tep-sau-xoa-danh-tinh', {});
    assert.equal(r.status, 200, r.text);
    assert.deepEqual(r.body.tep.map((t) => t.tepId).sort(), [11, 12, 13]);
    assert.equal(r.body.tep.find((t) => t.tepId === 13).boSungId, 7);
    const nk = nhatKy('view_erased_attachments');
    assert.equal(nk.length, 1);
    assert.equal(Number(nk[0].target_id), 1);
  });

  test('ghi nhật ký không được thì không trả tệp', async () => {
    ctl.db.exec('DROP TABLE staff_activity_logs');
    const r = await API(TRUONG, 'POST', '/submissions/1/tep-sau-xoa-danh-tinh', {});
    assert.notEqual(r.status, 200);
    assert.ok(!r.text.includes(TEN_B64));
  });

  test('hồ sơ chưa xoá danh tính: đường này không dùng (409), không phải lối tắt mới', async () => {
    const r = await API(TRUONG, 'POST', '/submissions/2/tep-sau-xoa-danh-tinh', {});
    assert.equal(r.status, 409, r.text);
  });

  test('hồ sơ không tồn tại / ngoài phạm vi: 404', async () => {
    assert.equal((await API(TRUONG, 'POST', '/submissions/99/tep-sau-xoa-danh-tinh', {})).status, 404);
  });

  /* ---------- Xoá hẳn từng tệp ---------- */
  test('cán bộ không xoá được tệp', async () => {
    const r = await API(CAN_BO, 'DELETE', '/submissions/1/tep/11', { lyDo: 'Ảnh CCCD, chỉ có danh tính' });
    assert.equal(r.status, 403, r.text);
    assert.equal(soTep(1), 3);
  });

  test('xoá phải có lý do', async () => {
    for (const body of [{}, { lyDo: '' }, { lyDo: '   ' }, { lyDo: 'x' }, { lyDo: 123 }, { lyDo: 'a'.repeat(501) }]) {
      const r = await API(TRUONG, 'DELETE', '/submissions/1/tep/11', body);
      assert.equal(r.status, 400, JSON.stringify(body));
    }
    assert.equal(soTep(1), 3);
  });

  test('lãnh đạo xoá hẳn tệp lưu trong CSDL: mất tệp, mất chữ trích, nhật ký có lý do', async () => {
    const r = await API(PHO, 'DELETE', '/submissions/1/tep/11', { lyDo: 'Đơn chỉ có họ tên, CCCD người gửi' });
    assert.equal(r.status, 200, r.text);
    assert.equal(ctl.db.prepare('SELECT COUNT(*) AS n FROM submission_images WHERE id = 11').get().n, 0);
    assert.equal(ctl.db.prepare('SELECT COUNT(*) AS n FROM trich_chu_tep WHERE tep_id = 11').get().n, 0);
    assert.equal(goiKho.length, 0, 'tệp trong CSDL thì không gọi kho ảnh');
    const nk = nhatKy('delete_erased_attachment');
    assert.equal(nk.length, 1);
    assert.match(nk[0].details, /CCCD người gửi/);
  });

  test('(c) xoá ảnh trên Cloudinary: gọi lệnh xoá có chữ ký tới đúng kho, rồi mới xoá ở CSDL', async () => {
    const r = await API(TRUONG, 'DELETE', '/submissions/1/tep/12', { lyDo: 'Ảnh CCCD của người gửi' });
    assert.equal(r.status, 200, r.text);
    assert.equal(goiKho.length, 1);
    const { url, opt, than } = goiKho[0];
    assert.equal(url, `https://api.cloudinary.com/v1_1/${KHO}/image/destroy`);
    assert.equal(opt.method, 'POST');
    assert.equal(opt.redirect, 'error');
    assert.equal(than.public_id, 'hop-thu/cccd-gia');
    assert.equal(than.api_key, '123456789012345');
    /* invalidate=true: xoá cả bản đang nằm trong bộ nhớ đệm CDN, không thì link cũ còn mở được một thời gian */
    assert.equal(than.invalidate, 'true');
    const ky = createHash('sha1')
      .update(`invalidate=true&public_id=${than.public_id}&timestamp=${than.timestamp}bi-mat-gia-cua-kho`).digest('hex');
    assert.equal(than.signature, ky, 'chữ ký sai — Cloudinary sẽ từ chối');
    assert.ok(!JSON.stringify(than).includes('bi-mat-gia-cua-kho'), 'gửi lộ khoá bí mật');
    assert.equal(ctl.db.prepare('SELECT COUNT(*) AS n FROM submission_images WHERE id = 12').get().n, 0);
  });

  test('(c) kho ảnh báo "not found" (đã xoá trước đó) vẫn coi là xong', async () => {
    traLoiKho = () => new Response(JSON.stringify({ result: 'not found' }), { status: 200 });
    const r = await API(TRUONG, 'DELETE', '/submissions/1/tep/12', { lyDo: 'Ảnh CCCD của người gửi' });
    assert.equal(r.status, 200, r.text);
    assert.equal(soTep(1), 2);
  });

  for (const [ten, chuanBi] of [
    ['thiếu khoá API kho ảnh', () => { delete process.env.CLOUDINARY_API_SECRET; }],
    ['kho ảnh trả lỗi', () => { traLoiKho = () => new Response('{"error":{"message":"x"}}', { status: 500 }); }],
    ['kho ảnh trả kết quả lạ', () => { traLoiKho = () => new Response('{"result":"error"}', { status: 200 }); }],
    ['ảnh không thuộc kho của đơn vị', () => { process.env.CLOUDINARY_CLOUD_NAME = 'kho-khac'; }],
  ]) {
    test(`(c) ${ten}: KHÔNG xoá ở CSDL, KHÔNG báo đã xoá (luật 1)`, async () => {
      chuanBi();
      const r = await API(TRUONG, 'DELETE', '/submissions/1/tep/12', { lyDo: 'Ảnh CCCD của người gửi' });
      assert.notEqual(r.status, 200, r.text);
      assert.equal(ctl.db.prepare('SELECT COUNT(*) AS n FROM submission_images WHERE id = 12').get().n, 1);
      assert.ok(!r.text.includes('bi-mat-gia-cua-kho'));
    });
  }

  /* ---------- Lãnh đạo không thành tay sai xoá chứng cứ hồ sơ khác (trọng tài + /security-review, P55) ----------
     Mã ảnh trên kho (cloudinary_id) do trình duyệt người gửi tự khai: kẻ xấu gửi tin giả kèm ảnh
     của mình nhưng khai mã ảnh chứng cứ của hồ sơ khác, xin xoá danh tính, nhờ lãnh đạo "xoá ảnh
     CCCD". Mã ảnh phải lấy từ chính đường dẫn đã kiểm; ảnh còn hồ sơ / tin tức khác dùng thì không xoá. */
  const ANH_CHUNG_CU = `https://res.cloudinary.com/${KHO}/image/upload/v7/hop-thu/chung-cu-vu-x.jpg`;
  const themHoSoChungCu = (url = ANH_CHUNG_CU, maAnh = 'hop-thu/chung-cu-vu-x') => {
    ctl.db.prepare(`INSERT INTO submissions (id, tracking_code, original_content, status, is_anonymous, category_id)
                    VALUES (5, 'VUX005', 'Tố giác vụ X', 'processing', 0, 1)`).run();
    ctl.db.prepare(`INSERT INTO submission_images (id, submission_id, image_url, cloudinary_id, storage, mime_type, is_verified, moderation_status)
                    VALUES (51, 5, ?, ?, 'cloudinary', 'image/jpeg', 1, 'safe')`).run(url, maAnh);
  };
  const conTep = (id) => ctl.db.prepare('SELECT COUNT(*) AS n FROM submission_images WHERE id = ?').get(id).n;

  test('mã ảnh khai khác đường dẫn (trỏ sang chứng cứ hồ sơ khác): từ chối, không gọi kho', async () => {
    themHoSoChungCu();
    ctl.db.prepare("UPDATE submission_images SET cloudinary_id = 'hop-thu/chung-cu-vu-x' WHERE id = 12").run();
    const r = await API(TRUONG, 'DELETE', '/submissions/1/tep/12', { lyDo: 'Ảnh CCCD của người gửi' });
    assert.notEqual(r.status, 200, r.text);
    assert.equal(goiKho.length, 0, 'đã gọi lệnh xoá trên kho');
    assert.equal(conTep(12), 1);
    assert.equal(conTep(51), 1);
  });

  for (const [ten, urlKeXau] of [
    ['đường dẫn trùng hẳn ảnh chứng cứ', ANH_CHUNG_CU],
    ['cùng ảnh, khác số phiên bản', `https://res.cloudinary.com/${KHO}/image/upload/v99/hop-thu/chung-cu-vu-x.jpg`],
    ['cùng ảnh, khác đuôi tệp', `https://res.cloudinary.com/${KHO}/image/upload/v7/hop-thu/chung-cu-vu-x.png`],
  ]) {
    test(`ảnh còn hồ sơ khác dùng (${ten}): từ chối, không gọi kho`, async () => {
      themHoSoChungCu();
      ctl.db.prepare("UPDATE submission_images SET image_url = ?, cloudinary_id = 'hop-thu/chung-cu-vu-x' WHERE id = 12").run(urlKeXau);
      const r = await API(TRUONG, 'DELETE', '/submissions/1/tep/12', { lyDo: 'Ảnh CCCD của người gửi' });
      assert.equal(r.status, 409, r.text);
      assert.equal(goiKho.length, 0);
      assert.equal(conTep(12), 1);
      assert.equal(conTep(51), 1);
    });
  }

  test('ảnh còn tin tức đang dùng: từ chối, không gọi kho', async () => {
    ctl.db.prepare('INSERT INTO news (id, title, image_url) VALUES (1, ?, ?)').run('Tin', ANH_KHO.replace('/v1/', '/v3/'));
    const r = await API(TRUONG, 'DELETE', '/submissions/1/tep/12', { lyDo: 'Ảnh CCCD của người gửi' });
    assert.equal(r.status, 409, r.text);
    assert.equal(goiKho.length, 0);
  });

  test('đường dẫn kiểu giao không công khai / có biến đổi / lạ: không tự xoá (dễ báo nhầm "đã xoá")', async () => {
    for (const url of [
      `https://res.cloudinary.com/${KHO}/image/authenticated/v1/hop-thu/cccd-gia.jpg`,
      `https://res.cloudinary.com/${KHO}/image/private/v1/hop-thu/cccd-gia.jpg`,
      `https://res.cloudinary.com/${KHO}/image/upload/w_300,c_fill/v1/hop-thu/cccd-gia.jpg`,
      `https://res.cloudinary.com/${KHO}/raw/upload/v1/hop-thu/cccd-gia.pdf`,
      `https://res.cloudinary.com/${KHO}/image/upload/v1/hop-thu/cccd-gia.jpg?x=1`,
      `https://res.cloudinary.com/${KHO}/image/upload/v1/hop-thu/../cccd-gia.jpg`,
    ]) {
      ctl.db.prepare('UPDATE submission_images SET image_url = ? WHERE id = 12').run(url);
      const r = await API(TRUONG, 'DELETE', '/submissions/1/tep/12', { lyDo: 'Ảnh CCCD của người gửi' });
      assert.notEqual(r.status, 200, `${url} -> ${r.text}`);
    }
    assert.equal(goiKho.length, 0);
    assert.equal(conTep(12), 1);
  });

  test('thiếu mã ảnh trong CSDL: lấy từ đường dẫn; nhật ký xoá ghi mã ảnh và đường dẫn', async () => {
    ctl.db.prepare('UPDATE submission_images SET cloudinary_id = NULL WHERE id = 12').run();
    const r = await API(TRUONG, 'DELETE', '/submissions/1/tep/12', { lyDo: 'Ảnh CCCD của người gửi' });
    assert.equal(r.status, 200, r.text);
    assert.equal(goiKho[0].than.public_id, 'hop-thu/cccd-gia');
    const nk = nhatKy('delete_erased_attachment');
    assert.match(nk[0].details, /hop-thu\/cccd-gia/);
    assert.match(nk[0].details, /res\.cloudinary\.com/);
  });

  test('chỉ xoá được tệp của hồ sơ đã xoá danh tính (chứng cứ hồ sơ thường giữ nguyên)', async () => {
    const r = await API(TRUONG, 'DELETE', '/submissions/2/tep/21', { lyDo: 'Thử xoá chứng cứ' });
    assert.equal(r.status, 409, r.text);
    assert.equal(soTep(2), 1);
  });

  test('tệp không thuộc hồ sơ -> 404, không xoá nhầm', async () => {
    const r = await API(TRUONG, 'DELETE', '/submissions/1/tep/21', { lyDo: 'Ảnh CCCD của người gửi' });
    assert.equal(r.status, 404, r.text);
    assert.equal(soTep(2), 1);
  });

  test('ghi nhật ký không được thì không xoá', async () => {
    ctl.db.exec('DROP TABLE staff_activity_logs');
    const r = await API(TRUONG, 'DELETE', '/submissions/1/tep/11', { lyDo: 'Ảnh CCCD của người gửi' });
    assert.notEqual(r.status, 200);
    assert.equal(soTep(1), 3);
  });

  /* ---------- Người dân được nói thật ---------- */
  test('người dân tự xoá danh tính hồ sơ đã đóng: lời báo nói rõ tệp gửi kèm được giữ, chỉ lãnh đạo xem', async () => {
    ctl.db.prepare(`INSERT INTO submissions (id, tracking_code, original_content, status, is_anonymous, category_id, sender_name)
                    VALUES (3, 'DONG03', 'Đã xử lý xong', 'resolved', 0, 3, 'x')`).run();
    const r = await goi({ duongGoc: '/api/tracking', router: trackingRouter, staff: null, signAccessToken, method: 'POST', duong: '/DONG03/request-deletion' });
    assert.equal(r.status, 200, r.text);
    assert.equal(r.body.status, 'done');
    assert.match(r.body.message, /tệp/i);
    assert.match(r.body.message, /lãnh đạo/i);
    assert.doesNotMatch(r.body.message, /toàn bộ thông tin cá nhân/i, 'không được hứa đã xoá toàn bộ');
  });
});

test('nhãn nhật ký có đủ cho hai việc mới, trong nhóm nhạy cảm', async () => {
  const { NHOM_NHAT_KY } = await import('../src/lib/danh-muc-nhat-ky.js');
  const nhayCam = NHOM_NHAT_KY.find((n) => n.ma === 'nhay_cam').hanhDong;
  assert.ok(nhayCam.view_erased_attachments);
  assert.ok(nhayCam.delete_erased_attachment);
});

describe('BUG-029 — giao diện (quét mã nguồn; đã chạy trình duyệt thật khi làm)', () => {
  const docSrc = (p) => import('node:fs/promises').then((fs) => fs.readFile(new URL(`../../${p}`, import.meta.url), 'utf8'));

  test('trang chi tiết: hồ sơ đã xoá danh tính không tự tải chữ trong tệp, hiện khung tệp bị che', async () => {
    const ma = await docSrc('src/pages/admin/AdminSubmissionDetailPage.tsx');
    assert.match(ma, /\{id && !data\.identity_erased && <KhuChuTrongTep hoSoId=\{id\} \/>\}/);
    assert.match(ma, /<KhuTepSauXoaDanhTinh hoSoId=\{id\} soTep=\{data\.tep_an_sau_xoa_danh_tinh \?\? 0\} lanhDao=\{lanhDao\} \/>/);
  });

  test('khung tệp bị che: chỉ tải chữ trong tệp SAU khi lãnh đạo bấm mở; xoá hẳn phải có lý do', async () => {
    const ma = await docSrc('src/components/admin/KhuTepSauXoaDanhTinh.tsx');
    assert.match(ma, /\{tep !== null && \([\s\S]*<KhuChuTrongTep hoSoId=\{hoSoId\} \/>/);
    assert.match(ma, /lanhDao && tep === null/);
    assert.match(ma, /lyDo\.trim\(\)\.length < 5/);
  });

  test('trang tra cứu nói trước cho người dân: tệp gửi kèm được giữ, chỉ lãnh đạo mở', async () => {
    const ma = await docSrc('src/components/Tracking/DataRightsBox.tsx');
    assert.match(ma, /giữ làm chứng cứ/i);
    assert.match(ma, /lãnh đạo đơn vị/);
  });
});
