/**
 * NHÓM C — Logic bảo mật cốt lõi, thuần tuý, không chạm database.
 * Rẻ và giá trị cao: đây là những hàm quyết định tin nào được nhận, tin nào bị
 * coi là trùng lặp, số điện thoại nào là thật.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  containsProfanity, getPhoneError, normalizePhone, sanitizeText, scanTextForThreats,
} from '../src/lib/security.js';
import { doTuongDong, chuanHoaManh, kiemTraTrungLapGanDung } from '../src/lib/duplicate.js';
import { generateTrackingCode } from '../src/lib/helpers.js';
import { poolGia } from './helpers-test.js';

describe('containsProfanity — bộ lọc ngôn từ', () => {
  test('bắt cụm có dấu', () => {
    assert.equal(containsProfanity('thằng chó này'), true);
    assert.equal(containsProfanity('đồ khốn nạn'), true);
  });

  test('bắt viết tắt', () => {
    assert.equal(containsProfanity('dm cái thằng đó'), true);
    assert.equal(containsProfanity('vcl'), true);
  });

  test('bắt leetspeak (l0z -> loz, dj7 -> djt)', () => {
    assert.equal(containsProfanity('l0z'), true);
    assert.equal(containsProfanity('dj7'), true);   // 7 -> t
    assert.equal(containsProfanity('c4k'), true);   // 4 -> a
  });

  test('bắt kiểu chèn ký tự né lọc (đ.m)', () => {
    assert.equal(containsProfanity('đ.m'), true);
    assert.equal(containsProfanity('đ-m'), true);
  });

  /* Quan trọng không kém: KHÔNG báo nhầm. Báo nhầm là chặn oan tin báo thật. */
  test('KHÔNG báo nhầm từ bình thường chứa chuỗi con', () => {
    for (const cau of [
      'tôi xin cấp lại cccd',
      'khu vực công cộng bị mất vệ sinh',
      'đề nghị lắp đèn đường',
      'xin hỏi thủ tục tạm trú',
      'nhà bà Dung ở cuối xóm',
    ]) {
      assert.equal(containsProfanity(cau), false, `Báo nhầm: "${cau}"`);
    }
  });

  test('chuỗi rỗng / null không ném lỗi', () => {
    assert.equal(containsProfanity(''), false);
    assert.equal(containsProfanity(null), false);
  });
});

describe('normalizePhone', () => {
  test('+84 -> 0', () => assert.equal(normalizePhone('+84901234567'), '0901234567'));
  test('84 -> 0', () => assert.equal(normalizePhone('84901234567'), '0901234567'));
  test('bỏ dấu cách và gạch', () => {
    assert.equal(normalizePhone('090 123 45 67'), '0901234567');
    assert.equal(normalizePhone('090-123-4567'), '0901234567');
    assert.equal(normalizePhone('(090) 123.4567'), '0901234567');
  });
  test('null không ném lỗi', () => assert.equal(normalizePhone(null), ''));
});

describe('getPhoneError', () => {
  // Số thật, không có dãy liên tiếp dài và không lặp chữ số bất thường
  test('10 số di động hợp lệ -> không lỗi', () => {
    for (const so of ['0908273645', '0356472819', '0528374615', '0763829154']) {
      assert.equal(getPhoneError(so), '', `${so} phải hợp lệ`);
    }
  });

  test('11 số cố định 02xx hợp lệ', () => {
    assert.equal(getPhoneError('02963850271'), '');
  });

  test('11 số KHÔNG bắt đầu 02 -> lỗi', () => {
    assert.match(getPhoneError('09612345678'), /cố định/);
  });

  test('đầu số di động không tồn tại -> lỗi', () => {
    assert.match(getPhoneError('0123456789'), /Đầu số/);
    assert.match(getPhoneError('0401234567'), /Đầu số/);
  });

  test('dãy liên tiếp bất thường -> lỗi', () => {
    assert.match(getPhoneError('0912345678'), /liên tiếp/);
  });

  test('chữ số lặp bất thường -> lỗi', () => {
    assert.match(getPhoneError('0900000567'), /lặp/);
  });

  test('độ dài sai -> lỗi', () => {
    assert.match(getPhoneError('090123'), /10 số/);
  });

  test('để trống -> nhắc nhập', () => {
    assert.match(getPhoneError(''), /Vui lòng nhập/);
  });
});

