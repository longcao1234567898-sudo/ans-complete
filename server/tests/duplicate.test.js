/**
 * KIỂM THỬ ĐƠN VỊ — lib/duplicate.js
 *
 * Module chống trùng lặp gần đúng. Kiểm thử HAI CHIỀU:
 *   1. Các mánh né tránh PHẢI bị bắt
 *   2. Tin thật khác nhau KHÔNG được chặn nhầm
 *
 * Chiều thứ 2 quan trọng không kém — chặn nhầm là oan cho người dân.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { chuanHoaManh, doTuongDong } from '../src/lib/duplicate.js';

/* Ngưỡng thật dùng trong hệ thống */
const NGUONG_CHAN = 0.75;   // cùng IP: giống từ 75% thì chặn

/* Nội dung gốc dùng làm mốc so sánh */
const GOC = 'Ông Nguyễn Văn A ở ấp Vĩnh Thạnh thường xuyên tổ chức đánh bạc ăn tiền tại nhà vào buổi tối';

describe('duplicate.js — Chống trùng lặp gần đúng', () => {

  describe('chuanHoaManh() — chuẩn hoá văn bản', () => {

    test('bỏ dấu tiếng Việt', () => {
      assert.equal(chuanHoaManh('Đánh bạc'), 'danh bac');
    });

    test('chuyển về chữ thường', () => {
      assert.equal(chuanHoaManh('ĐÁNH BẠC'), 'danh bac');
    });

    test('bỏ mọi dấu câu và ký hiệu', () => {
      assert.equal(chuanHoaManh('Đánh bạc!!!'), 'danh bac');
      assert.equal(chuanHoaManh('Đánh, bạc.'), 'danh bac');
    });

    test('gộp nhiều khoảng trắng thành một', () => {
      assert.equal(chuanHoaManh('Đánh    bạc'), 'danh bac');
    });

    /* Đây là mục đích chính: mọi biến thể "trang trí" của cùng
       một nội dung phải ra CÙNG MỘT chuỗi */
    test('mọi biến thể của cùng nội dung ra cùng một chuỗi', () => {
      const bienThe = [
        'Đánh bạc tại nhà',
        'ĐÁNH BẠC TẠI NHÀ',
        'danh bac tai nha',
        'Đánh bạc, tại nhà!',
        '  Đánh   bạc  tại nhà  ',
      ];
      const chuan = bienThe.map(chuanHoaManh);
      const dauTien = chuan[0];
      for (const c of chuan) {
        assert.equal(c, dauTien, 'Các biến thể không ra cùng chuỗi');
      }
    });

    test('giữ lại chữ số (quan trọng: biển số, ngày tháng)', () => {
      assert.ok(chuanHoaManh('Biển số 67A-12345').includes('67'));
    });

    test('xử lý được chuỗi rỗng và null', () => {
      assert.doesNotThrow(() => chuanHoaManh(''));
      assert.doesNotThrow(() => chuanHoaManh(null));
      assert.doesNotThrow(() => chuanHoaManh(undefined));
    });
  });

  describe('doTuongDong() — PHẢI BẮT các mánh né tránh', () => {

    test('nội dung giống hệt → 1.00', () => {
      assert.equal(doTuongDong(GOC, GOC), 1);
    });

    test('thêm dấu chấm cuối câu → vẫn bị bắt', () => {
      const diem = doTuongDong(GOC, GOC + '.');
      assert.ok(diem >= NGUONG_CHAN, `Lọt! điểm = ${diem}`);
    });

    test('bỏ hết dấu tiếng Việt → vẫn bị bắt', () => {
      const khongDau = 'Ong Nguyen Van A o ap Vinh Thanh thuong xuyen to chuc danh bac an tien tai nha vao buoi toi';
      const diem = doTuongDong(GOC, khongDau);
      assert.ok(diem >= NGUONG_CHAN, `Lọt! điểm = ${diem}`);
    });

    test('viết HOA toàn bộ → vẫn bị bắt', () => {
      const diem = doTuongDong(GOC, GOC.toUpperCase());
      assert.ok(diem >= NGUONG_CHAN, `Lọt! điểm = ${diem}`);
    });

    test('chèn thêm 1 chữ → vẫn bị bắt', () => {
      const them1 = GOC.replace('thường xuyên', 'thường xuyên hay');
      const diem = doTuongDong(GOC, them1);
      assert.ok(diem >= NGUONG_CHAN, `Lọt! điểm = ${diem}`);
    });

    test('chèn thêm 3 chữ → vẫn bị bắt', () => {
      const them3 = 'Kính gửi quý cơ quan, ' + GOC + ' ạ';
      const diem = doTuongDong(GOC, them3);
      assert.ok(diem >= NGUONG_CHAN, `Lọt! điểm = ${diem}`);
    });

    /* Mánh tinh vi nhất: độn cả đoạn chào hỏi dài để làm loãng phép đo.
       Phép Jaccard thuần sẽ bị qua mặt — cần phép BAO HÀM mới bắt được. */
    test('độn cả đoạn chào hỏi dài → vẫn bị bắt (nhờ phép bao hàm)', () => {
      const donDai = 'Kính gửi quý cơ quan công an thị xã, tôi là người dân địa phương, ' +
        'tôi xin trân trọng phản ánh sự việc như sau: ' + GOC +
        '. Mong quý cơ quan xem xét giải quyết. Tôi xin chân thành cảm ơn.';
      const diem = doTuongDong(GOC, donDai);
      assert.ok(diem >= NGUONG_CHAN, `Lọt! điểm = ${diem}`);
    });

    test('đảo thứ tự câu → vẫn bị bắt', () => {
      const daoThuTu = 'Tại nhà vào buổi tối, ông Nguyễn Văn A ở ấp Vĩnh Thạnh thường xuyên tổ chức đánh bạc ăn tiền';
      const diem = doTuongDong(GOC, daoThuTu);
      assert.ok(diem >= NGUONG_CHAN, `Lọt! điểm = ${diem}`);
    });
  });

  describe('doTuongDong() — KHÔNG ĐƯỢC chặn nhầm tin thật', () => {

    /* Đây là chiều kiểm thử quan trọng không kém.
       Chặn nhầm người dân thật còn tệ hơn để lọt vài tin spam. */

    test('hai vụ ổ gà ở hai con đường KHÁC NHAU → cho qua', () => {
      const a = 'Đường Trần Hưng Đạo có ổ gà lớn gây nguy hiểm cho xe máy';
      const b = 'Đường Nguyễn Huệ có ổ gà lớn gây nguy hiểm cho xe máy';
      const diem = doTuongDong(a, b);
      assert.ok(diem < NGUONG_CHAN, `CHẶN NHẦM! điểm = ${diem}`);
    });

    test('hai vụ đánh bạc ở hai nơi KHÁC NHAU → cho qua', () => {
      const a = 'Ông A ở ấp 1 tổ chức đánh bạc tại nhà vào buổi tối';
      const b = 'Ông B ở ấp 3 tổ chức đánh bạc tại quán nước ban đêm';
      const diem = doTuongDong(a, b);
      assert.ok(diem < NGUONG_CHAN, `CHẶN NHẦM! điểm = ${diem}`);
    });

    test('hai câu hỏi thủ tục KHÁC NHAU → cho qua', () => {
      const a = 'Xin hỏi thủ tục làm căn cước công dân cần giấy tờ gì';
      const b = 'Xin hỏi thủ tục đăng ký tạm trú cần giấy tờ gì';
      const diem = doTuongDong(a, b);
      assert.ok(diem < NGUONG_CHAN, `CHẶN NHẦM! điểm = ${diem}`);
    });

    test('hai vụ tiếng ồn khác nhau hoàn toàn → điểm rất thấp', () => {
      const a = 'Quán karaoke gần chợ mở nhạc to quá 12 giờ đêm gây mất ngủ';
      const b = 'Xe tải chở vật liệu chạy qua khu dân cư làm rung nhà';
      const diem = doTuongDong(a, b);
      assert.ok(diem < 0.3, `Điểm quá cao cho 2 nội dung khác hẳn: ${diem}`);
    });

    test('nội dung hoàn toàn khác chủ đề → gần 0', () => {
      const a = 'Đường có ổ gà nguy hiểm';
      const b = 'Xin hỏi thủ tục làm hộ chiếu';
      assert.ok(doTuongDong(a, b) < 0.2);
    });
  });

  describe('doTuongDong() — trường hợp biên', () => {

    test('chuỗi rỗng không gây lỗi', () => {
      assert.doesNotThrow(() => doTuongDong('', ''));
      assert.equal(doTuongDong('', 'abc def'), 0);
    });

    test('null và undefined không gây lỗi', () => {
      assert.doesNotThrow(() => doTuongDong(null, 'abc'));
      assert.doesNotThrow(() => doTuongDong(undefined, 'abc'));
    });

    test('điểm luôn nằm trong khoảng 0 đến 1', () => {
      const cap = [
        [GOC, GOC],
        [GOC, 'hoàn toàn khác'],
        ['a b c', 'a b d'],
      ];
      for (const [a, b] of cap) {
        const d = doTuongDong(a, b);
        assert.ok(d >= 0 && d <= 1, `Điểm ngoài khoảng: ${d}`);
      }
    });

    test('phép đo có tính đối xứng', () => {
      const a = 'Đường có ổ gà';
      const b = 'Đường có ổ gà lớn';
      assert.equal(doTuongDong(a, b), doTuongDong(b, a));
    });
  });
});
