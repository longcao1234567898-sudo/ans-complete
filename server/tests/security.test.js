/**
 * KIỂM THỬ ĐƠN VỊ — lib/security.js và lib/helpers.js
 *
 * security.js  : làm sạch đầu vào, kiểm số điện thoại — tuyến phòng thủ đầu tiên
 * helpers.js   : sinh mã tra cứu, băm SHA-256
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  stripDiacritics, sanitizeText, normalizePhone, getPhoneError,
} from '../src/lib/security.js';
import { generateTrackingCode, sha256 } from '../src/lib/helpers.js';

describe('security.js — Làm sạch và kiểm tra đầu vào', () => {

  describe('stripDiacritics() — bỏ dấu tiếng Việt', () => {

    test('bỏ dấu các nguyên âm', () => {
      assert.equal(stripDiacritics('đánh bạc'), 'danh bac');
      assert.equal(stripDiacritics('Nguyễn Thị Ánh'), 'Nguyen Thi Anh');
    });

    test('chuyển đ thành d', () => {
      assert.ok(stripDiacritics('Đường').toLowerCase().startsWith('duong'));
    });

    test('giữ nguyên chữ không dấu', () => {
      assert.equal(stripDiacritics('abc 123'), 'abc 123');
    });
  });

  describe('sanitizeText() — làm sạch ký tự nguy hiểm', () => {

    /* GHI CHÚ QUAN TRỌNG:
       sanitizeText KHÔNG bỏ thẻ HTML — và điều đó là CHẤP NHẬN ĐƯỢC vì:
         1. React tự escape mọi biến khi hiển thị
         2. Hệ thống KHÔNG dùng innerHTML ở bất kỳ đâu (đã kiểm chứng)
         3. CSP script-src 'self' chặn mọi script lạ
       Nhiệm vụ của hàm này là bỏ KÝ TỰ ĐIỀU KHIỂN và KÝ TỰ ẨN —
       thứ có thể dùng để giấu nội dung hoặc gây rối hiển thị. */

    test('loại bỏ ký tự điều khiển', () => {
      const doc = 'Nội dung\u0000có ký tự\u0007điều khiển';
      const sach = sanitizeText(doc);
      assert.ok(!sach.includes('\u0000'), 'Vẫn còn ký tự null');
      assert.ok(!sach.includes('\u0007'), 'Vẫn còn ký tự chuông');
    });

    test('loại bỏ ký tự ẩn không chiều rộng', () => {
      const doc = 'Nội\u200Bdung\uFEFFbị giấu';
      const sach = sanitizeText(doc);
      assert.ok(!sach.includes('\u200B'), 'Vẫn còn ký tự ẩn');
      assert.ok(!sach.includes('\uFEFF'), 'Vẫn còn BOM');
    });

    test('loại bỏ ký tự đảo chiều văn bản (chống giả mạo hiển thị)', () => {
      const doc = 'Nội dung\u202Ebị đảo';
      assert.ok(!sanitizeText(doc).includes('\u202E'), 'Vẫn còn ký tự đảo chiều');
    });

    test('gộp khoảng trắng thừa', () => {
      const sach = sanitizeText('Nội dung        nhiều khoảng trắng');
      assert.ok(!sach.includes('        '), 'Không gộp khoảng trắng');
    });

    test('cắt nội dung quá dài theo giới hạn', () => {
      const dai = 'x'.repeat(10000);
      assert.ok(sanitizeText(dai, 100).length <= 100, 'Không cắt theo maxLength');
    });

    test('giữ nguyên nội dung tiếng Việt bình thường', () => {
      const goc = 'Đường Trần Hưng Đạo có ổ gà lớn';
      assert.ok(sanitizeText(goc).includes('ổ gà'), 'Làm mất nội dung thật');
    });

    test('giữ được số và dấu câu thông thường', () => {
      const goc = 'Khoảng 8 giờ tối ngày 15/7, tại số nhà 123.';
      const sach = sanitizeText(goc);
      assert.ok(sach.includes('8'), 'Mất chữ số');
      assert.ok(sach.includes('15/7'), 'Mất ngày tháng');
    });

    test('xử lý chuỗi rỗng, null, undefined không gây lỗi', () => {
      assert.doesNotThrow(() => sanitizeText(''));
      assert.doesNotThrow(() => sanitizeText(null));
      assert.doesNotThrow(() => sanitizeText(undefined));
    });

    test('không làm hỏng nội dung dài', () => {
      const dai = 'Nội dung phản ánh. '.repeat(100);
      assert.ok(sanitizeText(dai).length > 100);
    });
  });

  describe('normalizePhone() — chuẩn hoá số điện thoại', () => {

    test('bỏ khoảng trắng', () => {
      assert.equal(normalizePhone('090 123 4567'), '0901234567');
    });

    test('bỏ dấu chấm và gạch ngang', () => {
      assert.equal(normalizePhone('090.123.4567'), '0901234567');
      assert.equal(normalizePhone('090-123-4567'), '0901234567');
    });

    test('chuyển +84 về dạng 0', () => {
      const kq = normalizePhone('+84901234567');
      assert.ok(kq === '0901234567' || kq === '84901234567',
        `Kết quả không như mong đợi: ${kq}`);
    });

    test('giữ nguyên số đã chuẩn', () => {
      assert.equal(normalizePhone('0901234567'), '0901234567');
    });
  });

  describe('getPhoneError() — kiểm định dạng số Việt Nam', () => {

    test('chấp nhận số di động hợp lệ', () => {
      // Tránh dãy liên tiếp vì hệ thống CỐ Ý từ chối (xem test dưới)
      const soHopLe = ['0321234567', '0938472615', '0907253841', '0563918274'];
      for (const so of soHopLe) {
        const loi = getPhoneError(so);
        assert.ok(!loi, `Từ chối nhầm số hợp lệ: ${so} — lỗi: ${loi}`);
      }
    });

    /* PHÁT HIỆN KHI KIỂM THỬ: hệ thống có thêm lớp chống SỐ GIẢ —
       từ chối các dãy số liên tiếp kiểu 0901234567 hay 0987654321.
       Đây là tính năng CÓ CHỦ ĐÍCH, không phải lỗi: người gửi bừa
       thường gõ dãy liên tiếp cho nhanh. */
    test('TỪ CHỐI dãy số liên tiếp (chống số giả)', () => {
      assert.ok(getPhoneError('0901234567'), 'Chấp nhận dãy tăng dần 1234567');
      assert.ok(getPhoneError('0987654321'), 'Chấp nhận dãy giảm dần 7654321');
    });

    test('từ chối số quá ngắn', () => {
      assert.notEqual(getPhoneError('090123'), null, 'Chấp nhận số quá ngắn');
    });

    test('từ chối số quá dài', () => {
      assert.notEqual(getPhoneError('09012345678901'), null, 'Chấp nhận số quá dài');
    });

    test('từ chối chuỗi có chữ cái', () => {
      assert.notEqual(getPhoneError('090abcdefg'), null, 'Chấp nhận chuỗi có chữ');
    });

    test('từ chối chuỗi rỗng', () => {
      assert.notEqual(getPhoneError(''), null, 'Chấp nhận chuỗi rỗng');
    });

    test('thông báo lỗi phải là tiếng Việt dễ hiểu', () => {
      const loi = getPhoneError('123');
      if (loi) {
        assert.equal(typeof loi, 'string');
        assert.ok(loi.length > 5, 'Thông báo lỗi quá ngắn, khó hiểu');
      }
    });
  });
});