describe('chuanHoaManh / doTuongDong — chống trùng lặp', () => {
  test('bỏ dấu, bỏ hoa thường, bỏ dấu câu', () => {
    assert.equal(chuanHoaManh('Đường X có ổ gà!'), 'duong x co o ga');
  });

  test('hai biến thể "trang trí" ra cùng một chuỗi', () => {
    assert.equal(chuanHoaManh('Đường X có ổ gà!'), chuanHoaManh('duong x co o ga'));
  });

  test('giống hệt -> 1.0', () => {
    const t = 'duong tran hung dao co o ga rat lon gay nguy hiem cho nguoi di duong';
    assert.equal(doTuongDong(t, t), 1);
  });

  test('không chung từ nào -> 0', () => {
    assert.equal(doTuongDong('alpha beta', 'gamma delta'), 0);
  });

  test('chuỗi rỗng -> 0, không ném lỗi', () => {
    assert.equal(doTuongDong('', 'gì đó'), 0);
    assert.equal(doTuongDong(null, null), 0);
  });

  /* Mánh né tránh hay dùng nhất: độn thêm câu chào dài để làm loãng Jaccard.
     Phép BAO HÀM trong doTuongDong sinh ra chính vì việc này. */
  test('mánh "độn câu chào" vẫn bị bắt (>= ngưỡng chặn 0.75)', () => {
    const goc = 'toi xin phan anh viec nha hang xom mo nhac rat to vao ban dem gay mat ngu cho ca xom nhieu ngay lien';
    const donThem = 'kinh gui quy co quan cong an xa toi xin phan anh viec nha hang xom mo nhac rat to vao ban dem gay mat ngu cho ca xom nhieu ngay lien mong quy co quan xem xet';

    assert.ok(doTuongDong(goc, donThem) >= 0.75, 'Độn câu chào là né được lớp chống trùng');
  });

  test('hai tin THẬT khác nhau cùng chủ đề KHÔNG bị chặn nhầm', () => {
    const a = 'duong tran hung dao doan qua cho co nhieu o ga lon xe may di qua rat de nga';
    const b = 'de nghi lap them den chieu sang tai khu vuc cong vien phuong vi ban dem rat toi';
    assert.ok(doTuongDong(a, b) < 0.75);
  });
});

