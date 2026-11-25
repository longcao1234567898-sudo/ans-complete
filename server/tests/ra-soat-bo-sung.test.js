/**
 * BÀI KIỂM THỬ BỔ SUNG — KHOÁ CÁC LỖ HỔNG & LỖI LOGIC SAU ĐỢT RÀ SOÁT TỔNG THỂ
 */
import { describe, test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import express from 'express';
import crypto from 'node:crypto';
import { datBienMoiTruongHopLe, resGia } from './helpers-test.js';
import { BO_QUA, dungCsdl, goi, donCoTen, TRUONG, PHO, CAN_BO, MAY_A } from './khung-sqlite.js';
import { taoZip, taoDocx, run } from './gia-lap/tao-docx.js';

datBienMoiTruongHopLe();
/* Ngăn dotenv đọc đè biến thật từ server/.env trong quá trình kiểm thử */
process.env.TURNSTILE_SECRET_KEY = ' ';
process.env.BAT_XAC_THUC_EMAIL = 'false';
process.env.ADMIN_ALLOWED_IPS = ' ';
process.env.CLOUDINARY_CLOUD_NAME = ' ';

const { pool } = await import('../src/db.js');
const { signAccessToken } = await import('../src/lib/token.js');
const { kiemTraLinkCloudinary } = await import('../src/lib/anh-an-toan.js');
const { kiemTaiLieu } = await import('../src/lib/tai-lieu-an-toan.js');
const { ghiNhatKyTruoc } = await import('../src/lib/helpers.js');
const { requireAuth, xoaDemTrangThai } = await import('../src/middleware/auth.js');
const { containsProfanity } = await import('../src/lib/security.js');
const { default: adminRouter } = await import('../src/routes/admin/index.js');
const { default: submissionsRouter } = await import('../src/routes/submissions.js');
const { default: trackingRouter } = await import('../src/routes/tracking.js');
const { default: khieuNaiRouter } = await import('../src/routes/khieu-nai.js');
const { default: chatRouter } = await import('../src/routes/chat.js');

const doc = (p) => readFile(new URL(`../../${p}`, import.meta.url), 'utf8');

describe('1. GET /api/health/schema trên index.js không mở công khai', () => {
  test('chưa đăng nhập -> 401, handler -> 403, admin -> 200 (không liệt kê SCHEMATA hay chi_tiet lỗi)', async () => {
    const { default: app } = await import('../src/index.js');
    const server = app.listen(0);
    const gocQuery = pool.query;
    xoaDemTrangThai();
    try {
      const { port } = server.address();
      const url = `http://127.0.0.1:${port}/api/health/schema`;

      const rAnon = await fetch(url);
      assert.equal(rAnon.status, 401);

      pool.query = async (sql) => {
        if (/SELECT (is_active|role) FROM staff/i.test(String(sql))) {
          return [[{ is_active: 1, role: CAN_BO.role }]];
        }
        return [[{ n: 1 }]];
      };
      const rHandler = await fetch(url, {
        headers: { Authorization: `Bearer ${signAccessToken(CAN_BO)}` },
      });
      assert.equal(rHandler.status, 403);

      xoaDemTrangThai();
      pool.query = async (sql) => {
        if (/SELECT (is_active|role) FROM staff/i.test(String(sql))) {
          return [[{ is_active: 1, role: TRUONG.role }]];
        }
        if (/SCHEMATA/i.test(String(sql))) {
          throw new Error('Không được phép truy vấn information_schema.SCHEMATA');
        }
        return [[{ n: 1 }]];
      };
      const rAdmin = await fetch(url, {
        headers: { Authorization: `Bearer ${signAccessToken(TRUONG)}` },
      });
      assert.equal(rAdmin.status, 200);
      const body = await rAdmin.json();
      assert.equal(body.cac_database_tren_may_chu, undefined);
      assert.equal(body.backend_dang_ket_noi_database, undefined);
      assert.equal(body.day_du, true);

      /* Lỗi DB -> không lộ err.message */
      pool.query = async (sql) => {
        if (/SELECT (is_active|role) FROM staff/i.test(String(sql))) {
          return [[{ is_active: 1, role: TRUONG.role }]];
        }
        throw new Error('Access denied for user secret_user@10.0.0.5');
      };
      const rErr = await fetch(url, {
        headers: { Authorization: `Bearer ${signAccessToken(TRUONG)}` },
      });
      assert.equal(rErr.status, 500);
      const errText = await rErr.text();
      assert.doesNotMatch(errText, /secret_user|10\.0\.0\.5|chi_tiet/);
    } finally {
      pool.query = gocQuery;
      xoaDemTrangThai();
      server.close();
    }
  });
});

describe('2. Cloudinary — fail-closed khi thiếu cloudName & khoá /image/upload/', () => {
  test('từ chối khi chưa cấu hình cloudName và chặn nhánh fetch/raw', () => {
    assert.equal(
      kiemTraLinkCloudinary({ url: 'https://res.cloudinary.com/demo/image/upload/a.jpg' }, '').trangThai,
      'blocked'
    );
    assert.equal(
      kiemTraLinkCloudinary({ url: 'https://res.cloudinary.com/demo/image/upload/a.jpg' }, undefined).trangThai,
      'blocked'
    );
    assert.equal(
      kiemTraLinkCloudinary({ url: 'https://res.cloudinary.com/donvi/image/fetch/https://evil.example/x.png' }, 'donvi').trangThai,
      'blocked'
    );
    assert.equal(
      kiemTraLinkCloudinary({ url: 'https://res.cloudinary.com/donvi/raw/upload/a.txt' }, 'donvi').trangThai,
      'blocked'
    );
    assert.equal(
      kiemTraLinkCloudinary({ url: 'https://res.cloudinary.com/donvi/image/upload/../fetch/a.jpg' }, 'donvi').trangThai,
      'blocked'
    );
    assert.equal(
      kiemTraLinkCloudinary({ url: 'https://user:pass@res.cloudinary.com/donvi/image/upload/a.jpg' }, 'donvi').trangThai,
      'blocked'
    );
    assert.equal(
      kiemTraLinkCloudinary({ url: 'https://res.cloudinary.com/donvi/image/upload/v123/a.jpg' }, 'donvi').trangThai,
      'safe'
    );
  });
});

describe('3. Tệp .docx — mục lục ZIP & macro không phân biệt hoa thường', () => {
  const MIME_DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  const toDataUrl = (buf) => `data:${MIME_DOCX};base64,${buf.toString('base64')}`;

  test('chặn VBAProject.bin viết hoa và tệp nén đổi tên chỉ chèn chuỗi word/document.xml', () => {
    const docxMacroHoa = taoZip({
      '[Content_Types].xml': '<Types/>',
      'word/document.xml': '<w:document/>',
      'word/VBAProject.bin': 'macro-binary-data',
    });
    assert.equal(kiemTaiLieu(toDataUrl(docxMacroHoa), 'don.docx').hopLe, false);

    const giaZip = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from('rac word/document.xml rac')]);
    assert.equal(kiemTaiLieu(toDataUrl(giaZip), 'don.docx').hopLe, false);

    const docxHopLe = taoDocx(`<w:p>${run('Đơn trình báo hợp lệ')}</w:p>`);
    assert.equal(kiemTaiLieu(toDataUrl(docxHopLe), 'don.docx').hopLe, true);
  });
});