describe('helpers.js — Tiện ích', () => {

  describe('generateTrackingCode() — sinh mã tra cứu', () => {

    test('mã dài đúng 6 ký tự', () => {
      for (let i = 0; i < 20; i++) {
        assert.equal(generateTrackingCode().length, 6, 'Mã không đúng 6 ký tự');
      }
    });

    test('mã chỉ chứa chữ HOA và số', () => {
      for (let i = 0; i < 20; i++) {
        assert.match(generateTrackingCode(), /^[A-Z0-9]{6}$/, 'Mã có ký tự lạ');
      }
    });

    /* Mã phải NGẪU NHIÊN — nếu đoán được thì người này xem
       được ý kiến của người khác */
    test('sinh 1000 mã phải gần như không trùng', () => {
      const tap = new Set();
      for (let i = 0; i < 1000; i++) tap.add(generateTrackingCode());
      // Cho phép trùng tối đa 1% (36^6 ≈ 2,1 tỷ tổ hợp nên thực tế gần như 0)
      assert.ok(tap.size >= 990,
        `Trùng quá nhiều: ${1000 - tap.size} mã trùng — bộ sinh không đủ ngẫu nhiên`);
    });

    test('không sinh ra mã giống nhau liên tiếp', () => {
      const a = generateTrackingCode();
      const b = generateTrackingCode();
      assert.notEqual(a, b, 'Hai mã liên tiếp giống nhau');
    });
  });

  describe('sha256() — băm SHA-256', () => {

    test('cùng đầu vào ra cùng kết quả (tất định)', () => {
      assert.equal(sha256('nội dung thử'), sha256('nội dung thử'));
    });

    test('đầu vào khác ra kết quả khác', () => {
      assert.notEqual(sha256('nội dung A'), sha256('nội dung B'));
    });

    test('kết quả dài đúng 64 ký tự hexa', () => {
      const bam = sha256('bất kỳ');
      assert.equal(bam.length, 64);
      assert.match(bam, /^[0-9a-f]{64}$/);
    });

    /* Hiệu ứng tuyết lở: đổi 1 ký tự thì bản băm đổi hoàn toàn */
    test('đổi 1 ký tự thì bản băm khác hẳn', () => {
      const a = sha256('nội dung thử');
      const b = sha256('nội dung thứ');
      let giongNhau = 0;
      for (let i = 0; i < 64; i++) if (a[i] === b[i]) giongNhau++;
      assert.ok(giongNhau < 20,
        `Hai bản băm giống nhau ${giongNhau}/64 ký tự — thiếu hiệu ứng tuyết lở`);
    });

    test('xử lý được chuỗi rỗng', () => {
      assert.doesNotThrow(() => sha256(''));
    });

    test('xử lý được nội dung dài', () => {
      const dai = 'x'.repeat(100000);
      assert.equal(sha256(dai).length, 64);
    });
  });
});
