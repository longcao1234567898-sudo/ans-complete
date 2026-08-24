/**
 * TRI THỨC TRỢ LÝ PHẢI KHỚP VỚI HỆ THỐNG THẬT
 *
 * Đây là chỗ dễ mục ruỗng nhất trong cả dự án. Sửa mã nguồn sai thì kiểm thử
 * hoặc trình biên dịch báo ngay; sửa luồng nghiệp vụ mà quên sửa tri thức trợ
 * lý thì KHÔNG AI NHẮC — trợ lý cứ tiếp tục dặn bà con làm một việc không còn
 * tồn tại, mà lại dặn rất tự tin nên bà con không nghi ngờ gì.
 *
 * Đã xảy ra thật: xác thực email tắt từ lâu mà tri thức vẫn dặn "chờ mã 6 số
 * về email", bà con ngồi đợi một cái thư không bao giờ tới.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const doc = (p) => readFile(new URL(p, import.meta.url), 'utf8');
/* ⚠️ Tri thức ĐÃ TÁCH khỏi ai.js sang tệp riêng tri-thuc-tro-ly.js, để người
   bàn giao cho đơn vị mới mở đúng một tệp có tên nói rõ nội dung.
   Test này trỏ theo vị trí mới. Nếu sau này tách tiếp thì sửa ở đây. */
const AI = '../src/lib/tri-thuc-tro-ly.js';
const HANG_SO_FE = '../../src/utils/constants.ts';

/** Cắt đúng khối tri thức, không lẫn sang chú thích hay phần khác của tệp */
async function layTriThuc() {
  const ma = await doc(AI);
  const dau = ma.indexOf('HE_THONG_KNOWLEDGE = `');
  const cuoi = ma.indexOf('`;', dau);
  assert.ok(dau > 0 && cuoi > dau, 'không tìm thấy khối tri thức');
  return ma.slice(dau, cuoi);
}

describe('K1 — không dặn bà con chờ mã xác thực qua email', () => {
  test('cờ BAT_XAC_THUC_EMAIL đang tắt', async () => {
    const fe = await doc(HANG_SO_FE);
    assert.match(fe, /BAT_XAC_THUC_EMAIL\s*=\s*false/,
      'nếu bật lại xác thực email thì phải sửa lại tri thức trợ lý cho khớp');
  });

  test('tri thức không hứa gửi mã về email', async () => {
    const tt = await layTriThuc();
    assert.doesNotMatch(tt, /gửi mã\s*6?\s*số?\s*về email/i);
    assert.doesNotMatch(tt, /mã sống 10 phút/i);
    assert.doesNotMatch(tt, /Không nhận được email chứa mã/i);
  });

  test('tri thức nói rõ KHÔNG cần chờ mã email', async () => {
    const tt = await layTriThuc();
    assert.match(tt, /KHÔNG cần chờ mã xác thực qua email/);
  });
});

describe('K2 — không mô tả việc phân loại là do AI làm', () => {
  /* Phân loại chạy bằng bộ từ khoá ngay trong máy chủ. Trợ lý nói "AI đọc và
     gợi ý nhóm" là mô tả sai chính kiến trúc của hệ thống — đúng điểm mà hội
     đồng sẽ hỏi, và bà con thì hiểu nhầm rằng nội dung tố giác được gửi ra
     dịch vụ bên ngoài. */

  test('bước 2 nói là hệ thống đọc, không phải AI', async () => {
    const tt = await layTriThuc();
    const b2 = tt.slice(tt.indexOf('BƯỚC 2'), tt.indexOf('BƯỚC 3'));
    assert.doesNotMatch(b2, /\bAI\b/,
      'bước 2 vẫn mô tả phân loại là do AI làm');
    assert.match(b2, /TỪ KHOÁ/);
  });

  test('nói rõ nội dung không gửi ra dịch vụ AI bên ngoài', async () => {
    const tt = await layTriThuc();
    assert.match(tt, /KHÔNG gửi sang dịch vụ AI bên ngoài/);
  });
});

describe('K3 — không nói ẩn danh là mất liên lạc', () => {
  /* Hệ thống ĐÃ CÓ chat ẩn danh hai chiều bằng mã PIN. Câu cũ "gửi ẩn danh thì
     cán bộ KHÔNG LIÊN HỆ LẠI ĐƯỢC" nay vừa sai vừa có hại: nó làm người đang
     phân vân giữa ẩn danh và định danh chọn định danh, tức là chọn cách rủi ro
     hơn cho chính họ. */

  test('bỏ hẳn câu khẳng định không liên hệ lại được', async () => {
    const tt = await layTriThuc();
    assert.doesNotMatch(tt, /KHÔNG LIÊN HỆ LẠI ĐƯỢC/);
  });

  test('có mô tả phòng nhắn tin bằng mã PIN', async () => {
    const tt = await layTriThuc();
    assert.match(tt, /MÃ PIN 6 SỐ/);
    assert.match(tt, /PHÒNG NHẮN TIN/);
  });

  test('nói rõ PIN không cấp lại được', async () => {
    const tt = await layTriThuc();
    assert.match(tt, /không cấp lại|KHÔNG cấp lại/);
  });
});

describe('K4 — thông tin đơn vị lấy từ cấu hình, không gõ thẳng', () => {
  /* Gõ thẳng số điện thoại hay tên đơn vị vào tri thức thì đổi đơn vị xong trợ
     lý vẫn đọc thông tin cũ cho bà con. Trợ lý nói rất tự tin nên bà con gọi
     nhầm mà không nghi ngờ gì. */

  test('không có số điện thoại nào gõ thẳng trong tri thức', async () => {
    const tt = await layTriThuc();
    const so = tt.match(/\b0\d{2,3}[\s.]?\d{3,4}[\s.]?\d{3,4}\b/g) || [];
    assert.deepEqual(so, [], `số điện thoại gõ thẳng: ${so.join(', ')}`);
  });

  test('không có tên địa danh gõ thẳng trong tri thức', async () => {
    const tt = await layTriThuc();
    assert.doesNotMatch(tt, /Tân Châu|An Giang/);
  });

  test('có dùng biến UNIT trong tri thức', async () => {
    const tt = await layTriThuc();
    assert.match(tt, /\$\{UNIT\.name\}/);
  });
});

describe('K5 — hạn xử lý trong tri thức khớp với cơ sở dữ liệu', () => {
  /* Trợ lý hứa một đằng mà hệ thống tính hạn một nẻo thì bà con bắt lỗi được
     ngay, và đó là lỗi làm mất niềm tin nhanh nhất. */

  test('bốn mốc hạn đúng như bảng categories', async () => {
    const tt = await layTriThuc();
    const muc = tt.slice(tt.indexOf('## THỜI HẠN XỬ LÝ'), tt.indexOf('## MỨC ĐỘ KHẨN CẤP'));
    for (const [ten, ngay] of [['Tố giác', 20], ['Khiếu nại', 30],
                               ['Phản ánh', 15], ['Đề xuất', 10]]) {
      assert.match(muc, new RegExp(`${ten}[^\\n]*${ngay} ngày`),
        `hạn của nhóm ${ten} không khớp ${ngay} ngày`);
    }
  });
});