describe('4. Luồng gửi ý kiến, khôi phục thùng rác, tra cứu, sàng lọc, báo cáo & nhật ký', () => {
  let ctl;
  const gocQuery = pool.query;

  beforeEach(() => {
    if (BO_QUA) return;
    xoaDemTrangThai();
    ctl = dungCsdl(pool, {
      themCau: [
        'ALTER TABLE wards ADD COLUMN lat REAL DEFAULT 10.7',
        'ALTER TABLE wards ADD COLUMN lng REAL DEFAULT 106.6',
        'ALTER TABLE staff ADD COLUMN assigned_category_id INT',
        `CREATE TABLE unlock_appeals (
           id INTEGER PRIMARY KEY AUTOINCREMENT, identifier TEXT, kind TEXT, content TEXT,
           status TEXT DEFAULT 'cho_xu_ly', created_at TEXT DEFAULT (NOW()), handled_at TEXT,
           handled_by INT, handler_note TEXT, device_id TEXT, ip_address TEXT
         )`,
      ],
    });
  });

  afterEach(() => {
    pool.query = gocQuery;
    xoaDemTrangThai();
  });

  const guiDan = (body) => goi({ duongGoc: '/api/submissions', router: submissionsRouter, method: 'POST', duong: '/', body });
  const goiAd = (staff, method, duong, body) => goi({
    duongGoc: '/api/admin', router: adminRouter, staff, signAccessToken, method, duong, body,
  });
  const goiTraCuu = (code) => goi({ duongGoc: '/api/tracking', router: trackingRouter, method: 'GET', duong: `/${code}` });

  test('normalizedContent bị quét từ cấm/mã độc; content_hash tính theo content; anhNghiNgo không lật được chặn ngầm', { skip: BO_QUA }, async () => {
    const rXss = await guiDan(donCoTen(0, { normalizedContent: '<script>alert(1)</script> nội dung đủ dài để gửi' }));
    assert.equal(rXss.status, 400);

    const rTục = await guiDan(donCoTen(0, { normalizedContent: 'Bản tóm tắt có chứa chữ địt không phù hợp' }));
    assert.equal(rTục.status, 400);

    /* Gửi đơn 1 -> gửi lại y hệt content nhưng sửa normalizedContent từ SĐT khác vẫn bị chặn trùng */
    const r1 = await guiDan(donCoTen(1, { normalizedContent: 'Tóm tắt lần một về đèn đường hỏng' }));
    assert.equal(r1.status, 201, r1.text);
    const r2 = await guiDan({
      ...donCoTen(1),
      phone: '0916284799',
      normalizedContent: 'Tóm tắt đã sửa khác hẳn để né trùng',
    });
    assert.equal(r2.status, 429);

    /* Khoá máy MAY_A rồi gửi kèm ảnh nghi ngờ -> vẫn là 'spam' (chặn ngầm), không lật thành 'pending_review' */
    ctl.db.prepare(`INSERT INTO blacklists (identifier, kind, loai_don, reason, expires_at)
                    VALUES (?, 'device', 'co_ten', 'spam', datetime('now', '+1 day'))`).run(MAY_A);
    const JPEG = `data:image/jpeg;base64,${Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 1), Buffer.from([0xff, 0xd9])]).toString('base64')}`;
    const rChan = await guiDan(donCoTen(2, { images: [JPEG], anhNghiNgo: true }));
    assert.equal(rChan.status, 201, rChan.text);
    const saved = ctl.db.prepare('SELECT status, is_spam FROM submissions WHERE tracking_code = ?').get(rChan.body.trackingCode);
    assert.equal(saved.status, 'spam');
    assert.equal(saved.is_spam, 1);

    /* Tra cứu đơn chặn ngầm không lộ status='spam' */
    const tc = await goiTraCuu(rChan.body.trackingCode);
    assert.equal(tc.status, 200);
    assert.equal(tc.body.status, 'received');
    assert.doesNotMatch(tc.text, /"spam"/);
  });

  test('khôi phục từ Thùng rác đặt is_spam=0 để hiện lại trong danh sách, không gia hạn khoá; thùng rác ẩn trong tra cứu', { skip: BO_QUA }, async () => {
    const r = await guiDan(donCoTen(3));
    assert.equal(r.status, 201, r.text);
    const sub = ctl.db.prepare('SELECT id FROM submissions WHERE tracking_code = ?').get(r.body.trackingCode);

    assert.equal((await goiAd(CAN_BO, 'POST', `/submissions/${sub.id}/mark-spam`, { reason: 'nhầm' })).status, 200);
    /* Đơn rác đang nằm thùng rác không tra cứu được công khai */
    assert.equal((await goiTraCuu(r.body.trackingCode)).status, 404);

    /* Khôi phục -> hiện lại ngay trong GET /submissions */
    assert.equal((await goiAd(CAN_BO, 'POST', `/trash/${sub.id}/restore`)).status, 200);
    const row = ctl.db.prepare('SELECT is_spam, deleted_at, status FROM submissions WHERE id = ?').get(sub.id);
    assert.equal(row.is_spam, 0);
    assert.equal(row.deleted_at, null);
    assert.equal(row.status, 'received');

    const ds = await goiAd(CAN_BO, 'GET', '/submissions?sort=moi_nhat');
    assert.equal(ds.status, 200);
    assert.ok(ds.body.data.some((d) => d.id === sub.id), 'hồ sơ khôi phục phải hiện lại trong danh sách làm việc');

    /* Rút ngắn hạn khoá còn 10 phút rồi mark-spam lại chính đơn đó -> không làm mới 24h */
    ctl.db.exec(`UPDATE blacklists SET expires_at = datetime('now', '+10 minutes')`);
    assert.equal((await goiAd(CAN_BO, 'POST', `/submissions/${sub.id}/mark-spam`, { reason: 'lần 2' })).status, 200);
    const conLai = ctl.db.prepare(`SELECT (julianday(expires_at) - julianday('now')) * 24 AS gio FROM blacklists`).get().gio;
    assert.ok(conLai < 1, `khoá không được gia hạn thành ${conLai.toFixed(1)}h`);
  });

  test('đóng hồ sơ qua sàng lọc (tin_gia / ngoài thẩm quyền da_chuyen) tự xoá danh tính đang chờ', { skip: BO_QUA }, async () => {
    const r1 = await guiDan(donCoTen(4));
    const r2 = await guiDan({ ...donCoTen(5), phone: '0916284788' });
    const s1 = ctl.db.prepare('SELECT id FROM submissions WHERE tracking_code = ?').get(r1.body.trackingCode);
    const s2 = ctl.db.prepare('SELECT id FROM submissions WHERE tracking_code = ?').get(r2.body.trackingCode);

    ctl.db.prepare(`INSERT INTO data_deletion_requests (submission_id, tracking_code, status) VALUES (?, ?, 'pending')`)
      .run(s1.id, r1.body.trackingCode);
    ctl.db.prepare(`INSERT INTO data_deletion_requests (submission_id, tracking_code, status) VALUES (?, ?, 'pending')`)
      .run(s2.id, r2.body.trackingCode);

    /* tin_gia -> tự xoá danh tính */
    const kq1 = await goiAd(CAN_BO, 'POST', `/submissions/${s1.id}/sang-loc`, {
      hanhDong: 'tin_gia',
      ghiChu: 'Đã xác minh thực tế không có sự việc',
    });
    assert.equal(kq1.status, 200, kq1.text);
    const sau1 = ctl.db.prepare('SELECT sender_name, sender_phone, identity_erased FROM submissions WHERE id = ?').get(s1.id);
    assert.equal(sau1.sender_name, null);
    assert.equal(sau1.sender_phone, null);
    assert.equal(sau1.identity_erased, 1);
    assert.equal(ctl.db.prepare('SELECT status FROM data_deletion_requests WHERE submission_id = ?').get(s1.id).status, 'done');
    /* tin_gia bị từ chối ở sàng lọc vẫn tra cứu thấy lời từ chối chung */
    assert.equal((await goiTraCuu(r1.body.trackingCode)).body.status, 'rejected');

    /* ngoài thẩm quyền -> da_chuyen -> tự xoá danh tính */
    assert.equal((await goiAd(CAN_BO, 'POST', `/submissions/${s2.id}/sang-loc`, {
      hanhDong: 'ngoai_tham_quyen', ghiChu: 'Thuộc đơn vị khác',
    })).status, 200);
    const kq2 = await goiAd(PHO, 'POST', `/submissions/${s2.id}/ngoai-tham-quyen`, {
      hanhDong: 'da_chuyen', ghiChu: 'Công an huyện',
    });
    assert.equal(kq2.status, 200, kq2.text);
    const sau2 = ctl.db.prepare('SELECT sender_name, identity_erased FROM submissions WHERE id = ?').get(s2.id);
    assert.equal(sau2.sender_name, null);
    assert.equal(sau2.identity_erased, 1);
    assert.equal(ctl.db.prepare('SELECT status FROM data_deletion_requests WHERE submission_id = ?').get(s2.id).status, 'done');
  });

  test('bản đồ, dashboard và danh sách cán bộ lọc đúng phạm vi dieuKienXem + loại rác/thùng rác', { skip: BO_QUA }, async () => {
    const ins = ctl.db.prepare(`INSERT INTO submissions (tracking_code, original_content, category_id, status, urgency,
        to_giac_mat, ngoai_tham_quyen, assigned_to, ward_id, is_spam, deleted_at, created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
    ins.run('HS1001', 'Tin thường hợp lệ', 3, 'processing', 'normal', 0, 0, CAN_BO.id, 1, 0, null, ctl.luc(10));
    ins.run('HS1002', 'Tố giác mật cán bộ', 1, 'processing', 'urgent', 1, 0, CAN_BO.id, 1, 0, null, ctl.luc(9));
    ins.run('HS1003', 'Ngoài thẩm quyền', 3, 'received', 'normal', 0, 1, CAN_BO.id, 1, 0, null, ctl.luc(8));
    ins.run('HS1004', 'Tin spam ẩn', 3, 'spam', 'normal', 0, 0, CAN_BO.id, 1, 1, null, ctl.luc(7));
    ins.run('HS1005', 'Tin thùng rác', 3, 'spam', 'normal', 0, 0, CAN_BO.id, 1, 1, ctl.luc(5), ctl.luc(6));

    const mapH = await goiAd(CAN_BO, 'GET', '/reports/map');
    assert.equal(mapH.status, 200, mapH.text);
    assert.equal(mapH.body.find((w) => w.id === 1).total, 1, 'handler chỉ thấy đúng 1 tin thường trên bản đồ');

    const mapM = await goiAd(PHO, 'GET', '/reports/map');
    assert.equal(mapM.body.find((w) => w.id === 1).total, 3, 'lãnh đạo thấy 3 tin hợp lệ (bỏ spam và thùng rác)');

    const dashH = await goiAd(CAN_BO, 'GET', '/dashboard/stats');
    assert.equal(dashH.status, 200, dashH.text);
    assert.equal(dashH.body.overview.total_submissions, 1);
    assert.equal(dashH.body.recent.length, 1);

    const dashM = await goiAd(TRUONG, 'GET', '/dashboard/stats');
    assert.equal(dashM.body.overview.total_submissions, 3);

    const stH = await goiAd(CAN_BO, 'GET', '/staff');
    assert.equal(stH.status, 200, stH.text);
    assert.equal(stH.body.find((s) => s.id === CAN_BO.id).open_count, 1);
  });

  test('chat người dân chặn hồ sơ trong thùng rác và mã nguy hiểm', { skip: BO_QUA }, async () => {
    const r = await guiDan(donCoTen(6));
    assert.equal(r.status, 201);
    const sub = ctl.db.prepare('SELECT id FROM submissions WHERE tracking_code = ?').get(r.body.trackingCode);

    const open = await goi({
      duongGoc: '/api/chat', router: chatRouter, method: 'POST', duong: '/open',
      body: { code: r.body.trackingCode, pin: r.body.chatPin },
    });
    assert.equal(open.status, 200, open.text);

    const msgXss = await goi({
      duongGoc: '/api/chat', router: chatRouter, method: 'POST', duong: '/messages',
      body: { chatToken: open.body.chatToken, message: '<script>alert(1)</script>' },
    });
    assert.equal(msgXss.status, 400);

    ctl.db.prepare('UPDATE submissions SET deleted_at = NOW() WHERE id = ?').run(sub.id);
    /* Gọi qua HTTP với header Authorization Bearer chatToken */
    const app = express();
    app.use(express.json());
    app.use('/api/chat', chatRouter);
    const srv = app.listen(0);
    try {
      const { port } = srv.address();
      const hdr = { Authorization: `Bearer ${open.body.chatToken}`, 'Content-Type': 'application/json' };
      const rGet = await fetch(`http://127.0.0.1:${port}/api/chat/messages`, { headers: hdr });
      assert.equal(rGet.status, 404);
      const rPost = await fetch(`http://127.0.0.1:${port}/api/chat/messages`, {
        method: 'POST', headers: hdr, body: JSON.stringify({ message: 'Xin hoi tham tin' }),
      });
      assert.equal(rPost.status, 404);
    } finally {
      srv.close();
    }
  });

  test('khieu-nai chống race condition khi gửi song song & ẩn tên file SQL khi lỗi DB', { skip: BO_QUA }, async () => {
    ctl.db.prepare(`INSERT INTO blacklists (identifier, kind, loai_don, reason, expires_at)
                    VALUES (?, 'device', 'co_ten', 'Spam', datetime('now', '+1 day'))`).run(MAY_A);

    const kq = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        goi({
          duongGoc: '/api/khieu-nai', router: khieuNaiRouter, method: 'POST', duong: '/',
          body: { deviceId: MAY_A, noiDung: `Tôi bị khoá nhầm khi gửi góp ý lần thứ ${i + 1}, xin xem xét giúp` },
        })
      )
    );
    const ok201 = kq.filter((r) => r.status === 201);
    assert.equal(ok201.length, 1, `chỉ đúng 1 yêu cầu được tạo, nhận ${ok201.length}`);
    assert.equal(ctl.db.prepare('SELECT COUNT(*) AS n FROM unlock_appeals').get().n, 1);

    /* Lỗi DB không được lộ nang_cap_v17.sql ra public (dùng IP khác để không chạm giới hạn 5 lượt/IP) */
    const goc = pool.query;
    pool.query = async () => { throw new Error("Table 'hop_thu.unlock_appeals' doesn't exist"); };
    const appErr = express();
    appErr.set('trust proxy', 1);
    appErr.use(express.json());
    appErr.use('/api/khieu-nai', khieuNaiRouter);
    const srvErr = appErr.listen(0);
    try {
      const { port } = srvErr.address();
      const resErr = await fetch(`http://127.0.0.1:${port}/api/khieu-nai`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '10.99.99.99' },
        body: JSON.stringify({ deviceId: MAY_A, noiDung: 'Tôi bị khoá nhầm khi gửi phản ánh công dân' }),
      });
      assert.equal(resErr.status, 500);
      const errText = await resErr.text();
      assert.doesNotMatch(errText, /nang_cap_v17|unlock_appeals/);
    } finally {
      pool.query = goc;
      srvErr.close();
    }
  });

  test('helpers.ghiNhatKyTruoc cắt chiTiet dài vẫn tạo JSON hợp lệ trong SQLite CHECK json_valid', { skip: BO_QUA }, async () => {
    await ghiNhatKyTruoc(pool, { staff: TRUONG, ip: '127.0.0.1' }, {
      hanhDong: 'view_submission',
      loaiDoiTuong: 'submission',
      doiTuongId: 1,
      chiTiet: { duLieuDai: 'a'.repeat(3500) },
    });
    const log = ctl.db.prepare('SELECT details FROM staff_activity_logs ORDER BY id DESC LIMIT 1').get();
    assert.ok(log.details.length <= 2000);
    assert.doesNotThrow(() => JSON.parse(log.details));
  });

  test('kiosk cấp chatPin và kiểm SĐT chặt chẽ', { skip: BO_QUA }, async () => {
    const badPhone = await goiAd(CAN_BO, 'POST', '/kiosk/submit', {
      content: 'Đèn đường ngõ 5 bị hỏng đã lâu gây mất an toàn giao thông.',
      category: 'phan_anh',
      fullName: 'Nguyễn Văn An',
      phone: '0123456789',
    });
    assert.equal(badPhone.status, 400);

    const ok = await goiAd(CAN_BO, 'POST', '/kiosk/submit', {
      content: 'Đèn đường ngõ 5 bị hỏng đã lâu gây mất an toàn giao thông.',
      category: 'phan_anh',
      fullName: 'Nguyễn Văn An',
      phone: '0916284735',
    });
    assert.equal(ok.status, 201, ok.text);
    assert.match(String(ok.body.chatPin), /^\d{6}$/);
  });

  test('banned-words cập nhật ngay vào loadBannedWords không cần khởi động lại', { skip: BO_QUA }, async () => {
    ctl.db.exec(`CREATE TABLE banned_words (id INTEGER PRIMARY KEY AUTOINCREMENT, word TEXT UNIQUE, word_type TEXT, added_by INT, is_active INT DEFAULT 1, created_at TEXT DEFAULT (NOW()))`);
    const tuLa = 'tucamtuychinh_' + crypto.randomInt(1000, 9999);
    const add = await goiAd(TRUONG, 'POST', '/banned-words', { word: tuLa, wordType: 'phrase' });
    assert.equal(add.status, 201, add.text);
    assert.equal(containsProfanity(`Câu có chứa ${tuLa} ở giữa`), true);

    const row = ctl.db.prepare('SELECT id FROM banned_words WHERE word = ?').get(tuLa);
    const del = await goiAd(TRUONG, 'DELETE', `/banned-words/${row.id}`);
    assert.equal(del.status, 200);
    assert.equal(containsProfanity(`Câu có chứa ${tuLa} ở giữa`), false);
  });
});

