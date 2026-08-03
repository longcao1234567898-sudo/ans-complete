/**
 * KIỂM THỬ ĐƠN VỊ — lib/crypto.js
 *
 * Đây là module QUAN TRỌNG NHẤT về bảo mật: nó mã hoá danh tính người tố giác.
 * Sai ở đây hậu quả nghiêm trọng nhất, nên kiểm thử kỹ nhất.
 *
 * Chạy: node --test server/tests/
 * Không cần cài thư viện — dùng bộ chạy kiểm thử tích hợp của Node 18+.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// Đặt khoá thử trước khi nạp module (module đọc biến môi trường lúc khởi tạo)
//
// ⚠️ ĐÂY LÀ KHOÁ GIẢ, CHỈ DÙNG ĐỂ KIỂM THỬ.
// TUYỆT ĐỐI KHÔNG dán khoá thật của Render vào đây: file này nằm trong repo,
// mà repo thì có thể để công khai — dán khoá thật vào là lộ danh tính người
// tố giác cho bất kỳ ai clone được mã nguồn.
process.env.ENCRYPTION_KEY =
  '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff';

// Pepper cho các hàm băm định danh — cũng là giá trị GIẢ, xem cảnh báo ở trên.
process.env.HASH_PEPPER = 'pepper-gia-chi-dung-de-kiem-thu-0123456789';

const {
  encrypt, decrypt, maskName, maskPhone, hashPhone,
  encryptionEnabled, encryptionProblem, EncryptionUnavailableError,
} = await import('../src/lib/crypto.js');

describe('crypto.js — Mã hoá danh tính', () => {

  describe('encrypt() và decrypt()', () => {

    test('mã hoá rồi giải mã phải ra đúng chuỗi gốc', () => {
      const goc = 'Nguyễn Văn An';
      const ma = encrypt(goc);
      assert.equal(decrypt(ma), goc, 'Giải mã không khớp bản gốc');
    });

    test('bản mã phải KHÁC bản gốc', () => {
      const goc = 'Nguyễn Văn An';
      const ma = encrypt(goc);
      assert.notEqual(ma, goc, 'Bản mã trùng bản gốc — chưa mã hoá!');
    });

    test('bản mã phải có tiền tố enc:v1: để đánh dấu phiên bản', () => {
      const ma = encrypt('Trần Thị Bình');
      assert.ok(ma.startsWith('enc:v1:'), 'Thiếu tiền tố phiên bản');
    });

    /* ĐÂY LÀ PHÉP THỬ QUAN TRỌNG NHẤT.
       Hai người CÙNG TÊN phải ra bản mã KHÁC NHAU.
       Nếu giống nhau, kẻ đọc database sẽ biết "hai người này cùng tên"
       — đã là rò rỉ thông tin, dù không biết tên gì. */
    test('cùng một chuỗi mã hoá 2 lần phải ra 2 bản mã KHÁC NHAU', () => {
      const goc = 'Nguyễn Văn An';
      const ma1 = encrypt(goc);
      const ma2 = encrypt(goc);
      assert.notEqual(ma1, ma2,
        'Hai lần mã hoá ra kết quả giống nhau — vector khởi tạo không ngẫu nhiên!');
      // Nhưng giải mã cả hai đều phải ra đúng gốc
      assert.equal(decrypt(ma1), goc);
      assert.equal(decrypt(ma2), goc);
    });

    test('giữ nguyên dấu tiếng Việt', () => {
      const goc = 'Nguyễn Thị Ánh Nguyệt';
      assert.equal(decrypt(encrypt(goc)), goc);
    });

    test('xử lý được chuỗi rỗng', () => {
      assert.doesNotThrow(() => encrypt(''));
    });

    test('xử lý được số điện thoại', () => {
      const sdt = '0901234567';
      assert.equal(decrypt(encrypt(sdt)), sdt);
    });

    /* Chế độ GCM có mã xác thực toàn vẹn.
       Sửa bản mã thì giải mã PHẢI thất bại — đó là điểm khác CBC. */
    test('sửa bản mã thì giải mã phải thất bại (tính toàn vẹn GCM)', () => {
      const ma = encrypt('Nguyễn Văn An');
      // Đổi một ký tự ở giữa phần dữ liệu
      const maHong = ma.slice(0, -5) + 'XXXXX';
      const ketQua = decrypt(maHong);
      // Giải mã hỏng phải trả về null hoặc ném lỗi, KHÔNG được trả dữ liệu sai
      assert.notEqual(ketQua, 'Nguyễn Văn An',
        'Giải mã bản mã đã bị sửa vẫn ra kết quả đúng — mất tính toàn vẹn!');
    });

    test('giải mã chuỗi không phải bản mã thì không được ném lỗi làm sập hệ thống', () => {
      assert.doesNotThrow(() => decrypt('chuoi bat ky khong phai ban ma'));
    });
  });

  describe('maskName() — che tên hiển thị', () => {

    test('che phần tên, giữ họ', () => {
      const che = maskName('Nguyễn Văn An');
      assert.notEqual(che, 'Nguyễn Văn An', 'Không che gì cả');
      assert.ok(che.includes('*'), 'Không có dấu sao che');
    });

    test('không lộ tên đầy đủ', () => {
      const che = maskName('Nguyễn Văn An');
      assert.ok(!che.includes('Văn An'), 'Vẫn lộ tên đầy đủ');
    });

    test('xử lý được tên một chữ', () => {
      assert.doesNotThrow(() => maskName('An'));
    });

    test('xử lý được chuỗi rỗng và null', () => {
      assert.doesNotThrow(() => maskName(''));
      assert.doesNotThrow(() => maskName(null));
    });
  });

  describe('maskPhone() — che số điện thoại', () => {

    test('che phần giữa số điện thoại', () => {
      const che = maskPhone('0901234567');
      assert.ok(che.includes('*'), 'Không che gì');
      assert.notEqual(che, '0901234567', 'Không che gì cả');
    });

    test('giữ vài số đầu để cán bộ nhận diện được nhà mạng', () => {
      const che = maskPhone('0901234567');
      assert.ok(che.startsWith('090'), 'Không giữ đầu số');
    });

    test('không lộ đủ số để gọi được', () => {
      const che = maskPhone('0901234567');
      const soConLai = che.replace(/\D/g, '');
      assert.ok(soConLai.length < 10, 'Vẫn lộ đủ 10 số — gọi được!');
    });
  });

  describe('hashPhone() — băm số điện thoại', () => {

    /* Băm là MỘT CHIỀU và TẤT ĐỊNH:
       cùng đầu vào luôn ra cùng kết quả (để đối chiếu được),
       nhưng không suy ngược ra được. */
    test('cùng số điện thoại luôn ra cùng bản băm', () => {
      assert.equal(hashPhone('0901234567'), hashPhone('0901234567'));
    });

    test('số khác nhau ra bản băm khác nhau', () => {
      assert.notEqual(hashPhone('0901234567'), hashPhone('0901234568'));
    });

    /* HMAC-SHA256 cũng ra 64 ký tự hexa như SHA-256 trần, nên cột
       sender_phone_hash CHAR(64) vẫn vừa khít — không cần ALTER TABLE. */
    test('bản băm phải dài đúng 64 ký tự hexa (vừa cột CHAR(64))', () => {
      const bam = hashPhone('0901234567');
      assert.equal(bam.length, 64, 'Không phải HMAC-SHA256');
      assert.match(bam, /^[0-9a-f]{64}$/, 'Không phải chuỗi hexa');
    });

    test('bản băm KHÔNG chứa số gốc', () => {
      const bam = hashPhone('0901234567');
      assert.ok(!bam.includes('0901234567'), 'Bản băm lộ số gốc!');
    });
  });

  describe('encryptionEnabled()', () => {
    test('trả về true khi đã cấu hình khoá', () => {
      assert.equal(encryptionEnabled(), true);
    });

    test('không có vấn đề gì khi khoá hợp lệ', () => {
      assert.equal(encryptionProblem(), null);
    });
  });

  /* ================================================================
     AN TOÀN KHI HỎNG (fail-safe)

     Bản cũ: thiếu khoá -> encrypt() trả về NGUYÊN VĂN "để hệ thống
     không chết". Hậu quả: danh tính người tố giác bị ghi thẳng dạng
     chữ vào database, web vẫn chạy bình thường, KHÔNG AI BIẾT.

     Bản mới: thiếu khoá -> NÉM LỖI, route trả 503, không lưu gì.
     Nhóm kiểm thử này canh không cho ai vô tình khôi phục lỗi cũ.
     ================================================================ */
  describe('An toàn khi hỏng — thiếu khoá thì PHẢI từ chối', () => {

    /** Nạp lại module với khoá khác (khoá được nhớ trong module) */
    async function napLaiVoiKhoa(khoa) {
      process.env.ENCRYPTION_KEY = khoa;
      return import('../src/lib/crypto.js?tinh-huong=' + Math.random());
    }

    test('THIẾU khoá: encrypt() ném lỗi, KHÔNG trả chữ trần', async () => {
      const m = await napLaiVoiKhoa('');
      assert.equal(m.encryptionEnabled(), false);
      assert.throws(
        () => m.encrypt('Nguyễn Văn An'),
        (e) => e.code === 'ENCRYPTION_UNAVAILABLE',
        'encrypt() phải ném lỗi khi thiếu khoá — nếu test này hỏng nghĩa là ' +
        'lỗi lưu danh tính dạng chữ trần đã quay lại!'
      );
    });

    test('THIẾU khoá: tuyệt đối không trả về chuỗi gốc', async () => {
      const m = await napLaiVoiKhoa('');
      let ketQua = null;
      try { ketQua = m.encrypt('Nguyễn Văn An'); } catch { /* đúng như mong đợi */ }
      assert.notEqual(ketQua, 'Nguyễn Văn An', 'Đã trả về chữ trần!');
    });

    test('khoá SAI ĐỊNH DẠNG cũng bị coi là không có khoá', async () => {
      const m = await napLaiVoiKhoa('khoa-bay-ba-khong-phai-hex');
      assert.equal(m.encryptionEnabled(), false);
      assert.match(m.encryptionProblem(), /sai định dạng/);
    });

    test('khoá TOÀN SỐ 0 bị từ chối (thường do copy thiếu)', async () => {
      const m = await napLaiVoiKhoa('0'.repeat(64));
      assert.equal(m.encryptionEnabled(), false);
      assert.match(m.encryptionProblem(), /toàn số 0/);
    });

    test('assertEncryptionReady() ném lỗi để route chặn sớm', async () => {
      const m = await napLaiVoiKhoa('');
      assert.throws(() => m.assertEncryptionReady(),
        (e) => e instanceof m.EncryptionUnavailableError);
    });

    test('thiếu khoá vẫn ĐỌC được dữ liệu cũ chưa mã hoá (không làm sập trang)', async () => {
      const m = await napLaiVoiKhoa('');
      assert.equal(m.decrypt('Trần Thị Bình'), 'Trần Thị Bình');
    });

    test('thiếu khoá thì báo rõ là không giải mã được, không trả rác', async () => {
      const m = await napLaiVoiKhoa('');
      const kq = m.decrypt('enc:v1:aabb:ccdd:eeff');
      assert.match(kq, /Không giải mã được/);
    });
  });
});
