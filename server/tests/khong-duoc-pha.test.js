/**
 * NHÓM B — KHOÁ LẠI 10 QUYẾT ĐỊNH BẢO MẬT ĐÚNG ĐẮN (G1–G10).
 *
 * Dự án này đã làm đúng nhiều thứ khó. Mục đích của file là để người sửa code
 * sau này KHÔNG VÔ TÌNH PHÁ chúng — mỗi test kèm lý do vì sao hành vi đó quan
 * trọng, để người làm đỏ test hiểu mình đang phá cái gì trước khi sửa test.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import express from 'express';
import {
  datBienMoiTruongHopLe, napLai, resGia,
  TEST_ENCRYPTION_KEY, TEST_PEPPER,
} from './helpers-test.js';

datBienMoiTruongHopLe();

const doc = (p) => readFile(new URL(p, import.meta.url), 'utf8');
const CRYPTO = '../src/lib/crypto.js';
const MOI_TRUONG = { ENCRYPTION_KEY: TEST_ENCRYPTION_KEY, HASH_PEPPER: TEST_PEPPER };

describe('G1 — encrypt() ném lỗi khi thiếu khoá, TUYỆT ĐỐI không trả nguyên văn', () => {
  /* Bản cũ trả nguyên văn "để hệ thống không chết". Nghe hợp lý nhưng hậu quả
     tệ hơn nhiều: web vẫn chạy, không báo lỗi gì, mà tên và SĐT người TỐ GIÁC
     bị ghi thẳng dạng chữ vào database — không ai biết cho tới khi mở bảng ra
     xem. Hỏng âm thầm nguy hiểm hơn hỏng ồn ào. */

  test('thiếu ENCRYPTION_KEY -> encrypt() ném EncryptionUnavailableError', async () => {
    const m = await napLai(CRYPTO, { ...MOI_TRUONG, ENCRYPTION_KEY: '' });
    assert.throws(() => m.encrypt('Nguyễn Văn An'), (e) => e.code === 'ENCRYPTION_UNAVAILABLE');
  });

  test('thiếu khoá -> không đường nào trả về được chuỗi gốc', async () => {
    const m = await napLai(CRYPTO, { ...MOI_TRUONG, ENCRYPTION_KEY: '' });
    let kq = null;
    try { kq = m.encrypt('Nguyễn Văn An'); } catch { /* đúng như mong đợi */ }
    assert.notEqual(kq, 'Nguyễn Văn An');
  });

  test('decrypt(encrypt(x)) === x, và dữ liệu cũ chưa mã hoá đọc được nguyên văn', async () => {
    const m = await napLai(CRYPTO, MOI_TRUONG);
    assert.equal(m.decrypt(m.encrypt('Nguyễn Văn An')), 'Nguyễn Văn An');
    assert.equal(m.decrypt('Trần Thị Bình'), 'Trần Thị Bình');
  });
});

describe('G2 — thiếu khoá thì route trả 503 và KHÔNG lưu gì (fail-safe)', () => {
  test('routes/submissions.js chặn sớm bằng encryptionEnabled() rồi return 503', async () => {
    const nguon = await doc('../src/routes/submissions.js');
    assert.match(nguon, /if \(!encryptionEnabled\(\)\)/);
    assert.match(nguon, /status\(503\)/);
    assert.match(nguon, /ENCRYPTION_UNAVAILABLE/);

    // Việc chặn phải nằm TRƯỚC lệnh INSERT, nếu không thì đã lưu mất rồi
    assert.ok(
      nguon.indexOf('status(503)') < nguon.indexOf('INSERT INTO submissions'),
      'Kiểm tra khoá phải đứng TRƯỚC INSERT — chặn sau khi lưu là vô nghĩa'
    );
  });

  test('routes/admin/kiosk.js cũng chặn 503 (ki-ốt LUÔN có danh tính)', async () => {
    const nguon = await doc('../src/routes/admin/kiosk.js');
    assert.match(nguon, /if \(!encryptionEnabled\(\)\)/);
    assert.ok(nguon.indexOf('status(503)') < nguon.indexOf('INSERT INTO submissions'));
  });
});