describe('5. requireAuth đồng bộ role từ CSDL tức thì', () => {
  test('hạ quyền admin -> handler trong DB có hiệu lực ngay sau khi làm mới cache', async () => {
    const token = signAccessToken({ id: 9, username: 'haquyen', role: 'admin', full_name: 'Cán bộ X' });
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = resGia();
    let nextCalled = false;

    const gocQuery = pool.query;
    xoaDemTrangThai();
    pool.query = async () => [[{ is_active: 1, role: 'handler' }]];
    try {
      await requireAuth(req, res, () => { nextCalled = true; });
    } finally {
      pool.query = gocQuery;
      xoaDemTrangThai();
    }

    assert.equal(nextCalled, true);
    assert.equal(req.staff.role, 'handler');
  });
});

describe('6. Permissions-Policy mở camera=(self) đồng bộ cả 3 cấu hình giao diện', () => {
  test('public/_headers, vercel.json và deploy/nginx/hop-thu-header.conf đều có camera=(self)', async () => {
    const h = await doc('public/_headers');
    const v = JSON.parse(await doc('vercel.json'));
    const n = await doc('deploy/nginx/hop-thu-header.conf');

    const ppVercel = v.headers[0].headers.find((x) => x.key === 'Permissions-Policy').value;
    assert.match(ppVercel, /\bcamera=\(self\)/);
    assert.match(h, /Permissions-Policy:\s*camera=\(self\)/);
    assert.match(n, /add_header Permissions-Policy "camera=\(self\)/);
  });
});