describe('kiemTraTrungLapGanDung — dùng pool giả, không cần MySQL', () => {
  const NOI_DUNG = 'toi xin phan anh viec nha hang xom mo nhac rat to vao ban dem gay mat ngu cho ca xom nhieu ngay lien';

  test('không có tin nào gần đây -> không chặn, không đánh dấu', async () => {
    const kq = await kiemTraTrungLapGanDung(poolGia([[]]), NOI_DUNG, 'hash-ip-1');
    assert.deepEqual(kq, { chan: false, danhDau: false });
  });

  test('CÙNG IP + nội dung na ná -> CHẶN', async () => {
    const pool = poolGia([[{ original_content: NOI_DUNG, ip_address: 'hash-ip-1' }]]);
    const kq = await kiemTraTrungLapGanDung(pool, NOI_DUNG, 'hash-ip-1');

    assert.equal(kq.chan, true);
    assert.match(kq.lyDo, /mã tra cứu/);
  });

  test('KHÁC IP + nội dung na ná -> KHÔNG chặn, chỉ đánh dấu', async () => {
    // Có thể là nhiều người dân cùng phản ánh một vụ việc thật
    const pool = poolGia([[{ original_content: NOI_DUNG, ip_address: 'hash-ip-KHAC' }]]);
    const kq = await kiemTraTrungLapGanDung(pool, NOI_DUNG, 'hash-ip-1');

    assert.equal(kq.chan, false, 'Chặn nhầm = bịt miệng dân thật');
    assert.equal(kq.danhDau, true);
  });

  test('>= 4 tin na ná từ nhiều thiết bị -> ghi chú nghi gửi hàng loạt', async () => {
    const rows = Array.from({ length: 4 }, (_, i) => ({
      original_content: NOI_DUNG, ip_address: `hash-ip-${i + 2}`,
    }));
    const kq = await kiemTraTrungLapGanDung(poolGia([rows]), NOI_DUNG, 'hash-ip-1');

    assert.equal(kq.chan, false);
    assert.match(kq.ghiChu, /Nghi gửi hàng loạt/);
  });

  test('nội dung quá ngắn -> bỏ qua, không xét', async () => {
    const pool = poolGia([[{ original_content: 'a b c', ip_address: 'hash-ip-1' }]]);
    const kq = await kiemTraTrungLapGanDung(pool, 'a b c', 'hash-ip-1');
    assert.equal(kq.chan, false);
  });

  test('lỗi truy vấn KHÔNG được chặn người dân gửi ý kiến', async () => {
    const poolHong = { query: async () => { throw new Error('MySQL sập'); } };
    const kq = await kiemTraTrungLapGanDung(poolHong, NOI_DUNG, 'hash-ip-1');
    assert.deepEqual(kq, { chan: false, danhDau: false });
  });
});

describe('generateTrackingCode', () => {
  test('đúng 6 ký tự', () => {
    assert.equal(generateTrackingCode().length, 6);
  });

  test('KHÔNG chứa ký tự dễ đọc nhầm: 0 O 1 I L', () => {
    for (let i = 0; i < 500; i++) {
      assert.ok(
        !/[0O1IL]/.test(generateTrackingCode()),
        'Bà con đọc mã qua điện thoại, nhầm 0 với O là tra cứu không ra'
      );
    }
  });

  test('chỉ gồm chữ hoa và số', () => {
    assert.match(generateTrackingCode(), /^[A-Z0-9]{6}$/);
  });

  test('500 lần sinh ra ít nhất 400 mã khác nhau (đủ ngẫu nhiên)', () => {
    const tap = new Set(Array.from({ length: 500 }, () => generateTrackingCode()));
    assert.ok(tap.size > 400, `Chỉ có ${tap.size} mã khác nhau — nghi ngờ không ngẫu nhiên`);
  });
});

describe('sanitizeText / scanTextForThreats — lá chắn văn bản', () => {
  test('cắt đúng độ dài tối đa', () => {
    assert.equal(sanitizeText('a'.repeat(5000)).length, 2000);
    assert.equal(sanitizeText('a'.repeat(500), 100).length, 100);
  });

  test('bỏ ký tự điều khiển và ký tự vô hình', () => {
    assert.equal(sanitizeText('xin  chao​'), 'xin chao');
  });

  test('bắt thẻ script và mã JavaScript', () => {
    assert.equal(scanTextForThreats('<script>alert(1)</script>').safe, false);
    assert.equal(scanTextForThreats('javascript:alert(1)').safe, false);
    assert.equal(scanTextForThreats('<img onerror=alert(1)>').safe, false);
  });

  test('bắt mẫu tấn công SQL', () => {
    assert.equal(scanTextForThreats("' or 1=1").safe, false);
    assert.equal(scanTextForThreats('union select * from staff').safe, false);
  });

  test('văn bản bình thường của bà con -> an toàn', () => {
    const kq = scanTextForThreats('Đường Trần Hưng Đạo có ổ gà lớn, đề nghị xã cho sửa giúp.');
    assert.equal(kq.safe, true);
    assert.deepEqual(kq.reasons, []);
  });
});