describe('G3 — tố giác ẨN DANH vẫn gửi được kể cả khi mã hoá hỏng', () => {
  /* Đây là kênh quan trọng nhất của hệ thống, không được gián đoạn. Ẩn danh
     không có danh tính để mã hoá nên không có lý do gì phải chặn. */

  test('khối chặn 503 nằm TRONG nhánh if (!isAnonymous)', async () => {
    const nguon = await doc('../src/routes/submissions.js');
    const moc = nguon.indexOf('if (!isAnonymous) {');
    assert.ok(moc > -1, 'Không còn nhánh if (!isAnonymous)');

    const viTri503 = nguon.indexOf('status(503)');
    assert.ok(viTri503 > moc, 'Chặn 503 phải nằm SAU khi đã biết tin này có danh tính');
  });

  test('ẩn danh -> mọi trường danh tính đều là NULL, không gọi encrypt()', async () => {
    const nguon = await doc('../src/routes/submissions.js');
    for (const truong of ['fullName', 'phone']) {
      assert.match(
        nguon, new RegExp(`isAnonymous \\? null : encrypt\\(${truong}\\)`),
        `Ẩn danh phải lưu NULL cho ${truong}, không đi qua encrypt()`
      );
    }
  });

  test('ẩn danh -> KHÔNG lưu User-Agent (dấu vân tay lần ra người tố giác)', async () => {
    const nguon = await doc('../src/routes/submissions.js');
    assert.match(nguon, /isAnonymous \? null : \(req\.headers\['user-agent'\]/);
  });
});

describe('G4 — gửi email OTP thất bại thì BÁO LỖI, không hiện mã ra màn hình', () => {
  /* Hiện mã ra màn hình = ai cũng xác thực được email người khác: chỉ cần nhập
     email nạn nhân, để mail gửi hỏng, mã hiện ngay trên màn hình. Phá vỡ hoàn
     toàn ý nghĩa của OTP email. */

  test('mailer: đã cấu hình mail mà gửi hỏng -> trả failed, KHÔNG có devCode', async () => {
    const m = await napLai('../src/lib/mailer.js', {
      BREVO_API_KEY: 'key-gia-de-ep-vao-nhanh-brevo',
      MAIL_USER: 'test@example.com',
    });

    // fetch tới Brevo sẽ hỏng (key giả) -> đi vào nhánh catch
    const kq = await m.sendOtpEmail('nan-nhan@example.com', '123456');

    assert.equal(kq.failed, true, 'Phải báo thất bại rõ ràng');
    assert.equal(kq.devCode, undefined, 'devCode lộ mã OTP của người khác!');
    assert.ok(!JSON.stringify(kq).includes('123456'), 'Mã OTP không được lọt vào kết quả');
  });

  test('route otp: gửi hỏng -> huỷ mã và trả 502, không trả mã', async () => {
    const nguon = await doc('../src/routes/otp.js');
    assert.match(nguon, /if \(result\.failed\)/);
    assert.match(nguon, /status\(502\)/);
    // devCode chỉ được trả khi máy chủ HOÀN TOÀN chưa cấu hình email (chế độ demo)
    assert.match(nguon, /result\.devCode \? \{ devCode: result\.devCode/);
  });
});

describe('G5 — KHÔNG khoá tài khoản khi sai mật khẩu, sai >= 3 lần thì bắt CAPTCHA', () => {
  /* Khoá tài khoản tạo ra lỗ hổng khác nguy hiểm hơn: kẻ xấu cố ý gõ sai liên
     tục là KHOÁ ĐƯỢC cán bộ trực ban ra khỏi hệ thống tiếp nhận tin báo khẩn cấp. */

  test('luồng đăng nhập sai KHÔNG hề đặt locked_until', async () => {
    const nguon = await doc('../src/routes/auth.js');
    assert.ok(
      !/SET[^;]*locked_until\s*=/i.test(nguon),
      'Có UPDATE locked_until -> cơ chế khoá tài khoản đã quay lại'
    );
  });

  test('chỉ tăng bộ đếm failed_attempts', async () => {
    const nguon = await doc('../src/routes/auth.js');
    assert.match(nguon, /UPDATE staff SET failed_attempts = \? WHERE id = \?/);
  });

  test('sai >= 3 lần -> trả canCaptcha: true để giao diện hiện ô xác minh', async () => {
    const nguon = await doc('../src/routes/auth.js');
    assert.match(nguon, /SO_LAN_SAI_BAT_CAPTCHA = 3/);
    assert.match(nguon, /canCaptcha: soLanSai >= SO_LAN_SAI_BAT_CAPTCHA/);
  });
});

describe('G6 — chống dò tài khoản qua thời gian phản hồi và qua thông báo lỗi', () => {
  test('LUÔN chạy bcrypt.compare kể cả khi không tìm thấy user', async () => {
    const nguon = await doc('../src/routes/auth.js');
    assert.match(
      nguon, /bcrypt\.compare\(password, staff\?\.password_hash \|\| DUMMY_HASH\)/,
      'Bỏ DUMMY_HASH đi thì sai-tên trả lời nhanh hơn sai-mật-khẩu -> dò được tài khoản nào có thật'
    );
  });

  test('thông báo sai-tên và sai-mật-khẩu là MỘT câu duy nhất trong mã nguồn', async () => {
    const nguon = await doc('../src/routes/auth.js');
    const soLan = (nguon.match(/Tên đăng nhập hoặc mật khẩu không đúng\./g) || []).length;
    assert.equal(soLan, 1, 'Chỉ được có MỘT nhánh trả lỗi -> không thể lệch câu chữ');

    // Và nhánh đó phải xử lý cả hai trường hợp cùng lúc
    assert.match(nguon, /if \(!staff \|\| !ok\)/);
  });
});

describe('G7 — mọi lượt xem danh tính đều ghi nhật ký TRƯỚC khi trả dữ liệu', () => {
  test('INSERT staff_activity_logs đứng trước res.json trong route /reveal', async () => {
    const nguon = await doc('../src/routes/admin/submissions.js');
    const moc = nguon.indexOf("router.post('/:id/reveal'");
    const viTriLog = nguon.indexOf("'reveal_identity'", moc);
    const viTriTra = nguon.indexOf('sender_name: decrypt(', moc);

    assert.ok(viTriLog > -1, 'Không còn ghi nhật ký reveal_identity');
    assert.ok(viTriLog < viTriTra, 'Ghi nhật ký SAU khi trả dữ liệu = có thể trả rồi mới lỗi');
  });
});

describe('G8 — 100% truy vấn dùng parameterized query, không nối chuỗi giá trị', () => {
  test('không có template literal nhét biến vào giữa câu SQL', async () => {
    const { readdir } = await import('node:fs/promises');

    async function quet(thuMuc) {
      const loi = [];
      for (const muc of await readdir(thuMuc, { withFileTypes: true })) {
        const duong = new URL(`${muc.name}${muc.isDirectory() ? '/' : ''}`, thuMuc);
        if (muc.isDirectory()) { loi.push(...await quet(duong)); continue; }
        if (!muc.name.endsWith('.js')) continue;

        const nguon = await readFile(duong, 'utf8');

        /* Chỉ soi CHUỖI TEMPLATE CHỨA SQL, không soi chuỗi thông báo cho người
           dùng (những chuỗi đó nội suy biến là bình thường và vô hại).

           Hai chỗ nội suy HỢP LỆ đã rà tay:
           - ${whereSql}: ghép MỆNH ĐỀ đã dựng sẵn, mọi GIÁ TRỊ vẫn đi qua mảng params
           - ${action === 'spam' ? ... : 'NULL'}: hằng SQL, không phải dữ liệu người dùng */
        for (const chuoi of nguon.match(/`[^`]*`/g) || []) {
          if (!/\b(SELECT|INSERT INTO|UPDATE|DELETE FROM|CALL)\b/i.test(chuoi)) continue;

          for (const khop of chuoi.matchAll(/\$\{([^}]+)\}/g)) {
            const bieuThuc = khop[1].trim();
            const hopLe = bieuThuc === 'whereSql'
              /* submissions.js — chọn một trong NĂM mệnh đề ORDER BY viết sẵn
                 trong hằng CACH_SAP_XEP. Tham số ?sort= của người dùng chỉ dùng
                 để TRA KHOÁ trong bảng đó; khoá lạ thì rơi về mac_dinh. Không
                 một ký tự nào từ người dùng lọt vào câu SQL. */
              || bieuThuc === 'sapXepSql'
              || /^action === 'spam' \? '(NOW\(\)|\?)' : 'NULL'$/.test(bieuThuc)
              /* reports.js — bật/tắt mệnh đề lọc theo số ngày. Bản thân SỐ NGÀY
                 vẫn đi qua dấu ? ở mảng params, chuỗi này chỉ là hằng SQL. */
              || bieuThuc === 'loc'
              /* incident-groups.js — chọn giữa HAI hằng SQL viết sẵn, dựa trên
                 một biến boolean (req.query.chuaXem === '1'). Không có dữ liệu
                 người dùng nào lọt vào câu lệnh. */
              || /^chiChuaXem \? 'AND g\.acknowledged = FALSE' : ''$/.test(bieuThuc);
            if (!hopLe) loi.push(`${muc.name}: \${${bieuThuc}}`);
          }
        }
      }
      return loi;
    }

    const loi = await quet(new URL('../src/', import.meta.url));
    assert.deepEqual(loi, [], 'Nối giá trị vào SQL = mở cửa SQL Injection. Dùng dấu ? và mảng params.');
  });
});

describe('G9 — quyền xoá dữ liệu theo Nghị định 13/2023', () => {
  test('hồ sơ ĐÃ ĐÓNG -> xoá danh tính NGAY, ghi nhận status done', async () => {
    const nguon = await doc('../src/routes/tracking.js');
    assert.match(nguon, /const hoSoDaDong = sub\.status === 'resolved' \|\| sub\.status === 'rejected'/);
    assert.match(nguon, /identity_erased = TRUE/);
    assert.match(nguon, /VALUES \(\?,\?,'done',\?,NOW\(\)\)/);
  });

  test('hồ sơ ĐANG XỬ LÝ -> ghi nhận pending, chưa xoá', async () => {
    const nguon = await doc('../src/routes/tracking.js');
    assert.match(nguon, /VALUES \(\?,\?,'pending',\?,\?\)/);
  });

  test('tin ẩn danh -> báo không có gì để xoá', async () => {
    const nguon = await doc('../src/routes/tracking.js');
    assert.match(nguon, /status: 'nothing'/);
  });

  test('đóng hồ sơ -> tự xoá danh tính nếu đã có yêu cầu chờ', async () => {
    const nguon = await doc('../src/routes/admin/submissions.js');
    assert.match(nguon, /if \(status === 'resolved' \|\| status === 'rejected'\)/);
    assert.match(nguon, /SET status = 'done', handled_at = NOW\(\)/);
  });
});

describe('G10 — cookie secure MẶC ĐỊNH BẬT, chỉ tắt khi chạy localhost', () => {
  /* KHÔNG dựa vào NODE_ENV: Render không tự đặt biến này, nên
     `secure: NODE_ENV === 'production'` luôn ra FALSE ngay cả khi chạy thật. */

  test('secure suy ra từ CLIENT_URL, không phải từ NODE_ENV', async () => {
    const nguon = await doc('../src/routes/auth.js');
    assert.match(nguon, /secure: !CHAY_O_MAY_CA_NHAN/);
    assert.match(nguon, /CLIENT_URL[^;]*localhost/);

    // Bỏ comment trước khi kiểm: comment đang GIẢI THÍCH lỗi cũ nên có nhắc
    // NODE_ENV, giữ nguyên nó là đúng — chỉ mã thật mới không được dùng.
    const ma = nguon.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    assert.ok(
      !/secure:.*NODE_ENV/.test(ma),
      'Quay lại dựa vào NODE_ENV = cookie mất cờ secure trên Render'
    );
  });

  test('httpOnly luôn bật (JavaScript không đọc được refresh token)', async () => {
    const nguon = await doc('../src/routes/auth.js');
    assert.match(nguon, /httpOnly: true/);
  });
});

describe('Ngưỡng và hạn mức được chọn từ số liệu — không được đổi tuỳ tiện', () => {
  test('ngưỡng chống trùng lặp giữ nguyên 0.75 / 0.85', async () => {
    const nguon = await doc('../src/lib/duplicate.js');
    assert.match(nguon, /NGUONG_CHAN_CUNG_IP = 0\.75/);
    assert.match(nguon, /NGUONG_DANH_DAU\s*= 0\.85/);
  });

  test('hạn mức chống spam giữ nguyên', async () => {
    const nguon = await doc('../src/routes/submissions.js');
    assert.match(nguon, /COOLDOWN_MS = 2 \* 60_000/);
    assert.match(nguon, /MAX_PER_HOUR = 5/);
    assert.match(nguon, /ANON_COOLDOWN_MS = 10 \* 60_000/);
    assert.match(nguon, /ANON_MAX_PER_DAY = 2/);
    assert.match(nguon, /ANON_MIN_LENGTH = 50/);
  });
});

describe('maskName / maskPhone không để lọt đủ danh tính', () => {
  test('maskPhone không lộ đủ 10 số để gọi được', async () => {
    const { maskPhone } = await napLai(CRYPTO, MOI_TRUONG);
    const che = maskPhone('0901234567');
    assert.ok(che.replace(/\D/g, '').length < 10);
    assert.ok(che.startsWith('090'), 'Vẫn giữ đầu số để cán bộ nhận diện nhà mạng');
  });

  test('maskName không lộ tên đầy đủ', async () => {
    const { maskName } = await napLai(CRYPTO, MOI_TRUONG);
    const che = maskName('Nguyễn Văn An');
    assert.ok(!che.includes('Văn An'));
    assert.ok(che.includes('*'));
  });

  test('danh sách và dashboard đều CHE tên, không bao giờ hiện đầy đủ', async () => {
    for (const p of ['../src/routes/admin/submissions.js', '../src/routes/admin/dashboard.js', '../src/routes/admin/reports.js']) {
      const nguon = await doc(p);
      assert.match(nguon, /maskName\(decrypt\(/, `${p} phải che tên ở danh sách`);
    }
  });
});

describe('Ki-ốt và thùng rác ghi nhật ký ĐÍCH DANH, không ghi staff_id NULL', () => {
  test('không còn req.staff?.id ?? null trong routes/admin', async () => {
    for (const p of ['../src/routes/admin/kiosk.js', '../src/routes/admin/trash.js']) {
      const nguon = await doc(p);
      assert.ok(
        !/req\.staff\?\.id \?\? null/.test(nguon),
        `${p} ghi staff_id = NULL -> mất khả năng truy vết ai đã thao tác`
      );
    }
  });
});

describe('requireAuth vẫn chặn đúng sau khi dồn về router cha', () => {
  test('GET /api/admin/trash không token -> 401 (lỗ hổng C1 không quay lại)', async () => {
    const { default: adminRouter } = await import('../src/routes/admin/index.js');
    const app = express();
    app.use(express.json());
    app.use('/api/admin', adminRouter);

    const server = app.listen(0);
    try {
      const { port } = server.address();
      const res = await fetch(`http://127.0.0.1:${port}/api/admin/trash`);
      assert.equal(res.status, 401);
    } finally {
      server.close();
    }
  });

  test('authorize() không có req.staff -> 401, không cho qua', async () => {
    const { authorize } = await import('../src/middleware/authorize.js');
    const res = resGia();
    let next = false;
    authorize()({}, res, () => { next = true; });
    assert.equal(res.statusCode, 401);
    assert.equal(next, false);
  });
});

describe('G11 — luồng tố giác ẨN DANH khớp theo MÃ PHIÊN, không theo IP', () => {
  /* LỖI ĐÃ XẢY RA THẬT (gói tính năng 2): otp.js được sửa để cấp "vé" gắn với
     một MÃ PHIÊN ngẫu nhiên (anonId) thay vì địa chỉ IP — vì mạng 4G đổi IP
     giữa chừng làm bà con bị báo "Mã đã hết hạn" oan. Nhưng chỗ GỌI trong
     routes/submissions.js vẫn truyền `ip`:

         verifyAnonToken(body.otpToken, ip)

     verifyAnonToken() so sha256('anon:' + tham_số_2) với emailHash trong vé,
     mà vé được ký bằng sha256('anon:' + anonId). Hai vế KHÔNG BAO GIỜ khớp
     -> mọi tin báo ẩn danh bị từ chối 401. Tính năng bảo vệ người tố giác
     chết hoàn toàn mà không có lỗi nào hiện ra ở log máy chủ.

     Test đọc mã nguồn thay vì gọi thật, để không cần MySQL. */

  test('submissions.js truyền anonId (KHÔNG phải ip) vào verifyAnonToken', async () => {
    const nguon = await doc('../src/routes/submissions.js');
    // Chỉ bắt lời gọi THẬT (có tham số) — bỏ qua "verifyAnonToken()" trong chú thích
    const goi = nguon.match(/verifyAnonToken\(\s*([^)]+?)\s*\)/);
    assert.ok(goi, 'submissions.js phải gọi verifyAnonToken');

    const thamSo = goi[1].split(',').map((s) => s.trim());
    assert.equal(thamSo.length, 2, 'verifyAnonToken nhận đúng 2 tham số');
    assert.match(
      thamSo[1],
      /anonId/,
      'Tham số thứ 2 phải là mã phiên (anonId), không phải ip — xem giải thích ở routes/otp.js'
    );
  });

  test('verifyAnonToken băm tham số thứ 2 đúng cách anon-verify đã ký', async () => {
    const nguon = await doc('../src/routes/otp.js');
    // Cả nơi KÝ vé và nơi KIỂM vé đều phải dùng tiền tố 'anon:' trên cùng giá trị
    const soLanBam = (nguon.match(/'anon:'/g) || []).length;
    assert.ok(soLanBam >= 3, "otp.js phải băm 'anon:' + mã phiên ở cả lúc cấp, lúc kiểm và lúc xác minh vé");
  });
});
